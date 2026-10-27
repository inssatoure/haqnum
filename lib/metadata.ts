'use client';

// Lecture des métadonnées d'un fichier importé : heure de prise de vue / d'enregistrement, GPS, durée.
// - Photos : EXIF (exifr)
// - Audios Dictaphone (.m4a) et vidéos (.mov/.mp4) : atome « mvhd » du conteneur MP4

import exifr from 'exifr';

export interface FileMeta {
  capturedAt: string | null;
  timeSource: 'exif' | 'mp4' | 'fichier' | 'maintenant';
  lat: number | null;
  lng: number | null;
  durationS: number | null;
  exif: Record<string, unknown> | null;
}

export async function readFileMeta(file: File): Promise<FileMeta> {
  const out: FileMeta = { capturedAt: null, timeSource: 'maintenant', lat: null, lng: null, durationS: null, exif: null };
  const type = file.type || '';
  const name = file.name.toLowerCase();
  const isImage = type.startsWith('image/') || /\.(jpe?g|heic|heif|png)$/.test(name);
  const isMp4 = /(mp4|quicktime|m4a|x-m4a|aac)/.test(type) || /\.(m4a|mp4|mov|m4v)$/.test(name);

  if (isImage) {
    try {
      const ex = await exifr.parse(file, { gps: true, tiff: true, exif: true, pick: undefined } as any);
      if (ex) {
        const dt: Date | undefined = ex.DateTimeOriginal || ex.CreateDate || ex.ModifyDate;
        if (dt instanceof Date && !isNaN(dt.getTime())) {
          // L'EXIF n'a pas toujours de fuseau : OffsetTimeOriginal le donne sur iPhone.
          out.capturedAt = withExifOffset(dt, ex.OffsetTimeOriginal || ex.OffsetTime);
          out.timeSource = 'exif';
        }
        if (typeof ex.latitude === 'number' && typeof ex.longitude === 'number') {
          out.lat = ex.latitude;
          out.lng = ex.longitude;
        }
        out.exif = pickExif(ex);
      }
    } catch {
      /* pas d'EXIF */
    }
  }

  if (isMp4) {
    try {
      const mv = await readMp4Header(file);
      if (mv.created) {
        out.capturedAt = mv.created.toISOString();
        out.timeSource = 'mp4';
      }
      if (mv.duration) out.durationS = mv.duration;
      if (mv.lat != null && mv.lng != null) {
        out.lat = mv.lat;
        out.lng = mv.lng;
      }
    } catch {
      /* conteneur illisible */
    }
  }

  if (!out.capturedAt && file.lastModified) {
    out.capturedAt = new Date(file.lastModified).toISOString();
    out.timeSource = 'fichier';
  }
  if (!out.capturedAt) out.capturedAt = new Date().toISOString();
  return out;
}

function withExifOffset(d: Date, offset?: string): string {
  // exifr renvoie une date « locale » de l'appareil qui lit le fichier ; on la recale si l'offset est connu.
  if (!offset || !/^[+-]\d{2}:\d{2}$/.test(offset)) return d.toISOString();
  const local = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));
  const sign = offset[0] === '-' ? -1 : 1;
  const mins = sign * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)));
  return new Date(local.getTime() - mins * 60_000).toISOString();
}

function pickExif(ex: any): Record<string, unknown> {
  const keys = ['Make', 'Model', 'LensModel', 'DateTimeOriginal', 'OffsetTimeOriginal', 'ExifImageWidth', 'ExifImageHeight', 'latitude', 'longitude', 'GPSAltitude', 'Software'];
  const o: Record<string, unknown> = {};
  for (const k of keys) if (ex[k] !== undefined) o[k] = ex[k] instanceof Date ? ex[k].toISOString() : ex[k];
  return o;
}

// ------------------------------------------------------------------
// Petit lecteur MP4 : on parcourt les boîtes jusqu'à moov/mvhd (+ ©xyz pour le GPS des vidéos iPhone).
// ------------------------------------------------------------------
const MP4_EPOCH = Date.UTC(1904, 0, 1);

