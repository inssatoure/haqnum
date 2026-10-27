'use client';

// Écriture locale : chaque élément reçoit auteur, appareil, dates, et part dans la file de synchronisation.

import { MISSION_ID } from './config';
import { db } from './db';
import { currentUser, deviceName } from './session';
import type { SyncTable } from './types';
import { requestSync } from './sync';

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function create<T extends Record<string, any>>(table: SyncTable, data: T & { id?: string }) {
  const me = currentUser();
  if (!me) throw new Error('Non connecté');
  const now = nowIso();
  const row = {
    id: data.id ?? uuid(),
    mission_id: MISSION_ID,
    author_id: me.id,
    device: deviceName(),
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...data,
    _dirty: 1 as const,
  };
  await db().table_(table).put(row);
  requestSync();
  return row as T & { id: string; author_id: string; created_at: string; updated_at: string };
}

/** Modifie un élément. Refuse si l'élément appartient à quelqu'un d'autre. */
export async function update(table: SyncTable, id: string, patch: Record<string, any>) {
  const me = currentUser();
  const t = db().table_(table);
  const cur = await t.get(id);
  if (!cur) throw new Error('Élément introuvable');
  if (cur.author_id && cur.author_id !== me?.id) throw new Error("Vous ne pouvez modifier que vos propres éléments.");
  if (!cur.author_id) {
    // Donnée de référence : on en fait une copie personnelle ? Non : seuls les admins la modifient.
    const { getMeta } = await import('./db');
    const role = await getMeta('my_role');
    if (role !== 'admin' && !me?.local) throw new Error('Seul un administrateur peut modifier le programme officiel.');
  }
  await t.update(id, { ...patch, updated_at: nowIso(), _dirty: 1 });
  requestSync();
}

export async function remove(table: SyncTable, id: string) {
  await update(table, id, { deleted_at: nowIso() });
}

export function canEdit(row: { author_id?: string | null } | undefined | null): boolean {
  const me = currentUser();
  if (!row || !me) return false;
  return row.author_id === me.id;
}
