// Tests de bout en bout, format iPhone (Chromium avec écran, tactile et user-agent iPhone).
// Usage : BASE=http://localhost:3100 node tests/run.mjs
// Prérequis : app lancée en mode local : NEXT_PUBLIC_LOCAL_MODE=1 npm run build && npm start
// LONG=1 : enregistrement Débat réel de 30 min (morceaux de 45 s).

import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require('/opt/node-tools/node_modules/playwright');
}
const { chromium } = playwright;

const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, 'fixtures');
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3100';
const LONG = process.env.LONG === '1';

const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push({ name, ok: true, ms: Date.now() - t });
    console.log(`✔ ${name} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    await globalThis.__page?.screenshot({ path: path.join(OUT, `ECHEC-${results.length}.png`) }).catch(() => {});
    console.log('   url :', globalThis.__page?.url());
    console.log(`✘ ${name}\n   ${e.message.split('\n')[0]}`);
  }
}

const iphone = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  locale: 'fr-FR',
  timezoneId: 'Europe/Paris',
  permissions: ['microphone', 'camera', 'geolocation'],
  geolocation: { latitude: 43.5186, longitude: 5.4529 },
  acceptDownloads: true,
};

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${path.join(FX, 'qr.y4m')}`, '--autoplay-policy=no-user-gesture-required'],
});
const ctx = await browser.newContext(iphone);
const page = await ctx.newPage();
globalThis.__page = page;
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && !/favicon|tile\.openstreetmap|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) && errors.push(m.text()));

