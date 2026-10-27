'use client';

import { useLiveQuery } from 'dexie-react-hooks';
import { createContext, useContext, useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { currentUser, onUser, type Me } from '@/lib/session';
import { getSyncStatus, onSyncStatus, type SyncStatus } from '@/lib/sync';
import type { Activity, Profile } from '@/lib/types';

export function useMe(): Me | null {
  const [me, setMe] = useState<Me | null>(currentUser());
  useEffect(() => {
    const off = onUser(setMe);
    return () => {
      off();
    };
  }, []);
  return me;
}

export function useProfiles(): Record<string, Profile> {
  const list = useLiveQuery(() => db().profiles.toArray(), []) ?? [];
  const map: Record<string, Profile> = {};
  for (const p of list) map[p.id] = p;
  return map;
}

export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useActivities(): Activity[] {
  return (
    useLiveQuery(async () => (await db().activities.orderBy('starts_at').toArray()).filter((a) => !a.deleted_at), []) ?? []
  );
}

export function useSyncStatus(): SyncStatus {
  const [s, setS] = useState<SyncStatus>(getSyncStatus());
  useEffect(() => {
    const off = onSyncStatus(setS);
    return () => {
      off();
    };
  }, []);
  return s;
}

// ---------------------------------------------------------------
// Navigation simple par hash : une seule page HTML = fonctionne hors ligne.
// ---------------------------------------------------------------
export function parseHash(): { name: string; id?: string; query: URLSearchParams } {
  if (typeof window === 'undefined') return { name: 'maintenant', query: new URLSearchParams() };
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const [name, id] = path.split('/');
  return { name: name || 'maintenant', id, query: new URLSearchParams(qs ?? '') };
}

export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => {
    const on = () => setR(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return r;
}

export function go(path: string) {
  window.location.hash = `#/${path.replace(/^\//, '')}`;
}

// ---------------------------------------------------------------
// Filtre par auteur (Mon travail / Travail de l'autre / Tout)
// ---------------------------------------------------------------
export type AuthorFilter = 'tout' | 'moi' | 'autres';
export const AuthorFilterContext = createContext<{ value: AuthorFilter; set: (v: AuthorFilter) => void }>({
  value: 'tout',
  set: () => {},
});
export const useAuthorFilter = () => useContext(AuthorFilterContext);

export function matchAuthor(authorId: string | null | undefined, f: AuthorFilter, meId?: string): boolean {
  if (f === 'tout') return true;
  if (f === 'moi') return authorId === meId;
  return authorId !== meId;
}
