// scrape-ads.mjs — MOTORE del brand-monitor (Fase 2).
// Censimento deterministico della Meta Ad Library (no-login) per un brand osservato.
//
// Modello: un BRAND = nome + sito + UNA O PIÙ pagine Facebook da cui sponsorizza.
// La config sta in monitoraggio/<brand>/config.json (scritta una volta). Per ogni pagina
// prende le prime N ads attive (default 100), unisce tutto, raggruppa per CREATIVITÀ
// (cluster_id: video=xpv_asset_id, statica=hash del copy), aggiorna ledger.json, emette
// un manifest _run-<week>.json con cosa il modello deve elaborare (schede + report).
//
// NON scrive schede/report (giudizio → skill brand-monitor.md). NON conserva media.
//
// Uso:
//   NODE_PATH=~/.invoice-tools/node_modules node scrape-ads.mjs <brand-slug> [--pages ID1,ID2] [--country US] [--per-page 100] [--cap 18] [--headed]
//   (senza --pages legge monitoraggio/<brand-slug>/config.json)
//
// config.json:
//   { "nome":"Emma", "sito":"https://emmarelief.com", "paese":"US", "lingua":"en",
//     "pagine_fb":[ {"nome":"Emma","page_id":"123"}, {"nome":"Emma's Mom Hacks","page_id":"456"} ] }
//
// DESIGN di riferimento: ../DESIGN-report-e-tracking.md (§6bis campionamento, §7 run).

import { createRequire } from "node:module";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

// ---------- argomenti ----------
const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { const k = argv[i].slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
  else pos.push(argv[i]);
}
const BRAND = pos[0];
if (!BRAND) { console.error('Uso: node scrape-ads.mjs <brand-slug> [--pages ID1,ID2] [--country US] [--per-page 100] [--cap 18]'); process.exit(1); }

// ---------- percorsi + config ----------
const __dirname = dirname(fileURLToPath(import.meta.url));
// Archivio dati (per-utente, FUORI dal pacchetto): --root → env BRAND_MONITOR_ARCHIVE → archive-root.txt nel pacchetto
function resolveArchiveRoot() {
  if (flags.root) return flags.root;
  if (process.env.BRAND_MONITOR_ARCHIVE) return process.env.BRAND_MONITOR_ARCHIVE;
  const cfg = join(__dirname, "..", "archive-root.txt");
  if (existsSync(cfg)) { const p = readFileSync(cfg, "utf8").trim(); if (p) return p; }
  console.error("Archivio non configurato: crea _system/skills/brand-monitor/archive-root.txt (percorso assoluto della cartella monitoraggio/), oppure --root <path>, oppure BRAND_MONITOR_ARCHIVE.");
  process.exit(1);
}
const MON_ROOT = resolveArchiveRoot();
const BRAND_DIR = join(MON_ROOT, BRAND);
const CONFIG_PATH = join(BRAND_DIR, "config.json");
mkdirSync(join(BRAND_DIR, "ads"), { recursive: true });
mkdirSync(join(BRAND_DIR, "report"), { recursive: true });

let config = existsSync(CONFIG_PATH) ? JSON.parse(readFileSync(CONFIG_PATH, "utf8")) : null;
let pages = [];
if (flags.pages) pages = String(flags.pages).split(",").map(id => ({ page_id: id.trim(), nome: id.trim() }));
else if (config && config.pagine_fb) pages = config.pagine_fb;

const COUNTRY = flags.country || (config && config.paese) || "IT";
const QUERY = flags.query || (config && config.query) || pos[1] || "";
if (!pages.length && !QUERY) {
  console.error(`Nessuna pagina configurata. Crea ${("monitoraggio/" + BRAND + "/config.json")} con "pagine_fb":[{"page_id":"…"}], oppure passa --pages ID1,ID2.`);
  process.exit(1);
}
const PER_PAGE = flags["per-page"] ? parseInt(flags["per-page"], 10) : 100; // "le prime 100 ads" per pagina (Simone)
const CAP = flags.cap ? parseInt(flags.cap, 10) : 18;                        // tetto schede profonde/run
const GATE_DAYS = 14;
const LEDGER_PATH = join(BRAND_DIR, "ledger.json");

