'use client';

// Enregistreur du mode Débat.
// - Chaque morceau (~45 s) est un fichier audio complet et lisible, sauvegardé tout de suite dans IndexedDB.
//   (on arrête et relance MediaRecorder : plus fiable sur Safari iOS que le découpage « timeslice »)
// - L'état est écrit dans IndexedDB : si l'app est coupée, on le voit à la réouverture.
// - Écran gardé allumé avec l'API Wake Lock.

import { CHUNK_MS } from './config';
import { db, getMeta, setMeta } from './db';
import { extFromMime, storeBlob } from './media';
import { create, update } from './repo';
import type { Media, MediaPart } from './types';

export interface RecState {
  mediaId: string;
  startedAt: string;
  partCount: number;
  savedSeconds: number;
  segmentStartedAt: number | null;
  lastChunkAt: string;
}

export type RecPhase = 'idle' | 'recording' | 'paused' | 'interrupted';

const STATE_KEY = 'recording_state';

let silenceUrl: string | null = null;
/** Une seconde de silence (WAV 8 kHz, 8 bits) : lue en boucle pour garder la session audio active. */
function silentWavUrl(): string {
  if (silenceUrl) return silenceUrl;
  const rate = 8000;
  const buf = new ArrayBuffer(44 + rate);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + rate, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, rate, true);
  new Uint8Array(buf, 44).fill(128); // 128 = silence en PCM 8 bits
  silenceUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silenceUrl;
}

