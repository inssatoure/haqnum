'use client';

import { CalendarDays, Camera, Home, Menu, Mic, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IS_SANDBOX, setSandbox } from '@/lib/config';
import { formatDuration } from '@/lib/media';
import { getInterruptedRecording } from '@/lib/recorder';
import { AUTH_LINK_TYPE, initSession } from '@/lib/session';
import SetPassword from './screens/SetPassword';
import { startAutoSync } from '@/lib/sync';
import { AuthorFilterContext, go, useMe, useRoute, useSyncStatus, type AuthorFilter } from './hooks';
import { useRecorder } from './recorderStore';
import { cx, Toast, useToastHost } from './ui';
import Login from './screens/Login';
import Now from './screens/Now';
import Programme from './screens/Programme';
import ActivityDetail from './screens/ActivityDetail';
import Debate from './screens/Debate';
import ImportScreen from './screens/ImportScreen';
import Capture from './screens/Capture';
import Contacts from './screens/Contacts';
import ContactDetail from './screens/ContactDetail';
import Fiches from './screens/Fiches';
import FicheEdit from './screens/FicheEdit';
import Dashboard from './screens/Dashboard';
import More from './screens/More';
import Settings from './screens/Settings';
import Expenses from './screens/Expenses';
import MediaDetail from './screens/MediaDetail';
import MapScreen from './screens/MapScreen';
import Analyst from './screens/Analyst';
import Reports from './screens/Reports';
import Library from './screens/Library';

export default function App() {
  const [ready, setReady] = useState(false);
  const [needPassword, setNeedPassword] = useState(AUTH_LINK_TYPE === 'invite' || AUTH_LINK_TYPE === 'recovery');
  const [filter, setFilter] = useState<AuthorFilter>('tout');
  const [interrupted, setInterrupted] = useState<{ mediaId: string; seconds: number; at: string } | null>(null);
  const me = useMe();
  const route = useRoute();
  const toastMsg = useToastHost();

  useEffect(() => {
    (async () => {
      await initSession();
      setReady(true);
      startAutoSync();
      try {
        // Demande à Safari de ne pas effacer les données de l'app.
        await navigator.storage?.persist?.();
      } catch {
        /* ignore */
      }
      if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
        navigator.serviceWorker.ready.then((reg) => {
          // Met en cache les fichiers déjà chargés + les modules chargés à la demande (carte, QR, exports).
          const urls = performance.getEntriesByType('resource').map((e) => e.name);
          reg.active?.postMessage({ type: 'cache-urls', urls });
          const warm = () => {
            void import('leaflet');
            void import('html5-qrcode');
            void import('jszip');
            void import('docx');
            void import('qrcode');
            setTimeout(() => {
              const more = performance.getEntriesByType('resource').map((e) => e.name);
              reg.active?.postMessage({ type: 'cache-urls', urls: more });
            }, 4000);
          };
          if ('requestIdleCallback' in window) (window as any).requestIdleCallback(warm, { timeout: 5000 });
          else setTimeout(warm, 3000);
        });
      }
      // Point d'accès pour les tests automatiques (exports).
      (window as any).__minTest = {
        exportDocx: async (title: string, md: string, o?: { withPhotos?: boolean }) => {
          const [{ exportDocx }, { db }] = await Promise.all([import('@/lib/export'), import('@/lib/db')]);
          const media = o?.withPhotos ? (await db().media.toArray()).filter((m) => m.thumb_path && !m.deleted_at) : [];
          await exportDocx(title, md, { annexMedia: media });
        },
      };
      const st = await getInterruptedRecording();
      if (st && st.media && st.media.status === 'enregistrement') {
        setInterrupted({ mediaId: st.mediaId, seconds: st.savedSeconds, at: st.lastChunkAt });
      }
    })();
  }, []);

  if (!ready) return <div className="flex min-h-screen items-center justify-center font-titre text-xl text-ocre-400"><span className="animate-pulse">MIN Observateur</span></div>;
  if (!me) return <Login />;
  if (needPassword) return <SetPassword onDone={() => { setNeedPassword(false); window.location.hash = '#/maintenant'; }} />;

  return (
    <AuthorFilterContext.Provider value={{ value: filter, set: setFilter }}>
      <Toast msg={toastMsg} />
      <div className="mx-auto min-h-screen max-w-xl pb-40">
        <Header />
        <SandboxBanner />
        {interrupted && route.name !== 'debat' && (
          <div className="mx-4 mb-4 rounded-[20px] border border-red-500/40 bg-red-500/[0.08] p-4">
            <p className="font-semibold text-red-200">Enregistrement coupé</p>
            <p className="mt-1 text-sm text-red-100">
              L'enregistrement s'est arrêté (appel, verrouillage ou app fermée). {formatDuration(interrupted.seconds)} sont sauvegardées.
            </p>
            <div className="mt-3 flex gap-2">
              <button className="press rounded-xl bg-red-600 px-4 py-2 font-semibold text-white" onClick={() => { go(`debat?reprendre=${interrupted.mediaId}`); setInterrupted(null); }}>
                Reprendre
              </button>
              <button className="press rounded-xl bg-white/[0.07] px-4 py-2 font-semibold text-sable ring-1 ring-white/10" onClick={async () => { const { closeInterrupted } = await import('@/lib/recorder'); await closeInterrupted(interrupted.mediaId); setInterrupted(null); }}>
                Garder tel quel
              </button>
            </div>
          </div>
        )}
        <main key={route.name + (route.id ?? '')} className="animate-apparait px-4">
          <Screen name={route.name} id={route.id} query={route.query} />
        </main>
      </div>
      {route.name !== 'debat' && <RecordFab />}
      {route.name !== 'debat' && <BottomNav current={route.name} />}
    </AuthorFilterContext.Provider>
  );
}

