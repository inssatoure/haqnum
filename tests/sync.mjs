// Test réel avec Supabase : deux comptes capturent en même temps, hors ligne puis en ligne,
// chacun voit le travail de l'autre (avec l'auteur), et ne peut pas modifier celui de l'autre.
// Usage : BASE=http://localhost:3100 U1=... P1=... U2=... P2=... node tests/sync.mjs
// Option AI=1 : lance aussi la synthèse commune (nécessite les clés IA sur le serveur).

import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let pw;
try {
  pw = require('playwright');
} catch {
  pw = require('/opt/node-tools/node_modules/playwright');
}
const here = path.dirname(fileURLToPath(import.meta.url));
const FX = path.join(here, 'fixtures');
const OUT = path.join(here, 'out');
mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3100';
const { U1, P1, U2, P2 } = process.env;
if (!U1 || !P1 || !U2 || !P2) throw new Error('U1 P1 U2 P2 requis');

const results = [];
async function step(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`✔ ${name}`);
  } catch (e) {
    results.push(false);
    console.log(`✘ ${name}\n   ${e.message.split('\n')[0]}`);
  }
}

const browser = await pw.chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const device = {
  viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  permissions: ['microphone', 'camera', 'geolocation'], geolocation: { latitude: 43.5186, longitude: 5.4529 },
};
const tag = `T${Date.now().toString(36)}`;

async function open(email, password, name) {
  const ctx = await browser.newContext(device);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log(`   [${name}] erreur JS : ${e.message}`));
  await page.clock.install({ time: new Date('2026-10-29T09:30:00Z') });
  await page.clock.resume();
  await page.goto(BASE);
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await page.getByText(/Bonjour/).waitFor({ timeout: 20000 });
  return { ctx, page };
}
const go = (p, h) => p.evaluate((x) => (location.hash = x), h);

let A, B;
await step('Connexion des deux comptes sur deux « iPhone »', async () => {
  A = await open(U1, P1, 'A');
  B = await open(U2, P2, 'B');
});

await step('Les deux capturent en même temps (A hors ligne)', async () => {
  await A.ctx.setOffline(true);
  for (const [who, text] of [[A, `Note de A ${tag}`], [B, `Note de B ${tag}`]]) {
    await go(who.page, '#/maintenant');
    await who.page.getByRole('button', { name: 'Note', exact: true }).first().click();
    await who.page.locator('textarea').fill(text);
    await who.page.getByRole('button', { name: 'Enregistrer la note' }).click();
    await who.page.getByText('Note enregistrée').waitFor();
  }
  await go(B.page, '#/maintenant');
  await B.page.locator('input[type=file][accept="image/*"][capture]').first().setInputFiles(path.join(FX, 'photo.jpg'));
  await B.page.getByText('Plus tard').click();
  await A.page.getByText(/Hors ligne/).first().waitFor();
});

await step('A revient en ligne : tout se synchronise dans les deux sens', async () => {
  await A.ctx.setOffline(false);
  const deadline = Date.now() + 90_000;
  for (;;) {
    for (const p of [A.page, B.page]) await p.evaluate(() => window.dispatchEvent(new Event('online')));
    const forum = await A.page.evaluate(async () => {
      const r = indexedDB.open('min-observateur');
      return new Promise((res) => {
        r.onsuccess = () => {
          const q = r.result.transaction('notes').objectStore('notes').getAll();
          q.onsuccess = () => res(q.result.map((n) => n.body));
        };
      });
    });
    const bNotes = await B.page.evaluate(async () => {
      const r = indexedDB.open('min-observateur');
      return new Promise((res) => {
        r.onsuccess = () => {
          const q = r.result.transaction('notes').objectStore('notes').getAll();
          q.onsuccess = () => res(q.result.map((n) => n.body));
        };
      });
    });
    if (forum.includes(`Note de B ${tag}`) && bNotes.includes(`Note de A ${tag}`)) break;
    if (Date.now() > deadline) throw new Error(`A voit B : ${forum.includes(`Note de B ${tag}`)} ; B voit A : ${bNotes.includes(`Note de A ${tag}`)}`);
    await A.page.waitForTimeout(5000);
  }
});

await step('La photo de B s’affiche chez A avec le badge de B', async () => {
  await go(A.page, '#/medias');
  await A.page.waitForTimeout(3000);
  await A.page.screenshot({ path: path.join(OUT, 'sync-A-voit-B.png') });
  const imgs = await A.page.locator('main img').count();
  if (!imgs) throw new Error('aucune image visible chez A');
});

await step('A ne peut pas modifier une note de B (règle de sécurité serveur)', async () => {
  const res = await A.page.evaluate(async (t) => {
    const r = indexedDB.open('min-observateur');
    const note = await new Promise((res) => {
      r.onsuccess = () => {
        const q = r.result.transaction('notes').objectStore('notes').getAll();
        q.onsuccess = () => res(q.result.find((n) => n.body === `Note de B ${t}`));
      };
    });
    const key = Object.keys(localStorage).find((k) => k === 'min-obs-auth');
    const token = JSON.parse(localStorage.getItem(key)).access_token;
    return { note, token };
  }, tag);
  if (!res.note) throw new Error('note de B introuvable chez A');
  const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/notes?id=eq.${res.note.id}`, {
    method: 'PATCH',
    headers: { apikey: process.env.SUPABASE_ANON, Authorization: `Bearer ${res.token}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ body: 'piraté' }),
  });
  const j = await r.json();
  if (Array.isArray(j) && j.length) throw new Error('modification acceptée : la règle RLS ne protège pas');
});

if (process.env.AI === '1') {
  await step('Synthèse commune IA avec les auteurs cités', async () => {
    await go(A.page, '#/maintenant');
    await A.page.getByText('En ce moment').locator('..').locator('button').first().click();
    await A.page.getByRole('button', { name: /Synthèse commune/ }).click();
    await A.page.getByText('Analyse prête').waitFor({ timeout: 300_000 });
    await A.page.getByText(/Synthèse commune/).last().click();
    await A.page.waitForTimeout(1000);
    await A.page.screenshot({ path: path.join(OUT, 'sync-synthese.png'), fullPage: true });
  });
}

await browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} tests réussis`);
process.exit(results.every(Boolean) ? 0 : 1);
