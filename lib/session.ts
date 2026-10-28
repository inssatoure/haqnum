'use client';

import { isConfigured, IS_SANDBOX, MISSION_ID, sandboxId } from './config';
import { db, getMeta, setMeta } from './db';
import { supabase } from './supabase';
import type { Profile } from './types';
import seed from '@/data/seed.json';

export interface Me {
  id: string;
  email: string;
  local: boolean;
}

let me: Me | null = null;
const listeners = new Set<(m: Me | null) => void>();

export function currentUser(): Me | null {
  return me;
}

export function onUser(fn: (m: Me | null) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  listeners.forEach((fn) => fn(me));
}

/** Nom de l'appareil, gardé à chaque capture pour la traçabilité. */
export function deviceName(): string {
  if (typeof navigator === 'undefined') return 'serveur';
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'PC Windows';
  return 'Navigateur';
}

/** Charge le programme officiel en local si la base locale est vide. */
export async function ensureSeed() {
  const d = db();
  // Bac à sable : mêmes données de référence, avec des identifiants et une mission propres.
  const map = <T extends { id: string; mission_id: string }>(rows: T[]): T[] =>
    IS_SANDBOX ? rows.map((r) => ({ ...r, id: sandboxId(r.id), mission_id: MISSION_ID })) : rows;
  if ((await d.activities.count()) === 0) await d.activities.bulkPut(map(seed.activities as any));
  if ((await d.contacts.count()) === 0) await d.contacts.bulkPut(map(seed.contacts as any));
  if ((await d.fiches.count()) === 0) await d.fiches.bulkPut(map(seed.fiches as any));
}

export async function initSession(): Promise<Me | null> {
  await ensureSeed();
  const sb = supabase();
  if (!sb) {
    const local = await getMeta<Me>('local_user');
    me = local ?? null;
    emit();
    return me;
  }
  const { data } = await sb.auth.getSession();
  const u = data.session?.user;
  me = u ? { id: u.id, email: u.email ?? '', local: false } : null;
  sb.auth.onAuthStateChange((_e, s) => {
    const nu = s?.user;
    const next = nu ? { id: nu.id, email: nu.email ?? '', local: false } : null;
    if (next?.id !== me?.id) {
      me = next;
      emit();
    }
  });
  emit();
  if (me) {
    if (AUTH_LINK_TYPE) await sb.rpc('join_invited_missions');
    void refreshProfiles();
  }
  return me;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Supabase non configuré';
  const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return traduireErreur(error.message);
  me = { id: data.user.id, email: data.user.email ?? '', local: false };
  await sb.rpc('join_invited_missions');
  await refreshProfiles();
  emit();
  return null;
}

export async function sendCode(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Supabase non configuré';
  const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false } });
  return error ? traduireErreur(error.message) : null;
}

export async function verifyCode(email: string, token: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Supabase non configuré';
  const { data, error } = await sb.auth.verifyOtp({ email: email.trim(), token: token.trim(), type: 'email' });
  if (error || !data.user) return traduireErreur(error?.message ?? 'Code invalide');
  me = { id: data.user.id, email: data.user.email ?? '', local: false };
  await sb.rpc('join_invited_missions');
  await refreshProfiles();
  emit();
  return null;
}

/** Mode local (sans serveur) : pour essayer l'app ou travailler avant la configuration. */
export async function signInLocal(name: string, org: string, color: 'issa' | 'moctar') {
  const existing = await getMeta<Me>('local_user');
  const id = existing?.id ?? crypto.randomUUID();
  me = { id, email: '', local: true };
  await setMeta('local_user', me);
  await db().profiles.put({ id, full_name: name, short_name: name.split(' ')[0], organization: org, color });
  emit();
}

/** Lien d'invitation ou de réinitialisation : l'utilisateur doit choisir son mot de passe. */
export const AUTH_LINK_TYPE: string | null =
  typeof window !== 'undefined' ? (window.location.hash.match(/[#&]type=(invite|recovery|signup|magiclink)/)?.[1] ?? null) : null;

export async function setPassword(password: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Supabase non configuré';
  const { error } = await sb.auth.updateUser({ password });
  return error ? traduireErreur(error.message) : null;
}

export async function sendPasswordReset(email: string): Promise<string | null> {
  const sb = supabase();
  if (!sb) return 'Supabase non configuré';
  const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/' });
  return error ? traduireErreur(error.message) : null;
}

export async function signOut() {
  const sb = supabase();
  if (sb) await sb.auth.signOut();
  me = null;
  emit();
}

export async function refreshProfiles() {
  const sb = supabase();
  if (!sb) return;
  const { data: members } = await sb.from('mission_members').select('user_id, role').eq('mission_id', MISSION_ID);
  const ids = (members ?? []).map((m) => m.user_id);
  if (!ids.length) return;
  const { data } = await sb.from('profiles').select('*').in('id', ids);
  if (data) await db().profiles.bulkPut(data as Profile[]);
  const mine = (members ?? []).find((m) => m.user_id === me?.id);
  await setMeta('my_role', mine?.role ?? null);
  // Site web d'Issa : renseigné une seule fois si le profil n'en a pas (modifiable ensuite dans Mon QR code).
  const mineProfile = me ? await db().profiles.get(me.id) : undefined;
  if (mineProfile && /^issa\b/i.test(mineProfile.full_name ?? '') && !mineProfile.website) {
    await updateMyProfile({ website: 'https://www.issatoure.com' });
  }
}

export async function updateMyProfile(p: Partial<Profile>) {
  if (!me) return;
  const d = db();
  const cur = (await d.profiles.get(me.id)) ?? { id: me.id };
  const next = { ...cur, ...p, id: me.id };
  await d.profiles.put(next);
  const sb = supabase();
  if (sb && !me.local) {
    const { id: _id, ...rest } = next as any;
    await sb.from('profiles').update({ ...rest, updated_at: new Date().toISOString() }).eq('id', me.id);
  }
}

function traduireErreur(m: string): string {
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return "E-mail pas encore confirmé.";
  if (/rate limit/i.test(m)) return 'Trop d’essais. Attendez une minute.';
  if (/Failed to fetch|NetworkError/i.test(m)) return 'Pas de connexion internet.';
  return m;
}

export { isConfigured };