/** Format audio accepté par ce navigateur (Safari iOS : audio/mp4 = AAC). */
export function pickAudioMime(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = ['audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return '';
}

export async function getInterruptedRecording(): Promise<(RecState & { media?: Media }) | null> {
  const st = await getMeta<RecState | null>(STATE_KEY);
  if (!st) return null;
  const media = await db().media.get(st.mediaId);
  return { ...st, media };
}

export class DebateRecorder {
  phase: RecPhase = 'idle';
  state: RecState | null = null;
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private chunkTimer: ReturnType<typeof setTimeout> | null = null;
  private wake: any = null;
  private mime = '';
  private stopping = false;
  private pendingSave: Promise<void> = Promise.resolve();
  private keepAlive: HTMLAudioElement | null = null;
  /** L'iPhone a coupé le micro (verrouillage, appel…) : on le signale à l'écran. */
  muted = false;
  onChange: () => void = () => {};
  onError: (msg: string) => void = () => {};

  /** Démarre un nouvel enregistrement ou reprend un enregistrement interrompu. */
  async start(opts: { activityId: string | null; title: string; resumeMediaId?: string }) {
    this.mime = pickAudioMime();
    if (!this.mime && typeof MediaRecorder === 'undefined') throw new Error("Ce navigateur ne peut pas enregistrer l'audio.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } as any,
    });
    this.muted = false;
    this.stream.getAudioTracks().forEach((t) => {
      t.onended = () => this.handleTrackEnded();
      // Safari coupe le micro sans « ended » : la piste est alors muette et l'enregistrement serait vide.
      t.onmute = () => {
        this.muted = true;
        if (this.phase === 'recording') this.flush();
        this.onChange();
      };
      t.onunmute = () => {
        this.muted = false;
        this.onChange();
      };
    });

    if (opts.resumeMediaId) {
      const st = await getMeta<RecState>(STATE_KEY);
      const m = await db().media.get(opts.resumeMediaId);
      this.state = st && st.mediaId === opts.resumeMediaId
        ? st
        : { mediaId: opts.resumeMediaId, startedAt: m?.captured_at ?? new Date().toISOString(), partCount: m?.parts.length ?? 0, savedSeconds: m?.duration_s ?? 0, segmentStartedAt: null, lastChunkAt: new Date().toISOString() };
      await update('media', opts.resumeMediaId, { status: 'enregistrement' });
    } else {
      const startedAt = new Date().toISOString();
      const m = await create('media', {
        kind: 'audio',
        source: 'debate',
        activity_id: opts.activityId,
        title: opts.title,
        mime: this.mime || 'audio/mp4',
        captured_at: startedAt,
        time_source: 'appareil',
        parts: [],
        frames: [],
        duration_s: 0,
        size_bytes: 0,
        status: 'enregistrement',
      });
      this.state = { mediaId: m.id, startedAt, partCount: 0, savedSeconds: 0, segmentStartedAt: null, lastChunkAt: startedAt };
    }
    await setMeta(STATE_KEY, this.state);
    await this.keepAwake();
    this.startKeepAlive(opts.title);
    this.startChunk();
    this.phase = 'recording';
    this.onChange();
  }

  private startChunk() {
    if (!this.stream || !this.state) return;
    const rec = this.mime ? new MediaRecorder(this.stream, { mimeType: this.mime, audioBitsPerSecond: 64000 }) : new MediaRecorder(this.stream);
    const data: Blob[] = [];
    const chunkStart = Date.now();
    this.state.segmentStartedAt = chunkStart;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) data.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(data, { type: rec.mimeType || this.mime || 'audio/mp4' });
      const seconds = (Date.now() - chunkStart) / 1000;
      this.pendingSave = this.pendingSave.then(() => this.saveChunk(blob, seconds, new Date(chunkStart).toISOString()));
      if (!this.stopping && this.phase === 'recording') this.startChunk();
    };
    rec.onerror = (e: any) => this.onError(e?.error?.message ?? 'Erreur micro');
    rec.start();
    this.rec = rec;
    if (this.chunkTimer) clearTimeout(this.chunkTimer);
    this.chunkTimer = setTimeout(() => {
      if (rec.state === 'recording') rec.stop();
    }, CHUNK_MS);
  }

  private async saveChunk(blob: Blob, seconds: number, startedAt: string) {
    if (!this.state || blob.size === 0) return;
    const st = this.state;
    const i = st.partCount + 1;
    const mime = blob.type || this.mime || 'audio/mp4';
    const file = `part-${String(i).padStart(4, '0')}.${extFromMime(mime)}`;
    const path = await storeBlob(st.mediaId, file, blob, mime);
    const m = await db().media.get(st.mediaId);
    const part: MediaPart = { i, path, mime, size: blob.size, started_at: startedAt, duration_s: Math.round(seconds * 10) / 10 };
    const parts = [...(m?.parts ?? []), part];
    st.partCount = i;
    st.savedSeconds += seconds;
    st.lastChunkAt = new Date().toISOString();
    await update('media', st.mediaId, {
      parts,
      mime,
      duration_s: Math.round(st.savedSeconds),
      size_bytes: parts.reduce((a, p) => a + p.size, 0),
    });
    await setMeta(STATE_KEY, st);
    this.onChange();
  }

  /** Secondes enregistrées (sauvegardées + morceau en cours). */
  elapsed(): number {
    if (!this.state) return 0;
    const live = this.phase === 'recording' && this.state.segmentStartedAt ? (Date.now() - this.state.segmentStartedAt) / 1000 : 0;
    return this.state.savedSeconds + live;
  }

  /** Force la sauvegarde du morceau en cours (ex. l'app passe en arrière-plan). */
  flush() {
    if (this.rec && this.rec.state === 'recording') {
      if (this.chunkTimer) clearTimeout(this.chunkTimer);
      this.rec.stop();
    }
  }

  async pause() {
    if (this.phase !== 'recording') return;
    this.phase = 'paused';
    if (this.chunkTimer) clearTimeout(this.chunkTimer);
    if (this.rec?.state === 'recording') this.rec.stop();
    await this.pendingSave;
    this.onChange();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = 'recording';
    this.startChunk();
    this.onChange();
  }

  async stop(): Promise<string | null> {
    this.stopping = true;
    if (this.chunkTimer) clearTimeout(this.chunkTimer);
    if (this.rec && this.rec.state !== 'inactive') {
      await new Promise<void>((res) => {
        const r = this.rec!;
        const prev = r.onstop;
        r.onstop = (ev) => {
          (prev as any)?.call(r, ev);
          res();
        };
        r.stop();
      });
    }
    await this.pendingSave;
    const id = this.state?.mediaId ?? null;
    if (id) await update('media', id, { status: 'local' });
    await setMeta(STATE_KEY, null);
    this.release();
    this.phase = 'idle';
    this.state = null;
    this.stopping = false;
    this.onChange();
    return id;
  }

  /** Le micro a été coupé (appel, verrouillage, autre app) */
  private handleTrackEnded() {
    if (this.phase === 'idle') return;
    this.phase = 'interrupted';
    if (this.chunkTimer) clearTimeout(this.chunkTimer);
    this.onChange();
  }

  /**
   * Essai d'arrière-plan : un son silencieux en boucle + une fiche « lecture en cours » sur l'écran verrouillé.
   * Sur iPhone, Apple peut quand même couper le micro : on le détecte (muted / ended) et on propose de reprendre.
   */
  private startKeepAlive(title: string) {
    try {
      const a = new Audio(silentWavUrl());
      a.loop = true;
      (a as any).playsInline = true;
      void a.play().catch(() => {});
      this.keepAlive = a;
      const ms = (navigator as any).mediaSession;
      if (ms) {
        ms.metadata = new (window as any).MediaMetadata({ title: title || 'Enregistrement en cours', artist: 'MIN Observateur' });
        ms.playbackState = 'playing';
        ms.setActionHandler?.('pause', () => void this.pause());
        ms.setActionHandler?.('play', () => this.resume());
      }
    } catch {
      /* non supporté : sans conséquence */
    }
  }

  private stopKeepAlive() {
    try {
      this.keepAlive?.pause();
      const ms = (navigator as any).mediaSession;
      if (ms) {
        ms.playbackState = 'none';
        ms.metadata = null;
        ms.setActionHandler?.('pause', null);
        ms.setActionHandler?.('play', null);
      }
    } catch {
      /* ignore */
    }
    this.keepAlive = null;
  }

  /** Le micro est-il encore actif ? (Safari le coupe quand l'app passe en arrière-plan) */
  micAlive(): boolean {
    return Boolean(this.stream?.getAudioTracks().some((t) => t.readyState === 'live' && !t.muted));
  }

  /** Après une coupure : marque l'enregistrement comme interrompu (les morceaux restent). */
  async markInterrupted() {
    if (this.chunkTimer) clearTimeout(this.chunkTimer);
    await this.pendingSave;
    if (this.state) await update('media', this.state.mediaId, { status: 'interrompu' });
    this.release();
    this.phase = 'interrupted';
    this.onChange();
  }

  private release() {
    this.stopKeepAlive();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.rec = null;
    try {
      this.wake?.release?.();
    } catch {
      /* ignore */
    }
    this.wake = null;
  }

  async keepAwake() {
    try {
      if ('wakeLock' in navigator) this.wake = await (navigator as any).wakeLock.request('screen');
    } catch {
      /* refusé : l'écran peut s'éteindre, on le dit dans l'interface */
    }
  }

  hasWakeLock() {
    return Boolean(this.wake && !this.wake.released);
  }
}