function Screen({ name, id, query }: { name: string; id?: string; query: URLSearchParams }) {
  switch (name) {
    case 'programme': return <Programme />;
    case 'activite': return <ActivityDetail id={id!} />;
    case 'debat': return <Debate resumeId={query.get('reprendre') ?? undefined} activityId={query.get('activite') ?? undefined} />;
    case 'importer': return <ImportScreen activityId={query.get('activite') ?? undefined} />;
    case 'capturer': return <Capture experience={query.get('experience') === '1'} activityId={query.get('activite') ?? undefined} />;
    case 'contacts': return <Contacts />;
    case 'contact': return <ContactDetail id={id} />;
    case 'fiches': return <Fiches type={query.get('type') ?? undefined} />;
    case 'fiche': return <FicheEdit id={id} type={query.get('type') ?? undefined} activityId={query.get('activite') ?? undefined} />;
    case 'tableau': return <Dashboard />;
    case 'plus': return <More />;
    case 'reglages': return <Settings />;
    case 'depenses': return <Expenses />;
    case 'media': return <MediaDetail id={id!} />;
    case 'carte': return <MapScreen />;
    case 'analyste': return <Analyst />;
    case 'rapports': return <Reports />;
    case 'medias': return <Library />;
    default: return <Now />;
  }
}

function Header() {
  const s = useSyncStatus();
  const pending = s.pendingRows + s.pendingFiles;
  let label = 'À jour';
  let dot = 'bg-emerald-400';
  if (!s.online) { label = `Hors ligne${pending ? ` · ${pending}` : ''}`; dot = 'bg-nuit-400'; }
  else if (s.running) { label = s.uploading ? `Envoi ${s.uploadPct}%` : 'Synchro…'; dot = 'bg-ocre-400 animate-pulse'; }
  else if (pending) { label = `${pending} en attente`; dot = 'bg-ocre-400'; }
  if (s.error) { label = 'Erreur de synchro'; dot = 'bg-red-500'; }
  return (
    <header className="safe-top sticky top-0 z-30 mb-4 border-b border-white/[0.04] bg-nuit-950/75 px-4 pb-3 backdrop-blur-xl">
      <div className="flex items-center justify-between pt-3">
        <button onClick={() => go('maintenant')} className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-ocre-400 to-ocre-600 font-titre text-[15px] text-nuit-950 shadow-[0_1px_0_rgba(255,255,255,0.35)_inset]">M</span>
          <span className="text-left leading-tight">
            <span className="block font-titre text-[16px] text-sable">MIN Observateur</span>
            <span className="block text-[10.5px] font-semibold uppercase tracking-[0.16em] text-nuit-400">{IS_SANDBOX ? 'Bac à sable' : 'Chroniques 2026'}</span>
          </span>
        </button>
        <button onClick={() => go('reglages')} className="press flex items-center gap-2 rounded-full bg-white/[0.05] px-3 py-1.5 text-[12px] font-semibold text-nuit-200 ring-1 ring-white/[0.07]">
          <span className={cx('h-1.5 w-1.5 rounded-full', dot)} />
          {label}
        </button>
      </div>
    </header>
  );
}

