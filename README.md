# MIN Observateur

Application (PWA) pour observer, capturer et analyser la Biennale Chroniques / MIN 2026.
Deux observateurs (Issa Touré, Moctar Sidibé), une IA analyste.

- Fonctionne sur iPhone (Safari, « Ajouter à l'écran d'accueil ») et sur ordinateur.
- Marche hors ligne : tout est gardé sur le téléphone, puis envoyé dès qu'il y a du réseau.
- Chaque élément garde l'auteur, la date, l'heure et l'appareil. Chaque modification est historisée.

## Mise en route (15 min)

### 1. Supabase (base de données + fichiers)
1. Créez un projet sur https://supabase.com (région : Europe, Paris ou Francfort).
2. **SQL Editor** : collez puis exécutez `supabase/migrations/001_schema.sql`.
3. Ouvrez `supabase/migrations/002_seed.sql`, remplacez `issa@exemple.com` et `moctar@exemple.com` par les vrais e-mails, puis exécutez-le.
4. **Authentication > Users > Add user** : créez les deux comptes (e-mail + mot de passe, cochez « Auto confirm »).
5. **Project Settings > API** : notez `Project URL` et la clé `anon public`.

### 2. Vercel (mise en ligne)
1. https://vercel.com > **Add New > Project** > importez le dépôt GitHub `inssatoure/haqnum`.
2. **Root Directory** : laisser `./` (racine).
3. **Environment Variables** :

| Nom | Valeur |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL de Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | clé anon public |
| `NEXT_PUBLIC_MISSION_ID` | `00000000-0000-4000-8000-000000002026` |
| `GROQ_API_KEY` | clé Groq (transcription) |
| `ANTHROPIC_API_KEY` | clé Anthropic (analyse) |
| `ANTHROPIC_MODEL` | `claude-opus-5-5` (facultatif) |
| `PYANNOTE_API_KEY` | facultatif : séparation des voix |

4. **Deploy**. Le lien ressemble à `https://min-observateur.vercel.app`.

Les clés restent sur le serveur (jamais dans le code ni dans le téléphone).

### 3. Installer sur l'iPhone
1. Ouvrez le lien **dans Safari**.
2. Bouton **Partager** (carré avec flèche) > **Sur l'écran d'accueil** > **Ajouter**.
3. Ouvrez l'app depuis l'icône « MIN Obs », connectez-vous.
4. Autorisez le micro, la caméra et la position quand l'app le demande.

## Utilisation sur place
- **Maintenant** : activité en cours (heure de Paris), suivante, lieu, bus. Tout ce que vous capturez y est rattaché.
- **Enregistrer** (bouton rouge, toujours visible) : mode Débat. L'écran reste allumé, noir. Sauvegarde toutes les 45 s.
  Ne verrouillez pas l'iPhone. Si c'est coupé (appel…), l'app propose de reprendre ; rien n'est perdu.
- **Écran verrouillé obligatoire ?** Enregistrez avec **Dictaphone**, puis « Importer un audio » (via Fichiers).
- **Photos / vidéos de l'appareil photo** : « Importer » > galerie. Rattachement automatique par heure et GPS.
- **J'y vais** sur le programme pour se répartir les sessions ; **Tableau du jour** pour voir les trous de couverture.

## Développement
```bash
cd haqnum
cp .env.example .env.local   # remplir
npm install
npm run dev                  # http://localhost:3100
npm run test:e2e             # tests Playwright (format iPhone)
```
Sans Supabase configuré, l'app démarre en **mode local** (tout reste sur l'appareil), pratique pour tester.

## Architecture
- `app/` : page unique (navigation par `#/…`, donc hors ligne) + routes API (`/api/transcribe`, `/api/diarize`, `/api/ai`, `/api/ai/card`).
- `lib/db.ts` : base locale IndexedDB (Dexie). `lib/sync.ts` : file de synchronisation, envoi des fichiers reprenable (TUS, morceaux de 6 Mo).
- `lib/recorder.ts` : mode Débat (morceaux autonomes de 45 s, Wake Lock, détection de coupure).
- `lib/metadata.ts` : heure et GPS des fichiers importés (EXIF, en-tête MP4 `mvhd` des fichiers Dictaphone / vidéos).
- `lib/server/` : Groq Whisper, ffmpeg (découpage), pyannote, Claude, construction du corpus cité.
- `supabase/migrations/` : schéma, règles RLS (tout le monde lit la mission, chacun n'écrit que ses éléments), historique, stockage.
- Plus tard : version native (Capacitor) pour l'enregistrement en arrière-plan ; le code de capture est isolé dans `lib/recorder.ts`.
