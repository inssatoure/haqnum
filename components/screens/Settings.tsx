'use client';

import { useEffect, useState } from 'react';
import { getEngine, setEngine, type Engine } from '@/lib/ai-client';
import { db } from '@/lib/db';
import { formatBytes } from '@/lib/media';
import { signOut } from '@/lib/session';
import { syncNow } from '@/lib/sync';
import { useMe, useProfiles, useSyncStatus } from '../hooks';
import { Btn, Card, H2, Title, toast } from '../ui';
import { MyQr } from './MyQr';

export default function Settings() {
  const me = useMe();
  const profile = useProfiles()[me?.id ?? ''];
  const s = useSyncStatus();
  const [est, setEst] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null);
  const [local, setLocal] = useState<{ total: number; uploaded: number; count: number } | null>(null);
  const [health, setHealth] = useState<Record<string, any> | null>(null);
  const [engine, setEng] = useState<Engine>(getEngine());

  const refresh = async () => {
    const e = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    if (e) setEst({ usage: e.usage ?? 0, quota: e.quota ?? 0, persisted });
    let total = 0;
    let uploaded = 0;
    let count = 0;
    await db().blobs.each((b) => {
      total += b.blob?.size ?? 0;
      if (b.uploaded) uploaded += b.blob?.size ?? 0;
      count++;
    });
    setLocal({ total, uploaded, count });
  };
  useEffect(() => {
    void refresh();
    fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  const free = est ? est.quota - est.usage : 0;
  return (
    <div>
      <Title>Réglages</Title>
      <Card>
        <p className="font-semibold">{profile?.full_name ?? me?.email}</p>
        <p className="text-sm text-nuit-400">{profile?.organization} · {me?.local ? 'mode local (sans serveur)' : me?.email}</p>
      </Card>

      <H2>Synchronisation</H2>
      <Card>
        <p className="text-sm">{s.online ? 'En ligne' : 'Hors ligne'} · {s.pendingRows} élément(s) et {s.pendingFiles} fichier(s) en attente ({formatBytes(s.pendingBytes)})</p>
        {s.lastSync && <p className="text-xs text-nuit-400">Dernière synchro : {new Date(s.lastSync).toLocaleTimeString('fr-FR')}</p>}
        {s.error && <p className="mt-1 text-xs text-red-300">{s.error}</p>}
        <Btn tone="nuit" className="mt-3" disabled={me?.local} onClick={async () => { await syncNow(); toast('Synchronisation faite'); void refresh(); }}>Synchroniser maintenant</Btn>
      </Card>

      <H2>Stockage du téléphone</H2>
      <Card>
        {est && (
          <>
            <p className="text-sm">Utilisé par l'app : {formatBytes(est.usage)} · libre pour l'app : {formatBytes(free)}</p>
            <p className="text-sm">Enregistrement audio possible : ~{Math.floor(free / (0.48 * 1024 * 1024) / 60)} h (mode Débat)</p>
            <p className="text-xs text-nuit-400">Stockage protégé contre l'effacement : {est.persisted ? 'oui' : 'non (installez l’app sur l’écran d’accueil)'}</p>
          </>
        )}
        {local && <p className="mt-2 text-sm">Fichiers originaux sur ce téléphone : {local.count} ({formatBytes(local.total)}), dont {formatBytes(local.uploaded)} déjà en ligne.</p>}
        <Btn
          tone="ghost"
          className="mt-3"
          disabled={!local?.uploaded}
          onClick={async () => {
            if (!confirm('Supprimer de ce téléphone les fichiers déjà envoyés ? (ils restent en ligne)')) return;
            const done = await db().blobs.where('uploaded').equals(1).toArray();
            // On garde les miniatures (petites) pour l'affichage hors ligne.
            await db().blobs.bulkDelete(done.filter((b) => !/thumb\.jpg$|frame-1\.jpg$/.test(b.path)).map((b) => b.path));
            toast('Espace libéré');
            void refresh();
          }}
        >
          Libérer l'espace (fichiers déjà en ligne)
        </Btn>
      </Card>

      {health && (
        <>
          <H2>Serveur</H2>
          <Card className="text-sm">
            <p>Base de données : {health.supabase ? 'OK' : 'non configurée'}</p>
            <p>Stockage des fichiers : {health.r2 ? 'Cloudflare R2 (gros fichiers OK)' : 'Supabase (50 Mo max par fichier)'}</p>
            <p>Transcription (Groq) : {health.groq ? 'OK' : 'clé manquante'}</p>
            <p>Analyse Gemini : {health.gemini ? `OK (${health.gemini_model})` : 'clé manquante'}</p>
            <p>Analyse Claude : {health.anthropic ? `OK (${health.model})` : 'clé manquante'}</p>
            <p>Séparation des voix (pyannote) : {health.pyannote ? 'OK' : 'non configurée'}</p>
          </Card>
        </>
      )}

      <H2>Moteur IA</H2>
      <Card>
        <div className="flex gap-2">
          {(['gemini', 'claude'] as const).map((e) => (
            <button key={e} onClick={() => { setEngine(e); setEng(e); }} className={'flex-1 rounded-xl px-3 py-3 text-sm font-semibold ' + (engine === e ? 'bg-ocre-500 text-nuit-950' : 'bg-nuit-800 text-nuit-200')}>
              {e === 'gemini' ? 'Gemini (économique)' : 'Claude (qualité)'}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-nuit-400">Gemini pour le quotidien (synthèses, chat, cartes de visite). Claude pour les rapports finaux si vous voulez la meilleure qualité.</p>
      </Card>

      <H2>Mon QR code</H2>
      <Card><MyQr /></Card>

      <Btn tone="ghost" className="mt-6 w-full" onClick={() => { if (s.pendingFiles && !confirm('Des fichiers ne sont pas encore envoyés. Ils restent sur ce téléphone. Se déconnecter ?')) return; void signOut(); }}>
        Se déconnecter
      </Btn>
      <p className="mt-4 text-center text-xs text-nuit-400">MIN Observateur · v0.1</p>
    </div>
  );
}