async function readSlice(file: Blob, start: number, len: number): Promise<DataView> {
  const buf = await file.slice(start, start + len).arrayBuffer();
  return new DataView(buf);
}

interface Mp4Info {
  created: Date | null;
  duration: number | null;
  lat: number | null;
  lng: number | null;
}

export async function readMp4Header(file: Blob): Promise<Mp4Info> {
  const info: Mp4Info = { created: null, duration: null, lat: null, lng: null };
  // Trouver « moov » au premier niveau (souvent à la fin pour les fichiers Dictaphone).
  let pos = 0;
  let moov: { start: number; size: number } | null = null;
  for (let guard = 0; pos < file.size && guard < 10000; guard++) {
    const h = await readSlice(file, pos, 16);
    if (h.byteLength < 8) break;
    let size = h.getUint32(0);
    const type = fourcc(h, 4);
    let header = 8;
    if (size === 1) {
      size = Number(h.getBigUint64(8));
      header = 16;
    } else if (size === 0) size = file.size - pos;
    if (type === 'moov') {
      moov = { start: pos + header, size: size - header };
      break;
    }
    if (size < 8) break;
    pos += size;
  }
  if (!moov) return info;
  const view = await readSlice(file, moov.start, Math.min(moov.size, 4 * 1024 * 1024));
  walk(view, 0, view.byteLength, info);
  return info;
}

function fourcc(v: DataView, o: number) {
  return String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
}

function walk(v: DataView, start: number, end: number, info: Mp4Info) {
  let p = start;
  while (p + 8 <= end) {
    const size = v.getUint32(p);
    const type = fourcc(v, p + 4);
    if (size < 8 || p + size > end) break;
    if (type === 'mvhd') {
      const version = v.getUint8(p + 8);
      if (version === 1) {
        const created = Number(v.getBigUint64(p + 12));
        const timescale = v.getUint32(p + 28);
        const duration = Number(v.getBigUint64(p + 32));
        setTimes(info, created, timescale, duration);
      } else {
        const created = v.getUint32(p + 12);
        const timescale = v.getUint32(p + 20);
        const duration = v.getUint32(p + 24);
        setTimes(info, created, timescale, duration);
      }
    } else if (type === 'udta' || type === 'meta' || type === 'ilst' || type === 'trak') {
      // « meta » a 4 octets de version/flags dans les fichiers QuickTime de type ISO
      const inner = type === 'meta' && fourcc(v, p + 12) !== 'hdlr' ? p + 12 : p + 8;
      walk(v, inner, p + size, info);
    } else if (type === '©xyz') {
      // Ex. « +43.5249+005.4437/ »
      const len = v.getUint16(p + 8);
      let s = '';
      for (let i = 0; i < len; i++) s += String.fromCharCode(v.getUint8(p + 12 + i));
      parseIso6709(s, info);
    }
    p += size;
  }
}

function setTimes(info: Mp4Info, created: number, timescale: number, duration: number) {
  if (created > 0) {
    const d = new Date(MP4_EPOCH + created * 1000);
    // Ignorer les dates absurdes (certains encodeurs mettent 0 ou 1970)
    if (d.getUTCFullYear() > 2005 && d.getUTCFullYear() < 2100) info.created = d;
  }
  if (timescale > 0 && duration > 0) info.duration = duration / timescale;
}

function parseIso6709(s: string, info: Mp4Info) {
  const m = s.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (m) {
    info.lat = Number(m[1]);
    info.lng = Number(m[2]);
  }
}

/** Position actuelle (rapide, avec délai max) */
export function currentPosition(timeoutMs = 6000): Promise<{ lat: number; lng: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(lastPos), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(t);
        lastPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        resolve(lastPos);
      },
      () => {
        clearTimeout(t);
        resolve(lastPos);
      },
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: timeoutMs },
    );
  });
}
let lastPos: { lat: number; lng: number } | null = null;
