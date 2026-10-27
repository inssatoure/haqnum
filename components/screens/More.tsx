'use client';

import { ArrowRight, BookOpen, Bot, FileDown, FlaskConical, Images, LayoutDashboard, Map, Receipt, Settings, Upload } from 'lucide-react';
import { IS_SANDBOX, setSandbox } from '@/lib/config';
import { go } from '../hooks';
import { Card, IconCircle, Title } from '../ui';

const ITEMS = [
  { k: 'fiches', l: 'Fiches de fond', d: 'Œuvres, débats, lieux, organisation', i: BookOpen },
  { k: 'tableau', l: 'Tableau du jour', d: 'Couverture et trous', i: LayoutDashboard },
  { k: 'medias', l: 'Toutes les captures', d: 'Photos, vidéos, audios, par auteur', i: Images },
  { k: 'carte', l: 'Carte', d: 'Lieux, œuvres, photos, rencontres', i: Map },
  { k: 'analyste', l: 'Agent analyste', d: 'Posez vos questions sur les données', i: Bot },
  { k: 'rapports', l: 'Rapports et exports', d: 'Jour, mission, dossier de reproduction, Word, PDF, ZIP', i: FileDown },
  { k: 'importer', l: 'Importer', d: 'Dictaphone, galerie', i: Upload },
  { k: 'depenses', l: 'Dépenses personnelles', d: 'Montant, catégorie, reçu', i: Receipt },
  { k: 'reglages', l: 'Réglages', d: 'Profil, stockage, synchronisation', i: Settings },
];

export default function More() {
  return (
    <div>
      <Title>Plus</Title>
      <div className="space-y-2.5">
        {ITEMS.map(({ k, l, d, i }) => (
          <Card key={k} onClick={() => go(k)} className="flex items-center gap-3">
            <IconCircle icon={i} />
            <div className="flex-1">
              <p className="font-semibold">{l}</p>
              <p className="text-[13px] text-nuit-400">{d}</p>
            </div>
            <ArrowRight size={17} className="text-nuit-400" />
          </Card>
        ))}
        <Card onClick={() => setSandbox(!IS_SANDBOX)} className="flex items-center gap-3 border-dashed border-ocre-500/30">
          <IconCircle icon={FlaskConical} tone="ocre" />
          <div className="flex-1">
            <p className="font-semibold">{IS_SANDBOX ? 'Revenir à la vraie mission' : 'Bac à sable'}</p>
            <p className="text-[13px] text-nuit-400">Tester sans toucher aux données de la mission</p>
          </div>
          <ArrowRight size={17} className="text-nuit-400" />
        </Card>
      </div>
    </div>
  );
}
