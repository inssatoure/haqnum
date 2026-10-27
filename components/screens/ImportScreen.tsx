'use client';

import { Camera, FileAudio, Video } from 'lucide-react';
import { useRef, useState } from 'react';
import { commitImport, planImport, type ImportPlan } from '@/lib/capture';
import { formatBytes, formatDuration } from '@/lib/media';
import { dateHeure } from '@/lib/time';
import { go } from '../hooks';
import { Btn, Card, IconCircle, Title, toast } from '../ui';
import { ActivityPicker } from './Capture';

const SOURCE_LABEL: Record<string, string> = {
  exif: 'heure de la photo',
  mp4: "heure d'enregistrement",
  fichier: 'date du fichier (à vérifier)',
  maintenant: 'heure inconnue',
};

export default function ImportScreen({ activityId }: { activityId?: string }) {
  const audioRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [plans, setPlans] = useState<ImportPlan[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy('Lecture des fichiers…');
    const p = await planImport([...files]);
    if (activityId) p.forEach((x) => !x.activityId && (x.activityId = activityId));
    setPlans(p);
    setBusy(null);
  };

  const save = async () => {
    if (!plans) return;
    setBusy(`Enregistrement 0/${plans.length}`);
    await commitImport(plans, (i) => setBusy(`Enregistrement ${i}/${plans.length}`));
    toast(`${plans.length} fichier(s) importé(s)`);
    setPlans(null);
    setBusy(null);
    go('medias');
  };

  if (plans) {
    return (
      <div>
        <Title sub="Vérifiez l'activité proposée pour chaque fichier. Les originaux sont gardés tels quels.">{plans.length} fichier(s) à importer</Title>
        <div className="space-y-3">
          {plans.map((p, i) => (
            <Card key={i}>
              <div className="mb-2 flex items-center gap-3">
                <IconCircle icon={p.kind === 'photo' ? Camera : p.kind === 'video' ? Video : FileAudio} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.file.name}</p>
                  <p className="text-xs text-nuit-400">
                    {dateHeure(p.capturedAt)} ({SOURCE_LABEL[p.timeSource] ?? p.timeSource}) · {formatBytes(p.file.size)}
                    {p.durationS ? ` · ${formatDuration(p.durationS)}` : ''}
                    {p.lat != null ? ' · GPS' : ''}
                  </p>
                </div>
              </div>
              <ActivityPicker
                value={p.activityId}
                onChange={(id) => setPlans(plans.map((x, k) => (k === i ? { ...x, activityId: id } : x)))}
              />
            </Card>
          ))}
        </div>
        <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+150px)] mt-4 flex gap-2">
          <Btn big tone="nuit" onClick={() => setPlans(null)}>Annuler</Btn>
          <Btn big className="flex-1" onClick={save} disabled={!!busy}>{busy ?? 'Importer'}</Btn>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Title sub="Pour enregistrer écran verrouillé : utilisez le Dictaphone de l'iPhone, puis importez le fichier ici.">Importer</Title>
      <div className="grid gap-3">
        <Card onClick={() => audioRef.current?.click()} className="flex items-center gap-3">
          <IconCircle icon={FileAudio} tone="terre" size="lg" />
          <div>
            <p className="font-semibold">Importer un audio</p>
            <p className="text-sm text-nuit-400">Dictaphone (.m4a), depuis Fichiers</p>
          </div>
        </Card>
        <Card onClick={() => galleryRef.current?.click()} className="flex items-center gap-3">
          <IconCircle icon={Camera} tone="ocre" size="lg" />
          <div>
            <p className="font-semibold">Photos et vidéos de la galerie</p>
            <p className="text-sm text-nuit-400">Sélection multiple, rattachement par heure et GPS</p>
          </div>
        </Card>
      </div>
      {busy && <p className="mt-4 text-ocre-400">{busy}</p>}
      <div className="mt-6 rounded-2xl bg-nuit-900 p-4 text-sm text-nuit-200">
        <p className="mb-2 font-semibold text-sable">Depuis le Dictaphone</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Dans Dictaphone, touchez l'enregistrement puis « ••• » &gt; « Enregistrer dans Fichiers ».</li>
          <li>Revenez ici, « Importer un audio », choisissez le fichier.</li>
        </ol>
        <p className="mt-2 text-nuit-400">Le menu Partager de l'iPhone ne peut pas envoyer directement vers une app web : passez par Fichiers.</p>
      </div>
      <input ref={audioRef} type="file" accept="audio/*,.m4a,.mp3,.wav,.aac" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={galleryRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} />
    </div>
  );
}
