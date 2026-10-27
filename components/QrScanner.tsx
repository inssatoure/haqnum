'use client';

import { useEffect, useRef, useState } from 'react';

/** Scanner de QR code avec la caméra arrière (html5-qrcode). */
export default function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const id = useRef(`qr-${Math.random().toString(36).slice(2)}`);
  const [err, setErr] = useState<string | null>(null);
  const done = useRef(false);

  useEffect(() => {
    let scanner: any;
    let stopped = false;
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (stopped) return;
        scanner = new Html5Qrcode(id.current, { verbose: false } as any);
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          (text: string) => {
            if (done.current) return;
            done.current = true;
            scanner.stop().catch(() => {});
            onResult(text);
          },
          () => {},
        );
      } catch (e: any) {
        setErr("Caméra indisponible. Autorisez l'accès à la caméra pour Safari.");
      }
    })();
    return () => {
      stopped = true;
      if (scanner?.isScanning) scanner.stop().catch(() => {});
    };
  }, [onResult]);

  return (
    <div>
      <div id={id.current} className="overflow-hidden rounded-2xl bg-black" style={{ minHeight: 280 }} />
      {err && <p className="mt-2 text-sm text-red-300">{err}</p>}
      <p className="mt-2 text-sm text-nuit-400">Visez le QR code (vCard, LinkedIn, Swapcard).</p>
    </div>
  );
}
