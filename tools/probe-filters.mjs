// probe-filters.mjs — verifica quali FILTRI/ORDINAMENTI offre la Ad Library pubblica senza login.
// Domanda chiave: il filtro per data di inizio funziona via URL? (accorcia il censimento dei brand enormi)
// Uso: NODE_PATH=~/.invoice-tools/node_modules node probe-filters.mjs

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE =
  "https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=US" +
  "&q=" + encodeURIComponent("emma relief") +
  "&search_type=keyword_unordered&media_type=all";

// finestra di date stretta (ultimi ~60 gg) — sintassi bracket di Meta
const DATED = BASE + "&start_date[min]=2026-05-25&start_date[max]=2026-07-24";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function extractCount(txt) {
  const m = txt.match(/~?\s?([\d.,]+)\s+(risultati|results?)/i);
  return m ? m[0].trim() : "n/d";
}

async function loadAndProbe(page, url, label) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  } catch (e) {
    console.log(`[${label}] goto lento:`, e.message);
  }
  await page.waitForTimeout(2500);
  // consenso cookie (una volta basta, ma ritentiamo per sicurezza)
  for (const name of ["Consenti tutti i cookie", "Allow all cookies", "Accetta tutti", "Rifiuta cookie facoltativi", "Decline optional cookies"]) {
    const btn = page.getByRole("button", { name }).first();
    if (await btn.count().catch(() => 0)) { try { await btn.click({ timeout: 2500 }); break; } catch {} }
  }
  await page.waitForTimeout(3500);
  const txt = await page.evaluate(() => document.body.innerText || "");
  return { count: extractCount(txt), len: txt.length, url };
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  locale: "it-IT",
  viewport: { width: 1440, height: 2000, deviceScaleFactor: 1 },
  userAgent: UA,
});
const page = await ctx.newPage();

console.log("\n=== TEST 1: filtro data via URL (conteggio con/senza finestra) ===");
const base = await loadAndProbe(page, BASE, "BASE");
console.log("  SENZA finestra :", base.count);
const dated = await loadAndProbe(page, DATED, "DATED");
console.log("  CON finestra   :", dated.count, "  (URL data:", DATED.includes("start_date") ? "accettato" : "no", ")");

console.log("\n=== TEST 2: controlli filtro/ordinamento nella UI ===");
// cerchiamo i testi dei filtri e degli eventuali dropdown di sort
const controls = await page.evaluate(() => {
  const out = { bottoni: [], combobox: [], parole_sort: [] };
  document.querySelectorAll('[role="button"], button').forEach((b) => {
    const t = (b.innerText || "").trim();
    if (t && t.length < 40) out.bottoni.push(t);
  });
  document.querySelectorAll('[role="combobox"], select').forEach((c) => {
    const t = (c.innerText || c.getAttribute("aria-label") || "").trim();
    if (t) out.combobox.push(t.slice(0, 60));
  });
  const body = document.body.innerText || "";
  ["Ordina", "Sort", "Più recenti", "Newest", "Meno recenti", "Data di inizio", "Start date", "Filtri", "Filters"].forEach((w) => {
    if (new RegExp(w, "i").test(body)) out.parole_sort.push(w);
  });
  return out;
});
const uniq = (a) => [...new Set(a)];
console.log("  bottoni (unici, primi 25):", uniq(controls.bottoni).slice(0, 25));
console.log("  combobox/dropdown        :", uniq(controls.combobox));
console.log("  parole filtro/sort trovate:", uniq(controls.parole_sort));

await browser.close();
console.log("\n=== FINE ===");
