'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '@/lib/db';
import { dayKey, heure, jourCourt } from '@/lib/time';
import { matchAuthor, useActivities, useAuthorFilter, useMe, useProfiles } from '../hooks';
import { AuthorFilterBar, colorOf, cx, Select, Title } from '../ui';

const COLORS = { issa: '#E3A75E', moctar: '#3FB8A5', nuit: '#C6D1E1', lieu: '#C0532F' };

/** Carte Leaflet + OpenStreetMap : lieux du programme, œuvres, photos, vidéos, rencontres. */
export default function MapScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const acts = useActivities();
  const me = useMe();
  const profiles = useProfiles();
  const { value: filter } = useAuthorFilter();
  const [day, setDay] = useState('tous');
  const [city, setCity] = useState('toutes');
  const [type, setType] = useState('tout');
  const media = useLiveQuery(async () => (await db().media.toArray()).filter((m) => !m.deleted_at && m.lat != null), []) ?? [];
  const fiches = useLiveQuery(async () => (await db().fiches.toArray()).filter((f) => !f.deleted_at && f.lat != null), []) ?? [];
  const contacts = useLiveQuery(async () => (await db().contacts.toArray()).filter((c) => !c.deleted_at && c.activity_id), []) ?? [];
  const days = useMemo(() => [...new Set(acts.map((a) => dayKey(a.starts_at)))].sort(), [acts]);
  const cities = useMemo(() => [...new Set(acts.map((a) => a.city).filter(Boolean) as string[])].sort(), [acts]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const L = (await import('leaflet')).default;
      if (!alive || !ref.current || mapRef.current) return;
      const map = L.map(ref.current, { zoomControl: true }).setView([43.5, 5.1], 8);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      draw();
    })();
    return () => {
      alive = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const draw = async () => {
    const L = (await import('leaflet')).default;
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();
    const okDay = (iso: string) => day === 'tous' || dayKey(iso) === day;
    const actOk = (a: any) => okDay(a.starts_at) && (city === 'toutes' || a.city === city);
    const bounds: [number, number][] = [];
    const dot = (lat: number, lng: number, color: string, html: string, r = 8) => {
      L.circleMarker([lat, lng], { radius: r, color: '#070D18', weight: 2, fillColor: color, fillOpacity: 0.95 }).bindPopup(html).addTo(layer);
      bounds.push([lat, lng]);
    };
    if (type === 'tout' || type === 'lieux') {
      const seen = new Map<string, any[]>();
      for (const a of acts.filter(actOk)) if (a.lat != null) {
        const k = `${a.lat},${a.lng}`;
        if (!seen.has(k)) seen.set(k, []);
        seen.get(k)!.push(a);
      }
      for (const [, list] of seen) {
        const a = list[0];
        dot(a.lat!, a.lng!, COLORS.lieu, `<b>${a.venue}</b><br/>${list.map((x) => `${jourCourt(x.starts_at)} ${heure(x.starts_at)} · <a href="#/activite/${x.id}">${x.title}</a>`).join('<br/>')}`, 10);
      }
    }
    const author = (id: string | null) => COLORS[colorOf(profiles[id ?? ''])];
    if (type === 'tout' || type === 'medias') {
      for (const m of media) {
        if (!okDay(m.captured_at) || !matchAuthor(m.author_id, filter, me?.id)) continue;
        if (city !== 'toutes' && acts.find((a) => a.id === m.activity_id)?.city !== city) continue;
        dot(m.lat!, m.lng!, author(m.author_id), `<a href="#/media/${m.id}">${m.kind} · ${heure(m.captured_at)}</a><br/>${profiles[m.author_id ?? '']?.short_name ?? ''}`, 6);
      }
    }
    if (type === 'tout' || type === 'oeuvres') {
      for (const f of fiches) {
        if (!okDay(f.created_at) || (f.author_id && !matchAuthor(f.author_id, filter, me?.id))) continue;
        dot(f.lat!, f.lng!, '#F4ECDF', `<a href="#/fiche/${f.id}"><b>${f.title}</b></a><br/>${f.type}`, 7);
      }
    }
    if (type === 'tout' || type === 'rencontres') {
      for (const c of contacts) {
        const a = acts.find((x) => x.id === c.activity_id);
        if (!a || a.lat == null || !actOk(a) || !matchAuthor(c.author_id, filter, me?.id)) continue;
        dot(a.lat + (Math.random() - 0.5) * 0.0006, a.lng! + (Math.random() - 0.5) * 0.0006, author(c.author_id), `<a href="#/contact/${c.id}">${c.name}</a><br/>${c.organization ?? ''}`, 5);
      }
    }
    if (bounds.length) mapRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 15 });
  };

  useEffect(() => {
    void draw();
  }, [day, city, type, filter, media.length, fiches.length, contacts.length, acts.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <Title>Carte</Title>
      <div className="mb-2 grid grid-cols-3 gap-2">
        <Select value={day} onChange={(e) => setDay(e.target.value)}>
          <option value="tous">Tous les jours</option>
          {days.map((d) => <option key={d} value={d}>{jourCourt(d + 'T12:00:00Z')}</option>)}
        </Select>
        <Select value={city} onChange={(e) => setCity(e.target.value)}>
          <option value="toutes">Toutes villes</option>
          {cities.map((c) => <option key={c}>{c}</option>)}
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="tout">Tout</option>
          <option value="lieux">Lieux</option>
          <option value="medias">Photos/vidéos</option>
          <option value="oeuvres">Œuvres</option>
          <option value="rencontres">Rencontres</option>
        </Select>
      </div>
      <AuthorFilterBar />
      <div ref={ref} className={cx('h-[60vh] w-full overflow-hidden rounded-2xl')} />
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-nuit-200">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: COLORS.lieu }} />Lieux</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-issa" />Issa</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-moctar" />Moctar</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-full bg-sable" />Œuvres</span>
      </div>
    </div>
  );
}
