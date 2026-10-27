'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { buildVcard } from '@/lib/importers';
import { updateMyProfile } from '@/lib/session';
import { useMe, useProfiles } from '../hooks';
import { Btn, Field, Input } from '../ui';

/** QR code vCard de l'observateur : l'autre personne le scanne avec l'appareil photo de son téléphone. */
export function MyQr() {
  const me = useMe();
  const p = useProfiles()[me?.id ?? ''];
  const [img, setImg] = useState<string | null>(null);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ full_name: '', organization: '', role_title: '', email: '', phone: '', website: '', country: 'Sénégal' });

  useEffect(() => {
    if (p) setF({ full_name: p.full_name ?? '', organization: p.organization ?? '', role_title: p.role_title ?? '', email: p.email ?? me?.email ?? '', phone: p.phone ?? '', website: p.website ?? '', country: p.country ?? 'Sénégal' });
  }, [p?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = buildVcard({ name: f.full_name || 'Observateur', organization: f.organization, role: f.role_title, email: f.email, phone: f.phone, website: f.website, country: f.country });
    QRCode.toDataURL(v, { margin: 1, width: 560, errorCorrectionLevel: 'M', color: { dark: '#070D18', light: '#F4ECDF' } }).then(setImg);
  }, [f]);

  return (
    <div>
      {img && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="Mon QR code vCard" className="mx-auto w-full max-w-xs rounded-2xl" />
      )}
      <p className="mt-3 text-center font-titre text-lg">{f.full_name}</p>
      <p className="text-center text-sm text-nuit-400">{[f.role_title, f.organization].filter(Boolean).join(' · ')}</p>
      {!edit ? (
        <Btn tone="ghost" className="mt-4 w-full" onClick={() => setEdit(true)}>Modifier mes informations</Btn>
      ) : (
        <form
          className="mt-4"
          onSubmit={async (e) => {
            e.preventDefault();
            await updateMyProfile(f);
            setEdit(false);
          }}
        >
          {([
            ['full_name', 'Nom complet'],
            ['organization', 'Structure'],
            ['role_title', 'Fonction'],
            ['email', 'E-mail'],
            ['phone', 'Téléphone'],
            ['website', 'Site web'],
            ['country', 'Pays'],
          ] as const).map(([k, l]) => (
            <Field key={k} label={l}>
              <Input value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            </Field>
          ))}
          <Btn type="submit" className="w-full">Enregistrer</Btn>
        </form>
      )}
    </div>
  );
}
