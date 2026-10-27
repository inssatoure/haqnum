'use client';

import { useEffect, useState } from 'react';
import { DebateRecorder } from '@/lib/recorder';

// Un seul enregistreur pour toute l'app : on peut changer d'écran sans couper l'enregistrement.
export const recorder = new DebateRecorder();

const subs = new Set<() => void>();
recorder.onChange = () => subs.forEach((f) => f());

export function useRecorder() {
  const [, force] = useState(0);
  useEffect(() => {
    const f = () => force((n) => n + 1);
    subs.add(f);
    const t = setInterval(() => recorder.phase === 'recording' && f(), 1000);
    return () => {
      subs.delete(f);
      clearInterval(t);
    };
  }, []);
  return recorder;
}