// Jeudi 29 octobre, 10h30 à Paris : en plein forum professionnel.
await page.clock.install({ time: new Date('2026-10-29T09:30:00Z') });
await page.clock.resume();
await page.addInitScript(() => {
  localStorage.setItem('min_chunk_ms', localStorage.getItem('min_chunk_ms') || '2000');
});
const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`) });
const go = async (h) => {
  await page.evaluate((x) => (location.hash = x), h);
  await page.waitForTimeout(400);
};

await step('Ouverture + connexion (mode local, Issa)', async () => {
  await page.goto(BASE);
  await page.getByText('Je suis Issa Touré').click();
  await page.getByText('Bonjour Issa').waitFor({ timeout: 10000 });
  await page.getByText('Forum professionnel').first().waitFor();
  await shot('01-maintenant');
});

await step('Programme : jours, activité en cours, « J’y vais »', async () => {
  await go('#/programme');
  await page.getByText('Matchmaking fonds européens : ARTEFUNKT').waitFor();
  const btn = page.getByRole('button', { name: "J'y vais" }).nth(1);
  await btn.click();
  await page.getByText('y va').first().waitFor();
  await shot('02-programme');
});

await step('Mode Débat : enregistrement par morceaux puis Stop', async () => {
  await go('#/debat');
  await page.getByRole('button', { name: /Démarrer/ }).click();
  await page.getByText('Enregistrement en cours').waitFor();
  await page.waitForTimeout(9000);
  const txt = await page.getByText(/morceaux sauvegardés/).innerText();
  const n = Number(txt.match(/(\d+) morceaux/)[1]);
  if (n < 3) throw new Error(`seulement ${n} morceaux après 9 s`);
  await shot('03-debat-ecran-noir');
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.getByText(/morceaux/).first().waitFor();
  await page.getByText('Transcription').waitFor();
  await shot('04-audio-enregistre');
});

await step('Coupure pendant l’enregistrement (app fermée) puis reprise', async () => {
  await go('#/debat');
  await page.getByRole('button', { name: /Démarrer/ }).click();
  await page.waitForTimeout(5000);
  const before = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('min-observateur');
    r.onsuccess = () => {
      const tx = r.result.transaction('meta').objectStore('meta').get('recording_state');
      tx.onsuccess = () => res(tx.result?.value?.partCount ?? 0);
    };
  }));
  if (before < 1) throw new Error('aucun morceau avant la coupure');
  await page.reload(); // simule l'app tuée
  await page.getByText('Enregistrement coupé').waitFor({ timeout: 10000 });
  await shot('05-coupure-detectee');
  await page.getByRole('button', { name: /Reprendre/ }).first().click();
  await page.getByText('Enregistrement en cours').waitFor();
  await page.waitForTimeout(5000);
  await page.getByRole('button', { name: 'Stop' }).click();
  await page.waitForURL(/#\/media\//);
  const parts = await page.getByText(/· \d+ morceaux/).first().innerText();
  const n = Number(parts.match(/(\d+) morceaux/)[1]);
  console.log(`   ${before} morceau(x) avant la coupure, ${n} au total après reprise`);
  if (n <= before) throw new Error(`morceaux après reprise (${n}) <= avant (${before})`);
});

if (LONG) {
  await step('Enregistrement réel de 30 min (morceaux de 45 s)', async () => {
    await page.evaluate(() => localStorage.setItem('min_chunk_ms', '45000'));
    await page.reload();
    await go('#/debat');
    await page.getByRole('button', { name: /Démarrer/ }).click();
    await page.waitForTimeout(30 * 60 * 1000);
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForURL(/#\/media\//);
    const parts = await page.getByText(/· \d+ morceaux/).first().innerText();
    console.log(`   ${parts}`);
    const n = Number(parts.match(/(\d+) morceaux/)[1]);
    if (n < 39) throw new Error(`${n} morceaux pour 30 min (attendu ≥ 40)`);
    await page.evaluate(() => localStorage.setItem('min_chunk_ms', '2000'));
  });
}

await step('Import Dictaphone (.m4a) : heure lue dans le fichier, rattachement au forum', async () => {
  await go('#/importer');
  await page.locator('input[type=file][accept^="audio"]').setInputFiles(path.join(FX, 'dictaphone.m4a'));
  await page.getByText("heure d'enregistrement").waitFor({ timeout: 10000 });
  const sel = await page.locator('select').first().evaluate((s) => s.options[s.selectedIndex].text);
  if (!/Forum professionnel/.test(sel)) throw new Error(`activité proposée : ${sel}`);
  await shot('06-import-dictaphone');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.getByText('Captures').first().waitFor();
});

await step('Import galerie : photo (EXIF + GPS) et vidéo (.mov) rattachées par heure', async () => {
  await go('#/importer');
  await page.locator('input[type=file][accept^="image"]').setInputFiles([path.join(FX, 'photo.jpg'), path.join(FX, 'video.mov')]);
  await page.getByText('heure de la photo').waitFor({ timeout: 10000 });
  const texts = await page.locator('select').evaluateAll((ss) => ss.map((s) => s.options[s.selectedIndex].text));
  if (!texts.some((t) => /EMAP Open Lab/.test(t))) throw new Error(`photo : ${texts.join(' | ')}`);
  if (!texts.some((t) => /TRAVERSE/.test(t))) throw new Error(`vidéo : ${texts.join(' | ')}`);
  if (!(await page.getByText('GPS').count())) throw new Error('GPS de la photo non lu');
  await shot('07-import-galerie');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await page.waitForTimeout(2500);
  await shot('08-captures');
});

await step('Photo prise depuis l’app + note vocale liée + note écrite', async () => {
  await go('#/maintenant');
  await page.locator('input[type=file][accept="image/*"][capture]').first().setInputFiles(path.join(FX, 'photo.jpg'));
  await page.getByText('Décrire ce que vous voyez ?').waitFor();
  await page.getByRole('button', { name: /Décrire à voix haute/ }).click();
  await page.getByLabel('Démarrer la note vocale').click();
  await page.waitForTimeout(2000);
  await page.getByLabel('Arrêter et enregistrer').click();
  await page.getByText('Note vocale enregistrée').waitFor();
  await page.getByRole('button', { name: 'Note', exact: true }).first().click();
  await page.locator('textarea').fill('Installation immersive : 3 projecteurs, capteurs Kinect, public très jeune.');
  await page.getByRole('button', { name: 'Enregistrer la note' }).click();
  await page.getByText('Note enregistrée').waitFor();
});

await step('« Je suis dans une expérience » : fiche œuvre avec médias', async () => {
  await go('#/capturer?experience=1');
  await page.getByPlaceholder(/TRAVERSE/).fill('Predictive Constellations');
  await page.getByRole('button', { name: 'Commencer' }).click();
  await page.locator('input[type=file][accept="image/*"][capture]').first().setInputFiles(path.join(FX, 'photo.jpg'));
  await page.getByText('Plus tard').click();
  await page.getByText('Dans cette fiche (1)').waitFor();
  await page.getByRole('button', { name: /Remplir la fiche/ }).click();
  await page.getByText('Lien avec le thème « Résistance »').waitFor();
  await page.getByText('Technologies et matériel').locator('..').locator('textarea').fill('Écran LED, IA générative, capteurs');
  await page.locator('main').getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await page.getByText('Fiche enregistrée').waitFor();
  await shot('09-fiche-oeuvre');
});

await step('Contacts : scan d’un QR vCard (caméra simulée)', async () => {
  await go('#/contacts');
  await page.getByRole('button', { name: /Scanner/ }).click();
  await page.waitForURL(/#\/contact\//, { timeout: 20000 });
  const name = await page.locator('input').first().inputValue().catch(() => '');
  const ok = name.includes('Paul Bouchard') || (await page.getByText('Paul Bouchard').count());
  if (!ok) throw new Error(`nom lu : « ${name} »`);
  await shot('10-contact-scanne');
});

await step('Mon QR code (vCard)', async () => {
  await go('#/contacts');
  await page.getByRole('button', { name: /Mon QR/ }).click();
  await page.getByAltText('Mon QR code vCard').waitFor();
  await shot('11-mon-qr');
  await page.getByLabel('Fermer').click();
});

await step('Export contacts CSV et vCard', async () => {
  await go('#/contacts');
  const [d1] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()]);
  const p1 = path.join(OUT, d1.suggestedFilename());
  await d1.saveAs(p1);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /vCard/ }).click()]);
  const p2 = path.join(OUT, d2.suggestedFilename());
  await d2.saveAs(p2);
  if (statSync(p1).size < 100 || statSync(p2).size < 100) throw new Error('fichiers vides');
});

await step('Hors ligne : l’app se rouvre et enregistre sans réseau', async () => {
  await go('#/maintenant');
  await page.waitForTimeout(1500); // laisse le service worker mettre en cache
  await ctx.setOffline(true);
  await page.reload();
  await page.getByText('Bonjour Issa').waitFor({ timeout: 15000 });
  await page.getByRole('button', { name: 'Note', exact: true }).first().click();
  await page.locator('textarea').fill('Note écrite sans réseau');
  await page.getByRole('button', { name: 'Enregistrer la note' }).click();
  await page.getByText('Note enregistrée').waitFor();
  await page.getByText(/Hors ligne/).first().waitFor();
  await shot('12-hors-ligne');
  await ctx.setOffline(false);
});

await step('Tableau du jour (couverture) et carte', async () => {
  await go('#/tableau');
  await page.getByText('Tableau du jour').first().waitFor();
  await shot('13-tableau');
  await go('#/carte');
  await page.locator('.leaflet-container').waitFor();
  await page.waitForTimeout(1500);
  await shot('14-carte');
});

await step('Exports Word (.docx) et archive ZIP des originaux', async () => {
  await go('#/rapports');
  const [z] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.getByRole('button', { name: /Archive ZIP/ }).click()]);
  const pz = path.join(OUT, z.suggestedFilename());
  await z.saveAs(pz);
  if (statSync(pz).size < 50_000) throw new Error(`ZIP trop petit : ${statSync(pz).size}`);
  const [d] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.evaluate(() => window.__minTest.exportDocx('Rapport test', '# Titre\n\n## Section\n\n- point **fort** [Issa, photo 10:30]\n\nTexte simple.', { withPhotos: true })),
  ]);
  const pd = path.join(OUT, d.suggestedFilename());
  await d.saveAs(pd);
  if (statSync(pd).size < 5000) throw new Error('docx trop petit');
});

await step('Aucune erreur JavaScript', async () => {
  const real = errors.filter((e) => !/NotSupportedError|AbortError|wakeLock|Wake Lock/i.test(e));
  if (real.length) throw new Error(real.slice(0, 5).join(' | '));
});

await browser.close();
const ok = results.filter((r) => r.ok).length;
console.log(`\n${ok}/${results.length} tests réussis. Captures d'écran : ${OUT}`);
process.exit(ok === results.length ? 0 : 1);