/** Ferme proprement un enregistrement interrompu trouvé au démarrage. */
export async function closeInterrupted(mediaId: string) {
  await update('media', mediaId, { status: 'interrompu' });
  await setMeta(STATE_KEY, null);
}

// ------------------------------------------------------------------
// Note vocale courte (liée à une photo / vidéo / fiche)
// ------------------------------------------------------------------
export class QuickRecorder {
  private stream: MediaStream | null = null;
  private rec: MediaRecorder | null = null;
  private data: Blob[] = [];
  startedAt = 0;

  async start() {
    const mime = pickAudioMime();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.rec = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.data = [];
    this.rec.ondataavailable = (e) => e.data.size && this.data.push(e.data);
    this.rec.start();
    this.startedAt = Date.now();
  }

  async stop(): Promise<{ blob: Blob; seconds: number }> {
    const rec = this.rec!;
    await new Promise<void>((res) => {
      rec.onstop = () => res();
      rec.stop();
    });
    this.stream?.getTracks().forEach((t) => t.stop());
    const blob = new Blob(this.data, { type: rec.mimeType || 'audio/mp4' });
    return { blob, seconds: (Date.now() - this.startedAt) / 1000 };
  }

  cancel() {
    try {
      this.rec?.stop();
    } catch {
      /* ignore */
    }
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