function SandboxBanner() {
  if (!IS_SANDBOX) return null;
  return (
    <div className="mx-4 mb-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-ocre-500/40 bg-ocre-500/[0.07] px-4 py-3">
      <p className="text-[13px] leading-snug text-ocre-200">
        <span className="font-bold">Bac à sable.</span> Données de test, gardées à part de la vraie mission.
      </p>
      <button onClick={() => setSandbox(false)} className="press shrink-0 rounded-full bg-ocre-500/20 px-3 py-1.5 text-[12px] font-semibold text-ocre-200 ring-1 ring-ocre-500/40">
        Quitter
      </button>
    </div>
  );
}

function RecordFab() {
  const rec = useRecorder();
  const active = rec.phase === 'recording' || rec.phase === 'paused';
  return (
    <button
      onClick={() => go('debat')}
      aria-label="Enregistrer"
      className={cx(
        'press fixed right-4 z-40 flex h-12 items-center gap-2 rounded-full pl-3.5 pr-4 text-[14px] font-semibold shadow-flottant backdrop-blur-xl',
        'bottom-[calc(env(safe-area-inset-bottom)+96px)]',
        active ? 'rec-pulse bg-red-600 text-white' : 'bg-nuit-800/90 text-sable ring-1 ring-white/10',
      )}
    >
      <span className={cx('flex h-7 w-7 items-center justify-center rounded-full', active ? 'bg-white/20' : 'bg-red-500/90 text-white')}>
        <Mic size={15} strokeWidth={2.2} />
      </span>
      <span className="tabular-nums">{rec.phase === 'recording' ? formatDuration(rec.elapsed()) : rec.phase === 'paused' ? 'En pause' : 'Enregistrer'}</span>
    </button>
  );
}

function BottomNav({ current }: { current: string }) {
  const items = [
    { k: 'maintenant', l: 'Maintenant', i: Home },
    { k: 'programme', l: 'Programme', i: CalendarDays },
    { k: 'capturer', l: 'Capturer', i: Camera, main: true },
    { k: 'contacts', l: 'Contacts', i: Users },
    { k: 'plus', l: 'Plus', i: Menu },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="mx-auto flex max-w-md items-center justify-around rounded-[26px] border border-white/[0.07] bg-nuit-900/80 px-1.5 py-1.5 shadow-flottant backdrop-blur-2xl">
        {items.map(({ k, l, i: Icon, main }) => {
          const on = current === k || (k === 'maintenant' && current === '');
          if (main)
            return (
              <button key={k} onClick={() => go(k)} aria-label={l} className="press mx-1 flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-gradient-to-b from-ocre-400 to-ocre-500 text-nuit-950 shadow-[0_1px_0_rgba(255,255,255,0.4)_inset,0_10px_24px_-10px_rgba(207,143,69,0.9)]">
                <Icon size={22} strokeWidth={2} />
              </button>
            );
          return (
            <button key={k} onClick={() => go(k)} className={cx('press flex h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[18px] text-[10.5px] font-semibold', on ? 'bg-white/[0.07] text-sable' : 'text-nuit-400')}>
              <Icon size={19} strokeWidth={on ? 2.1 : 1.7} />
              {l}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
