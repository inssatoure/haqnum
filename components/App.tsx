'use client';

import { CalendarDays, Camera, Home, Menu, Mic, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDuration } from '@/lib/media';
import { getInterruptedRecording } from '@/lib/recorder';
import { initSession } from '@/lib/session';
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

  if (!ready) return <div className="flex min-h-screen items-center justify-center font-titre text-xl text-ocre-400">MIN Observateur…</div>;
  if (!me) return <Login />;

  return (
    <AuthorFilterContext.Provider value={{ value: filter, set: setFilter }}>
      <Toast msg={toastMsg} />
      <div className="mx-auto min-h-screen max-w-xl pb-32">
        <Header />
        {interrupted && route.name !== 'debat' && (
          <div className="mx-4 mb-3 rounded-2xl border border-red-500 bg-red-950/60 p-4">
            <p className="font-semibold text-red-200">Enregistrement coupé</p>
            <p className="mt-1 text-sm text-red-100">
              L'enregistrement s'est arrêté (appel, verrouillage ou app fermée). {formatDuration(interrupted.seconds)} sont sauvegardées.
            </p>
            <div className="mt-3 flex gap-2">
              <button className="rounded-xl bg-red-600 px-4 py-2 font-semibold text-white" onClick={() => { go(`debat?reprendre=${interrupted.mediaId}`); setInterrupted(null); }}>
                Reprendre
              </button>
              <button className="rounded-xl bg-nuit-700 px-4 py-2 font-semibold text-sable" onClick={async () => { const { closeInterrupted } = await import('@/lib/recorder'); await closeInterrupted(interrupted.mediaId); setInterrupted(null); }}>
                Garder tel quel
              </button>
            </div>
          </div>
        )}
        <main className="px-4">
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
  if (!s.online) { label = `Hors ligne${pending ? ` · ${pending} en attente` : ''}`; dot = 'bg-nuit-400'; }
  else if (s.running) { label = s.uploading ? `Envoi ${s.uploadPct}%` : 'Synchronisation…'; dot = 'bg-ocre-400 animate-pulse'; }
  else if (pending) { label = `${pending} en attente`; dot = 'bg-ocre-400'; }
  if (s.error) { label = 'Erreur de synchro'; dot = 'bg-red-500'; }
  return (
    <header className="safe-top sticky top-0 z-30 mb-3 bg-nuit-950/95 px-4 pb-2 backdrop-blur">
      <div className="flex items-center justify-between pt-2">
        <button onClick={() => go('maintenant')} className="font-titre text-lg text-ocre-400">MIN Observateur</button>
        <button onClick={() => go('reglages')} className="flex items-center gap-2 rounded-full bg-nuit-900 px-3 py-1.5 text-xs text-nuit-200">
          <span className={cx('h-2 w-2 rounded-full', dot)} />
          {label}
        </button>
      </div>
    </header>
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
        'fixed right-4 z-40 flex items-center gap-2 rounded-full px-5 py-4 font-semibold shadow-xl',
        'bottom-[calc(env(safe-area-inset-bottom)+84px)]',
        active ? 'bg-red-600 text-white rec-pulse' : 'bg-terre-500 text-sable',
      )}
    >
      <Mic size={22} />
      {rec.phase === 'recording' ? `REC ${formatDuration(rec.elapsed())}` : rec.phase === 'paused' ? 'En pause' : 'Enregistrer'}
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
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-nuit-800 bg-nuit-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-xl items-stretch justify-around px-2 pt-1">
        {items.map(({ k, l, i: Icon, main }) => (
          <button key={k} onClick={() => go(k)} className={cx('flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]', current === k || (k === 'maintenant' && current === '') ? 'text-ocre-400' : 'text-nuit-400')}>
            <span className={cx('flex items-center justify-center rounded-full', main ? 'h-11 w-11 bg-ocre-500 text-nuit-950' : 'h-8 w-8')}>
              <Icon size={main ? 22 : 20} />
            </span>
            {l}
          </button>
        ))}
      </div>
    </nav>
  );
}
