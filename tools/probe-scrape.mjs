// probe-scrape.mjs — TEST DI FATTIBILITÀ Piano B (no-login).
// Apre la Ad Library pubblica per un advertiser e verifica se riusciamo a
// leggere le ads + fare screenshot, gestendo il consenso cookie EU.
// NON è lo scraper finale: serve solo a de-rischiare l'approccio.
//
// Uso: node tools/probe-scrape.mjs "marco lutzu"   (diagnostica: rieseguire se Meta cambia layout)

import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const q = process.argv[2] || "marco lutzu";
const OUT = process.argv[3] || join(tmpdir(), "adlib-probe.png");

const url =
  "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=IT" +
  `&q=${encodeURIComponent(q)}&search_type=keyword_unordered&media_type=all`;

console.log(`\n🔎 PROBE Ad Library (no-login)\n   query : "${q}"\n   url   : ${url}\n`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: "it-IT",
  viewport: { width: 1440, height: 2200, deviceScaleFactor: 1 },
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();

// intercetta le risposte GraphQL che potrebbero contenere i dati delle ads
let graphqlHits = 0;
page.on("response", (res) => {
  const u = res.url();
  if (u.includes("/api/graphql") || u.includes("graphql")) graphqlHits++;
});

try {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
} catch (e) {
  console.log("⚠️ goto lento/timeout:", e.message);
}

// --- consenso cookie EU: prova a cliccare un bottone di accettazione/rifiuto ---
await page.waitForTimeout(2500);
const consentLabels = [
  "Consenti tutti i cookie",
  "Consenti tutti",
  "Accetta tutti",
  "Rifiuta cookie facoltativi",
  "Allow all cookies",
  "Decline optional cookies",
];
let consentClicked = null;
for (const label of consentLabels) {
  const btn = page.getByRole("button", { name: label }).first();
  if (await btn.count().catch(() => 0)) {
    try {
      await btn.click({ timeout: 3000 });
      consentClicked = label;
      break;
    } catch {}
  }
}
console.log(consentClicked ? `🍪 consenso: cliccato "${consentClicked}"` : "🍪 consenso: nessun dialog trovato (o già passato)");

// lascia caricare i risultati e scrolla per far comparire le card
await page.waitForTimeout(3500);
for (let i = 0; i < 4; i++) {
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(1200);
}

// --- segnali che le ads sono davvero caricate ---
const bodyText = await page.evaluate(() => document.body.innerText || "");
const hasLibraryId = /Identificativo della libreria|Library ID/i.test(bodyText);
const startedRunning = (bodyText.match(/Inizio pubblicazione|Started running/gi) || []).length;
const resultsCount = (bodyText.match(/~?\s?[\d.]+\s+risultati|results?/i) || [])[0] || "n/d";
const loginWall = /Accedi a Facebook|Log in to Facebook|Log into Facebook/i.test(bodyText);

await page.screenshot({ path: OUT, fullPage: false });

console.log("\n--- ESITO PROBE ---");
console.log("login wall bloccante :", loginWall ? "❌ SÌ (problema)" : "✅ no");
console.log("chiamate graphql     :", graphqlHits);
console.log("risultati (testo)    :", resultsCount);
console.log("'Identificativo libreria' presente:", hasLibraryId ? "✅ sì" : "❌ no");
console.log("occorrenze 'Inizio pubblicazione' :", startedRunning);
console.log("lunghezza testo pagina:", bodyText.length, "caratteri");
console.log("screenshot →", OUT);
console.log("\nprime 600 char del testo pagina:\n", bodyText.slice(0, 600).replace(/\n{2,}/g, "\n"));

await browser.close();
