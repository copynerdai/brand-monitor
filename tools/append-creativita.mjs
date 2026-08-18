// append-creativita.mjs — IL CONTENITORE. Scrive <brand>/creativita-<anno>.md.
//
// Un file per brand per anno, che raccoglie TUTTE le creatività censite: copy verbatim e,
// per i video, trascrizione integrale. Sostituisce i vecchi trascrizioni-<settimana>.md, che
// ri-elencavano ogni settimana le stesse creatività ancora attive (95% di duplicazione).
//
// GARANZIA: le sezioni già scritte non vengono MAI modificate né riordinate. Il tool
//   1. legge le sezioni esistenti e le ritiene byte per byte,
//   2. completa SOLO quelle marcate <!-- incompleta --> se nel frattempo è arrivato il contenuto,
//   3. appende in fondo le creatività nuove,
//   4. rigenera l'indice in testa (l'unica parte volatile, perché contiene gg e varianti).
//
// Le sezioni contengono solo FATTI IMMUTABILI (titolo dell'ad, data di attivazione, landing, url).
// I contatori che cambiano ogni run (giorni attivi, varianti, scheda collegata) vivono solo
// nell'indice: così il corpo del file non ha mai motivo di essere riscritto.
//
// Uso:
//   node tools/append-creativita.mjs <brand-slug> [--anno 2026] [--root <archivio>] [--dry]
//
// Fonti del contenuto, in ordine di priorità (la prima che ha il dato vince):
//   1. i manifest _run*.json del brand           (copy + trascrizione)
//   2. i vecchi trascrizioni-<settimana>.md      (solo trascrizione)
//   3. le schede in ads/                         (copy + trascrizione, per i brand il cui manifest è stato sovrascritto)

import { writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { haParlatoUtile } from "./lib-parlato.mjs";

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { const k = argv[i].slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
  else pos.push(argv[i]);
}
const BRAND = pos[0];
if (!BRAND) { console.error("Uso: node append-creativita.mjs <brand-slug> [--anno 2026] [--dry]"); process.exit(1); }

const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveArchiveRoot() {
  if (flags.root) return flags.root;
  if (process.env.BRAND_MONITOR_ARCHIVE) return process.env.BRAND_MONITOR_ARCHIVE;
  const cfg = join(__dirname, "..", "archive-root.txt");
  if (existsSync(cfg)) { const p = readFileSync(cfg, "utf8").trim(); if (p) return p; }
  console.error("Archivio non configurato: archive-root.txt / --root / BRAND_MONITOR_ARCHIVE.");
  process.exit(1);
}
const BRAND_DIR = join(resolveArchiveRoot(), BRAND);
const ledger = JSON.parse(readFileSync(join(BRAND_DIR, "ledger.json"), "utf8"));
const config = existsSync(join(BRAND_DIR, "config.json")) ? JSON.parse(readFileSync(join(BRAND_DIR, "config.json"), "utf8")) : {};

// ---------------------------------------------------------------- raccolta contenuti
const contenuto = new Map();   // ad_id → { copy, trascrizione, title, page_name, link_url, formato }
const merge = (id, dati) => {
  const c = contenuto.get(id) || {};
  for (const [k, v] of Object.entries(dati)) if (v && !c[k]) c[k] = v;
  contenuto.set(id, c);
};

// 1. manifest (_run.json e i vecchi _run-<settimana>.json)
for (const f of readdirSync(BRAND_DIR).filter(f => /^_run.*\.json$/.test(f)).sort()) {
  const m = JSON.parse(readFileSync(join(BRAND_DIR, f), "utf8"));
  for (const it of [...(m.deep || []), ...(m.light || [])]) {
    merge(String(it.ledger_key || it.rep_id), {
      copy: it.copy, trascrizione: it.trascrizione, title: it.title,
      page_name: it.page_name, link_url: it.link_url, formato: it.formato_guess,
    });
    if (it.rep_id && String(it.rep_id) !== String(it.ledger_key || it.rep_id)) {
      merge(String(it.rep_id), { copy: it.copy, trascrizione: it.trascrizione, title: it.title, page_name: it.page_name, link_url: it.link_url });
    }
  }
}

// 2. vecchi trascrizioni-<settimana>.md — sezioni "### N. `<id>` · …"
for (const f of readdirSync(BRAND_DIR).filter(f => /^trascrizioni-.*\.md$/.test(f))) {
  const righe = readFileSync(join(BRAND_DIR, f), "utf8").split("\n");
  let id = null, buf = [];
  const chiudi = () => { if (id && buf.length) merge(id, { trascrizione: buf.join("\n").trim() }); id = null; buf = []; };
  for (const r of righe) {
    const h = r.match(/^###\s+\d+\.\s+`(\d+)`/);
    if (h) { chiudi(); id = h[1]; continue; }
    if (/^(##\s|---\s*$)/.test(r)) { chiudi(); continue; }
    if (id === null) continue;
    if (/^\[Ad Library\]/.test(r.trim())) continue;   // riga dei link, non testo
    buf.push(r);
  }
  chiudi();
}

// 3. schede — "## Copy (post)" e "## Trascrizione (parlato)"
const ADS_DIR = join(BRAND_DIR, "ads");
const schedaDi = new Map();   // ad_id → percorso relativo della scheda
if (existsSync(ADS_DIR)) {
  for (const f of readdirSync(ADS_DIR).filter(f => f.endsWith(".md"))) {
    const txt = readFileSync(join(ADS_DIR, f), "utf8");
    const id = (txt.match(/^ad_id:\s*"?(\d+)/m) || [])[1];
    if (!id) continue;
    schedaDi.set(id, `ads/${f}`);
    const sez = (titolo) => {
      // (?![\s\S]) = fine stringa vera; con il flag "m" un "$" chiuderebbe alla prima riga
      const m = txt.match(new RegExp(`^## ${titolo}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |(?![\\s\\S]))`, "m"));
      if (!m) return null;
      const corpo = m[1].split("\n").filter(r => r.trim().startsWith(">")).map(r => r.replace(/^\s*>\s?/, "")).join("\n").trim();
      return corpo || null;
    };
    const copy = sez("Copy \\(post\\)");
    // le schede che rimandano al copy standard non contengono il testo: si scarta il rimando
    merge(id, { copy: copy && copy.length > 40 ? copy : null, trascrizione: sez("Trascrizione \\(parlato\\)") });
  }
}

// ---------------------------------------------------------------- schede orfane
// Una scheda il cui ad_id non ha più una riga a ledger (il rappresentante di un cluster può
// cambiare fra un run e l'altro) è comunque la prova che quella creatività è esistita, e spesso
// è l'UNICO posto in cui vive la sua trascrizione. L'archivio deve contenerla: si ricostruisce
// una riga sintetica dal frontmatter della scheda.
const orfane = [];
for (const [id, percorso] of schedaDi) {
  if (ledger[id]) continue;
  const txt = readFileSync(join(BRAND_DIR, percorso), "utf8");
  const campo = (k) => (txt.match(new RegExp(`^${k}:\\s*"?([^"\\n]+)"?\\s*$`, "m")) || [])[1];
  orfane.push([id, {
    brand: BRAND, formato: campo("formato"), angolo_1riga: campo("angolo"),
    attiva_dal: campo("attiva_dal"), prima_vista: campo("prima_vista"),
    giorni_attivi: Number(campo("giorni_attivi")) || null, varianti_attive: Number(campo("varianti_attive")) || null,
    video: /^## Trascrizione/m.test(txt), scheda: percorso, orfana: true,
    url_ad_library: campo("url") || `https://www.facebook.com/ads/library/?id=${id}`,
  }]);
}
if (orfane.length) console.log(`  ℹ️  ${orfane.length} schede senza riga a ledger recuperate nel contenitore: ${orfane.map(([i]) => i).join(", ")}`);

// Stesso principio, un giro più in là: contenuto raccolto da un run precedente (vecchi manifest,
// vecchi file trascrizioni) la cui creatività non ha né riga a ledger né scheda. Succede quando il
// rappresentante di un cluster cambia fra due run. Se il testo esiste, va archiviato: buttarlo
// sarebbe l'unica perdita irreversibile di tutta la pipeline.
const recuperate = [];
for (const [id, c] of contenuto) {
  if (ledger[id] || schedaDi.has(id)) continue;
  if (!(c.copy || "").trim() && !haParlatoUtile(c.trascrizione)) continue;
  recuperate.push([id, {
    brand: BRAND, formato: c.formato || "n/d", angolo_1riga: null,
    attiva_dal: null, prima_vista: null, giorni_attivi: null, varianti_attive: null,
    video: haParlatoUtile(c.trascrizione), scheda: null, recuperata: true,
    url_ad_library: `https://www.facebook.com/ads/library/?id=${id}`,
  }]);
}
if (recuperate.length) console.log(`  ℹ️  ${recuperate.length} creatività recuperate da run precedenti (nessuna riga a ledger): ${recuperate.map(([i]) => i).join(", ")}`);

// ---------------------------------------------------------------- creatività da scrivere, per anno
const ANNO_FORZATO = flags.anno ? String(flags.anno) : null;
const perAnno = new Map();
for (const [id, r] of [...Object.entries(ledger), ...orfane, ...recuperate]) {
  // anno = quello della prima volta che l'abbiamo vista; una creatività non cambia mai file.
  // Le recuperate senza data finiscono nell'anno corrente: è l'anno in cui entrano in archivio.
  const anno = ANNO_FORZATO || (String(r.prima_vista || r.attiva_dal || "").slice(0, 4) || String(new Date().getFullYear()));
  if (ANNO_FORZATO && String(r.prima_vista || "").slice(0, 4) !== ANNO_FORZATO) continue;
  if (!perAnno.has(anno)) perAnno.set(anno, []);
  perAnno.get(anno).push([id, r]);
}

// vista unica su cui lavora il resto del tool: righe di ledger + orfane recuperate
const tutte = new Map([...Object.entries(ledger), ...orfane, ...recuperate]);

const esc = (s) => String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ").trim();
const cita = (s) => String(s).trim().split("\n").map(r => "> " + r).join("\n");

let totNuove = 0, totCompletate = 0, totInvariate = 0, totIncomplete = 0;

for (const [anno, righe] of [...perAnno.entries()].sort()) {
  const DEST = join(BRAND_DIR, `creativita-${anno}.md`);

  // sezioni già scritte: si conservano byte per byte
  const esistenti = new Map();
  const ordine = [];
  if (existsSync(DEST)) {
    // si spezza direttamente sulle sezioni: frontmatter e indice non contengono "### <id>"
    const txt = readFileSync(DEST, "utf8");
    for (const blocco of txt.split(/(?=^### \d+$)/m)) {
      const h = blocco.match(/^### (\d+)$/m);
      if (!h) continue;
      esistenti.set(h[1], blocco.replace(/\n+$/, ""));
      ordine.push(h[1]);
    }
  }

  // ordinamento deterministico delle NUOVE: per data di attivazione, poi per id
  const nuove = righe.filter(([id]) => !esistenti.has(id))
    .sort((a, b) => String(a[1].attiva_dal).localeCompare(String(b[1].attiva_dal)) || a[0].localeCompare(b[0]));

  function sezione(id, r) {
    const c = contenuto.get(id) || {};
    const landing = (c.link_url || "").replace(/^https?:\/\//, "").split("?")[0];
    const out = [];
    out.push(`### ${id}`);
    const testa = [`**${c.page_name || config.nome || BRAND} · ${r.formato || c.formato || "n/d"}**`];
    if (r.attiva_dal) testa.push(`attiva dal ${r.attiva_dal}`);
    if (c.title) testa.push(`titolo ad: *"${esc(c.title)}"*`);
    if (landing) testa.push(`landing \`${landing}\``);
    out.push(testa.join(" · "));
    out.push(`🔗 [Ad Library](${r.url_ad_library})`);
    const haCopy = c.copy && c.copy.trim();
    const haTr = c.trascrizione && haParlatoUtile(c.trascrizione);
    if (haCopy) { out.push(""); out.push("**Copy**"); out.push(cita(c.copy)); }
    if (haTr) { out.push(""); out.push("**Trascrizione**"); out.push(cita(c.trascrizione)); }
    else if (r.video && c.trascrizione) { out.push(""); out.push("**Trascrizione** — nessun parlato: video musicale o solo testo a schermo."); }
    if (!haCopy && !haTr) {
      out.splice(1, 0, "<!-- incompleta -->");
      out.push("");
      out.push("> _Contenuto non ancora in archivio — verrà riempito al prossimo censimento che intercetta questa creatività._");
    }
    return { testo: out.join("\n"), completa: !!(haCopy || haTr) };
  }

  // completamento delle sezioni rimaste incomplete
  for (const id of ordine) {
    if (!esistenti.get(id).includes("<!-- incompleta -->")) { totInvariate++; continue; }
    const r = tutte.get(id);
    if (!r) { totInvariate++; continue; }
    const s = sezione(id, r);
    if (s.completa) { esistenti.set(id, s.testo); totCompletate++; } else { totIncomplete++; }
  }

  // append delle nuove, in fondo
  for (const [id, r] of nuove) {
    const s = sezione(id, r);
    esistenti.set(id, s.testo);
    ordine.push(id);
    totNuove++;
    if (!s.completa) totIncomplete++;
  }

  // ---------------- indice (unica parte rigenerata a ogni run)
  // quali creatività hanno già un'analisi scritta: si legge dalle sezioni di analisi-<anno>.md
  const FILE_ANALISI = join(BRAND_DIR, `analisi-${anno}.md`);
  const idAnalizzati = new Set(existsSync(FILE_ANALISI)
    ? [...readFileSync(FILE_ANALISI, "utf8").matchAll(/^### (\d+)$/gm)].map(m => m[1]) : []);

  const perIndice = ordine.map(id => [id, tutte.get(id)]).filter(([, r]) => r)
    .sort((a, b) => (b[1].varianti_attive || 0) - (a[1].varianti_attive || 0) || (b[1].giorni_attivi || 0) - (a[1].giorni_attivi || 0));
  const conParlato = ordine.filter(id => (esistenti.get(id) || "").includes("**Trascrizione**\n>")).length;

  const testa = [];
  testa.push(`# ${config.nome || BRAND} — creatività ${anno}`);
  testa.push("");
  testa.push(`> **Contenitore append-only**: ogni creatività censita compare qui **una volta sola**, con copy verbatim e — se video — trascrizione integrale. Le sezioni non vengono mai riscritte; le nuove si aggiungono in fondo.`);
  testa.push(`> **${ordine.length} creatività** · ${conParlato} con trascrizione${totIncomplete ? ` · ${totIncomplete} in attesa di contenuto` : ""}`);
  testa.push(`> Indice ordinato per varianti attive (= quanto budget ci spingono dietro). Giorni e varianti si aggiornano a ogni run; il corpo no.`);
  testa.push(`> Pagina del brand: [brand.md](brand.md) · analisi: [analisi-${anno}.md](analisi-${anno}.md) · stato macchina: \`ledger.json\``);
  testa.push("");
  testa.push("## Indice");
  testa.push("");
  testa.push("| Ad | Angolo / titolo | Formato | gg | var | Analisi |");
  testa.push("|---|---|---|---|---|---|");
  for (const [id, r] of perIndice) {
    const c = contenuto.get(id) || {};
    const etichetta = r.angolo_1riga || (c.title ? `*${esc(c.title)}*` : "—");
    const analizzata = idAnalizzati.has(id);
    testa.push(`| [\`${id}\`](#${id}) | ${esc(etichetta)} | ${esc(r.formato || c.formato || "n/d")} | ${r.giorni_attivi ?? ""} | ${r.varianti_attive ?? ""} | ${analizzata ? `[📄](analisi-${anno}.md#${id})` : ""} |`);
  }
  testa.push("");
  testa.push("---");
  testa.push("");

  const finale = testa.join("\n") + ordine.map(id => esistenti.get(id)).join("\n\n") + "\n";
  if (flags.dry) console.log(`[dry] ${DEST} — ${ordine.length} sezioni (${totNuove} nuove, ${totCompletate} completate)`);
  else writeFileSync(DEST, finale);
  console.log(`✓ creativita-${anno}.md · ${ordine.length} creatività · ${conParlato} con trascrizione`);
}

console.log(`  nuove appese: ${totNuove} · completate: ${totCompletate} · invariate: ${totInvariate} · ancora senza contenuto: ${totIncomplete}`);
