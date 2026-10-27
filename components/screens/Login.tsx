'use client';

import { useState } from 'react';
import { isConfigured } from '@/lib/config';
import { sendCode, sendPasswordReset, signIn, signInLocal, verifyCode } from '@/lib/session';
import { Btn, Field, Input } from '../ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'password' | 'code' | 'code-sent'>('password');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setErr(null);
    const e = await fn();
    setBusy(false);
    if (e) setErr(e);
    return e;
  };

  return (
    <div className="safe-top mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-widest text-ocre-400">Chroniques · MIN 2026</p>
      <h1 className="mt-2 font-titre text-4xl text-sable">MIN Observateur</h1>
      <p className="mt-3 text-nuit-200">Deux observateurs, une IA analyste. Tout ce que vous voyez, entendez et rencontrez, rangé et partagé.</p>

      {isConfigured() ? (
        <form
          className="mt-8"
          onSubmit={async (e) => {
            e.preventDefault();
            if (mode === 'password') await run(() => signIn(email, password));
            else if (mode === 'code') {
              const er = await run(() => sendCode(email));
              if (!er) setMode('code-sent');
            } else await run(() => verifyCode(email, code));
          }}
        >
          <Field label="E-mail">
            <Input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vous@exemple.com" />
          </Field>
          {mode === 'password' && (
            <Field label="Mot de passe">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          {mode === 'code-sent' && (
            <Field label="Code reçu par e-mail">
              <Input inputMode="numeric" autoComplete="one-time-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" />
            </Field>
          )}
          {err && <p className="mb-3 rounded-xl bg-red-950 p-3 text-sm text-red-200">{err}</p>}
          <Btn type="submit" big className="w-full" disabled={busy}>
            {busy ? '…' : mode === 'password' ? 'Se connecter' : mode === 'code' ? 'Recevoir un code' : 'Valider le code'}
          </Btn>
          <button type="button" className="mt-4 w-full text-center text-sm text-nuit-400 underline" onClick={() => setMode(mode === 'password' ? 'code' : 'password')}>
            {mode === 'password' ? 'Se connecter avec un code par e-mail' : 'Se connecter avec un mot de passe'}
          </button>
          {mode === 'password' && (
            <button
              type="button"
              className="mt-3 w-full text-center text-sm text-nuit-400 underline"
              onClick={async () => {
                if (!email.trim()) return setErr('Indiquez d’abord votre e-mail.');
                const e = await run(() => sendPasswordReset(email));
                if (!e) setErr('E-mail envoyé : ouvrez le lien pour choisir un nouveau mot de passe.');
              }}
            >
              Mot de passe oublié / première connexion
            </button>
          )}
        </form>
      ) : (
        <LocalLogin />
      )}
    </div>
  );
}

function LocalLogin() {
  return (
    <div className="mt-8">
      <p className="mb-4 rounded-xl border border-ocre-600 p-3 text-sm text-ocre-200">
        Serveur pas encore configuré. Vous pouvez déjà travailler en mode local : tout reste sur ce téléphone.
      </p>
      <div className="grid gap-3">
        <Btn big tone="nuit" className="w-full justify-start" onClick={() => signInLocal('Issa Touré', 'Azerty Agency / Metafrik', 'issa')}>
          <span className="h-3 w-3 rounded-full bg-issa" /> Je suis Issa Touré
        </Btn>
        <Btn big tone="nuit" className="w-full justify-start" onClick={() => signInLocal('Moctar Sidibé', 'Kucibok', 'moctar')}>
          <span className="h-3 w-3 rounded-full bg-moctar" /> Je suis Moctar Sidibé
        </Btn>
      </div>
    </div>
  );
}
