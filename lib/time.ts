import { TZ } from './config';
import type { Activity } from './types';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, ...opts });
const hm = fmt({ hour: '2-digit', minute: '2-digit' });
const dayLong = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const dayShort = fmt({ weekday: 'short', day: 'numeric' });
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

export const heure = (iso: string | Date) => hm.format(new Date(iso)).replace(':', 'h');
export const jourLong = (iso: string | Date) => {
  const s = dayLong.format(new Date(iso));
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const jourCourt = (iso: string | Date) => dayShort.format(new Date(iso));
/** Clé du jour à Paris : AAAA-MM-JJ */
export const dayKey = (iso: string | Date) => dayKeyFmt.format(new Date(iso));
export const dateHeure = (iso: string | Date) => `${jourCourt(iso)} ${heure(iso)}`;

/** Convertit « AAAA-MM-JJ » + « HH:MM » (heure de Paris) en ISO. */
export function parisToIso(date: string, time: string): string {
  // Décalage de Paris à cette date (gère heure d'été / d'hiver).
  const guess = new Date(`${date}T${time}:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(guess);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asParis = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  const offset = asParis - guess.getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export function isoToParisInputs(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return { date: dayKey(d), time: hm.format(d) };
}

export function activeActivities(list: Activity[], at: Date = new Date()): Activity[] {
  const t = at.getTime();
  return list
    .filter((a) => !a.deleted_at && new Date(a.starts_at).getTime() <= t && new Date(a.ends_at).getTime() > t)
    .sort((a, b) => durationOf(a) - durationOf(b));
}

const durationOf = (a: Activity) => new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime();

/**
 * Activité la plus probable pour un instant donné :
 * la plus courte en cours (ex. matchmaking 15 min dans un forum de 8 h),
 * sinon la plus proche dans une marge de 45 min.
 */
export function activityAt(list: Activity[], at: Date | string, marginMin = 45): Activity | null {
  const d = new Date(at);
  const act = activeActivities(list, d).filter((a) => a.kind !== 'transport');
  if (act.length) return act[0];
  const any = activeActivities(list, d);
  if (any.length) return any[0];
  const t = d.getTime();
  let best: Activity | null = null;
  let bestGap = marginMin * 60_000;
  for (const a of list) {
    if (a.deleted_at) continue;
    const s = new Date(a.starts_at).getTime();
    const e = new Date(a.ends_at).getTime();
    const gap = t < s ? s - t : t - e;
    if (gap >= 0 && gap < bestGap) {
      best = a;
      bestGap = gap;
    }
  }
  return best;
}

export function nextActivity(list: Activity[], at: Date = new Date()): Activity | null {
  const t = at.getTime();
  return (
    list
      .filter((a) => !a.deleted_at && new Date(a.starts_at).getTime() > t)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0] ?? null
  );
}

/** Distance en km (pour rattacher une photo au lieu le plus proche). */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