// ---------- utilità ----------
const today = new Date();
function isoWeek(d) {
  const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = dt.getUTCDay() || 7; dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const ys = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  return `${dt.getUTCFullYear()}-W${String(Math.ceil((((dt - ys) / 86400000) + 1) / 7)).padStart(2, "0")}`;
}
const WEEK = isoWeek(today);
const todayISO = today.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const hash = (s) => createHash("md5").update(s).digest("hex").slice(0, 10);
const normCopy = (s) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
function videoAssetId(url) {
  if (!url) return null;
  try { const m = url.match(/[?&]efg=([^&]+)/); if (m) { const d = JSON.parse(Buffer.from(decodeURIComponent(m[1]), "base64").toString("utf8")); if (d.xpv_asset_id) return String(d.xpv_asset_id); } } catch {}
  const m2 = url.match(/xpv_asset_id(?:%22%3A|":)(\d+)/); return m2 ? m2[1] : null;
}

// ---------- raccolta GraphQL ----------
const collected = new Map();
function deepFindAds(o) {
  if (!o || typeof o !== "object") return;
  if (Array.isArray(o)) { for (const x of o) deepFindAds(x); return; }
  if (o.ad_archive_id && o.snapshot && !collected.has(o.ad_archive_id)) collected.set(o.ad_archive_id, o);
  for (const k in o) if (o[k] && typeof o[k] === "object") deepFindAds(o[k]);
}
function parseMaybeJson(t) {
  const c = t.replace(/^for\s*\(;;\);/, "").trim();
  try { return [JSON.parse(c)]; } catch {}
  const objs = []; for (const line of c.split("\n")) { const s = line.trim(); if (s) { try { objs.push(JSON.parse(s)); } catch {} } } return objs;
}
function extract(node) {
  const s = node.snapshot || {};
  const videos = []; (s.videos || []).forEach(v => v && videos.push(v.video_hd_url || v.video_sd_url)); (s.cards || []).forEach(c => c && (c.video_hd_url || c.video_sd_url) && videos.push(c.video_hd_url || c.video_sd_url));
  const images = []; (s.images || []).forEach(im => im && images.push(im.original_image_url || im.resized_image_url)); (s.cards || []).forEach(c => c && c.original_image_url && images.push(c.original_image_url));
  const bodies = []; if (s.body && s.body.text) bodies.push(s.body.text); (s.cards || []).forEach(c => c && c.body && bodies.push(c.body));
  const cardsN = (s.cards || []).length;
  return {
    id: String(node.ad_archive_id), page_name: s.page_name || node.page_name || "", page_id: String(node.page_id || s.page_id || ""),
    is_active: node.is_active !== false, start: node.start_date ? new Date(node.start_date * 1000).toISOString().slice(0, 10) : null,
    platforms: node.publisher_platform || [], title: s.title || "", link_url: s.link_url || "", cta: s.cta_text || "",
    copy: bodies.filter(Boolean).join("\n---\n"), videoUrls: videos.filter(Boolean), imageUrls: images.filter(Boolean), cardsN,
  };
}

// ---------- browser: cicla le pagine, prime PER_PAGE ads ciascuna ----------
console.log(`\n🔎 brand-monitor scrape · ${BRAND} (${COUNTRY}) · week ${WEEK}`);
console.log(`   pagine: ${pages.length ? pages.map(p => p.nome || p.page_id).join(", ") : 'query "' + QUERY + '"'} · campione ${PER_PAGE}/pagina · gate ${GATE_DAYS}gg · cap ${CAP}\n`);

const browser = await chromium.launch({ headless: !flags.headed });
const ctx = await browser.newContext({
  locale: "it-IT", viewport: { width: 1440, height: 2400, deviceScaleFactor: 1 },
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});
const page = await ctx.newPage();
let gql = 0;
page.on("response", async (res) => { if (!res.url().includes("/api/graphql")) return; gql++; try { for (const o of parseMaybeJson(await res.text())) deepFindAds(o); } catch {} });

const sources = pages.length ? pages.map(p => ({ label: p.nome || p.page_id, page_id: p.page_id })) : [{ label: `query:${QUERY}`, query: QUERY }];
const wantedPageIds = new Set(pages.map(p => String(p.page_id)));
let anyCapped = false;
let consentDone = false;

for (const src of sources) {
  let u = `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${COUNTRY}&media_type=all`;
  u += src.page_id ? `&view_all_page_id=${src.page_id}` : `&q=${encodeURIComponent(src.query)}&search_type=keyword_unordered`;
  const startSize = collected.size;
  try { await page.goto(u, { waitUntil: "domcontentloaded", timeout: 45000 }); } catch (e) { console.log(`  [${src.label}] goto:`, e.message); }
  await page.waitForTimeout(2500);
  if (!consentDone) {
    for (const label of ["Consenti tutti i cookie", "Consenti tutti", "Allow all cookies", "Accetta tutti", "Rifiuta cookie facoltativi"]) {
      const b = page.getByRole("button", { name: label }).first();
      if (await b.count().catch(() => 0)) { await b.click({ timeout: 2500 }).catch(() => {}); consentDone = true; break; }
    }
  }
  let stable = 0, hit = false;
  for (let i = 0; i < 60; i++) {
    const before = collected.size;
    await page.mouse.wheel(0, 4000); await page.waitForTimeout(1200);
    if (collected.size - startSize >= PER_PAGE) { hit = true; break; }
    if (collected.size === before) { if (++stable >= 4) break; } else stable = 0;
  }
  if (hit) anyCapped = true;
  console.log(`  [${src.label}] +${collected.size - startSize} ads${hit ? " (raggiunto il campione " + PER_PAGE + ", ce ne sono altre)" : " (tutte)"}`);
}
await browser.close();

// ---------- normalizza + (in modalità pagine) filtra alle pagine richieste ----------
let ads = [...collected.values()].map(extract).filter(a => a.start);
if (wantedPageIds.size) ads = ads.filter(a => wantedPageIds.has(a.page_id));
console.log(`\ngraphql: ${gql} · ads raccolte: ${collected.size} · valide (con data${wantedPageIds.size ? " e pagina giusta" : ""}): ${ads.length}${anyCapped ? " · ⚠️ CAMPIONE PARZIALE (100/pagina)" : ""}`);

// ---------- clustering per creatività ----------
const clusters = new Map();
for (const a of ads) {
  const vid = a.videoUrls.length ? videoAssetId(a.videoUrls[0]) : null;
  const cid = vid ? `video-asset-${vid}` : (a.copy ? `statica-${hash(normCopy(a.copy))}` : `statica-id-${a.id}`);
  if (!clusters.has(cid)) clusters.set(cid, { cluster_id: cid, video: !!vid, members: [] });
  clusters.get(cid).members.push(a);
}
const clusterList = [...clusters.values()].map(c => {
  const active = c.members.filter(m => m.is_active); const pool = active.length ? active : c.members;
  const rep = pool.slice().sort((x, y) => new Date(x.start) - new Date(y.start))[0];
  const attiva_dal = pool.map(m => m.start).sort()[0];
  const formato = c.video ? "video" : (rep.cardsN > 1 ? "carosello" : (rep.imageUrls.length ? "statica-immagine" : "sconosciuto"));
  return {
    cluster_id: c.cluster_id, video: c.video, rep_id: rep.id, formato_guess: formato,
    attiva_dal, giorni_attivi: daysBetween(attiva_dal, todayISO), varianti_attive: active.length || c.members.length,
    piattaforme: rep.platforms, page_name: rep.page_name, copy: rep.copy, title: rep.title, cta: rep.cta,
    link_url: rep.link_url, video_url: c.video ? (rep.videoUrls[0] || null) : null,
    url_ad_library: `https://www.facebook.com/ads/library/?id=${rep.id}`,
  };
}).sort((a, b) => b.giorni_attivi - a.giorni_attivi);

// ---------- ledger: dedup per cluster_id ----------
const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")) : {};
const byCluster = new Map(); for (const [k, v] of Object.entries(ledger)) if (v.cluster_id) byCluster.set(v.cluster_id, { key: k, entry: v });
const clusterByCid = new Map(clusterList.map(c => [c.cluster_id, c]));

const manifest = { week: WEEK, brand: BRAND, generato: todayISO, campione_parziale: anyCapped, deep: [], deep_rimandate: [], light: [] };
const seenClusters = new Set();
let nNuove = 0, nNote = 0;

for (const c of clusterList) {
  seenClusters.add(c.cluster_id);
  const known = byCluster.get(c.cluster_id);
  if (known) {
    const e = known.entry; e.stato = "attiva"; e.giorni_attivi = c.giorni_attivi; e.varianti_attive = c.varianti_attive;
    if (!e.settimane_viste.includes(WEEK)) e.settimane_viste.push(WEEK); delete e.spenta_il; nNote++;
  } else {
    nNuove++;
    ledger[c.rep_id] = {
      brand: BRAND, cluster_id: c.cluster_id, formato: c.formato_guess, angolo_1riga: null,
      attiva_dal: c.attiva_dal, prima_vista: todayISO, settimane_viste: [WEEK], stato: "attiva",
      giorni_attivi: c.giorni_attivi, varianti_attive: c.varianti_attive, fascia_impression: "n/d",
      piattaforme: c.piattaforme, video: c.video, trascritta: false, scheda: null, url_ad_library: c.url_ad_library,
    };
  }
}

const itemOf = (c) => ({
  cluster_id: c.cluster_id, rep_id: c.rep_id, formato_guess: c.formato_guess, video: c.video, video_url: c.video_url,
  attiva_dal: c.attiva_dal, giorni_attivi: c.giorni_attivi, varianti_attive: c.varianti_attive, piattaforme: c.piattaforme,
  page_name: c.page_name, title: c.title, cta: c.cta, link_url: c.link_url, url_ad_library: c.url_ad_library, copy: c.copy,
});
const deepCands = [];
for (const [k, v] of Object.entries(ledger)) {
  if (v.stato !== "attiva" || v.scheda || !seenClusters.has(v.cluster_id)) continue;
  const c = clusterByCid.get(v.cluster_id);
  if (v.giorni_attivi >= GATE_DAYS) deepCands.push(c);
  else if (v.prima_vista === todayISO) manifest.light.push(itemOf(c)); // nuova & sotto cancello → lettura leggera
}
deepCands.sort((a, b) => b.giorni_attivi - a.giorni_attivi || b.varianti_attive - a.varianti_attive);
manifest.deep = deepCands.slice(0, CAP).map(itemOf);
manifest.deep_rimandate = deepCands.slice(CAP).map(c => ({ cluster_id: c.cluster_id, rep_id: c.rep_id, giorni_attivi: c.giorni_attivi, varianti_attive: c.varianti_attive }));

// Nota: NON tracciamo le "spente" (decisione Simone 2026-07-24): un'ad che smette di essere vista
// smette di accumulare longevità e scende da sola dai winner → si auto-squalifica. Il gioco è la longevità.

manifest.summary = { creativita_censite: clusterList.length, nuove: nNuove, ancora_attive: nNote, da_scheda_profonda: manifest.deep.length, rimandate: manifest.deep_rimandate.length, da_lettura_leggera: manifest.light.length };
writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");
writeFileSync(join(BRAND_DIR, `_run-${WEEK}.json`), JSON.stringify(manifest, null, 2) + "\n");

// ---------- report a schermo ----------
console.log(`\n=== CENSIMENTO ${BRAND} · ${WEEK} ===`);
console.log(`creatività: ${clusterList.length} (da ${ads.length} ads) · 🆕 nuove ${nNuove} · 🔁 note ${nNote}`);
console.log(`da elaborare: ${manifest.deep.length} schede profonde (cap ${CAP}, ≥${GATE_DAYS}gg) · ${manifest.deep_rimandate.length} rimandate · ${manifest.light.length} letture leggere (novità sotto ${GATE_DAYS}gg)`);
if (anyCapped) console.log(`(campione 100/pagina: alcune pagine hanno più ads — la longevità fa emergere i winner da sola)`);
console.log(`\ntop creatività per longevità:`);
for (const c of clusterList.slice(0, 12)) console.log(`  ${String(c.giorni_attivi).padStart(3)}gg · ${String(c.varianti_attive).padStart(2)}var · ${c.formato_guess.padEnd(16)} · ${(c.copy || c.title || "").slice(0, 46).replace(/\n/g, " ")}`);
console.log(`\n📁 ledger → monitoraggio/${BRAND}/ledger.json · 📄 manifest → monitoraggio/${BRAND}/_run-${WEEK}.json`);
