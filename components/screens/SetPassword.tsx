'use client';

import { useState } from 'react';
import { setPassword } from '@/lib/session';
import { useMe } from '../hooks';
import { Btn, Field, Input } from '../ui';

/** Après un lien d'invitation ou de réinitialisation : choisir son mot de passe. */
export default function SetPassword({ onDone }: { onDone: () => void }) {
  const me = useMe();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="safe-top mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="font-titre text-3xl">Choisissez votre mot de passe</h1>
      <p className="mt-2 text-nuit-200">Compte : {me?.email}. Vous l’utiliserez pour vous connecter depuis l’app installée sur l’iPhone.</p>
      <form
        className="mt-6"
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8) return setErr('8 caractères minimum.');
          if (pw !== pw2) return setErr('Les deux mots de passe sont différents.');
          setBusy(true);
          const r = await setPassword(pw);
          setBusy(false);
          if (r) setErr(r);
          else onDone();
        }}
      >
        <Field label="Mot de passe"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Encore une fois"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        {err && <p className="mb-3 rounded-xl bg-red-950 p-3 text-sm text-red-200">{err}</p>}
        <Btn type="submit" big className="w-full" disabled={busy}>{busy ? '…' : 'Enregistrer'}</Btn>
      </form>
    </div>
  );
}
