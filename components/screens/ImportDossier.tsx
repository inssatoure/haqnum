'use client';

import { FolderArchive } from 'lucide-react';
import { useRef, useState } from 'react';
import { IS_SANDBOX } from '@/lib/config';
import { commitDossier, planDossier, type DossierPlan } from '@/lib/dossier-import';
import { go, useMe, useProfiles } from '../hooks';
import { Btn, Card, IconCircle, Title, toast } from '../ui';

/** Importe un dossier de suivi (zip) : rendez-vous, contacts et notes, au nom de l'utilisateur connecté. */
export default function ImportDossier() {
  const ref = useRef<HTMLInputElement>(null);
  const me = useMe();
  const profile = useProfiles()[me?.id ?? ''];
  const [plan, setPlan] = useState<DossierPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ activities: number; contacts: number; notes: number } | null>(null);

  const pick = async (f?: File) => {
    if (!f) return;
    setBusy('Lecture du dossier…');
    setDone(null);
    try {
      setPlan(await planDossier(f));
    } catch (e: any) {
      toast(`Fichier illisible : ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!plan) return;
    setBusy('Import…');
    try {
      const r = await commitDossier(plan, (d, t) => setBusy(`Import ${d}/${t}…`));
      setDone(r);
      setPlan(null);
      toast('Dossier importé');
    } catch (e: any) {
      toast(e?.message ?? 'Erreur pendant l’import');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <Title sub="Rendez-vous, contacts et notes d'un dossier de suivi (fichier .zip) sont rangés dans la mission, à votre nom.">Importer un dossier</Title>
      <Card className="mb-3 text-[14px] leading-snug text-nuit-200">
        Import dans : <b className="text-sable">{IS_SANDBOX ? 'le bac à sable (test)' : 'la vraie mission'}</b>, au nom de <b className="text-sable">{profile?.full_name ?? me?.email}</b>.
        {!IS_SANDBOX && <span className="mt-1 block text-nuit-400">Pour essayer sans risque, ouvrez d'abord le bac à sable (Plus &gt; Bac à sable).</span>}
      </Card>

      {!plan && !done && (
        <Card onClick={() => ref.current?.click()} className="flex items-center gap-3">
          <IconCircle icon={FolderArchive} tone="ocre" size="lg" />
          <div>
            <p className="font-semibold">Choisir le dossier (.zip)</p>
            <p className="text-sm text-nuit-400">Exemple : dossier_MIN_2026.zip</p>
          </div>
        </Card>
      )}
      <input ref={ref} type="file" accept=".zip,application/zip" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
      {busy && <p className="mt-3 animate-pulse text-ocre-400">{busy}</p>}

      {plan && (
        <div className="mt-2">
          <Card>
            <p className="font-semibold">Prêt à importer</p>
            <ul className="mt-2 space-y-1 text-[14px] text-nuit-200">
              <li>{plan.activities.length} rendez-vous ajoutés au programme</li>
              <li>{plan.contacts.length} contacts</li>
              <li>{plan.notes.length} notes (synthèses, résumés de sessions, notes d'écoute)</li>
            </ul>
            {plan.skipped.length > 0 && <p className="mt-2 text-[13px] text-nuit-400">Non importé : {plan.skipped.join(' ; ')}.</p>}
            {plan.warnings.map((w) => <p key={w} className="mt-2 text-[13px] text-red-300">{w}</p>)}
            <p className="mt-2 text-[13px] text-nuit-400">Relancer l'import met à jour les mêmes éléments, sans doublons.</p>
          </Card>
          <div className="mt-3 flex gap-2">
            <Btn tone="nuit" onClick={() => setPlan(null)}>Annuler</Btn>
            <Btn className="flex-1" disabled={!!busy || (plan.activities.length + plan.contacts.length + plan.notes.length === 0)} onClick={run}>Importer</Btn>
          </div>
        </div>
      )}

      {done && (
        <Card className="mt-2">
          <p className="font-semibold">Import terminé</p>
          <p className="mt-1 text-[14px] text-nuit-200">{done.activities} rendez-vous, {done.contacts} contacts, {done.notes} notes. Ils se synchronisent automatiquement.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn tone="nuit" onClick={() => go('contacts')}>Voir les contacts</Btn>
            <Btn tone="nuit" onClick={() => go('rapports')}>Rapports</Btn>
          </div>
        </Card>
      )}
    </div>
  );
}
