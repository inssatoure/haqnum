'use client';

import dynamic from 'next/dynamic';

// Toute l'app tourne côté navigateur (hors ligne, IndexedDB, micro, caméra).
const App = dynamic(() => import('@/components/App'), {
  ssr: false,
  loading: () => <div className="flex min-h-screen items-center justify-center font-titre text-xl text-ocre-400">MIN Observateur…</div>,
});

export default function Page() {
  return <App />;
}
