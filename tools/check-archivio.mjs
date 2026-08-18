// check-archivio.mjs — sincronizza il ledger e verifica la coerenza dell'archivio di un brand.
//
// Struttura attesa (tre documenti per brand + due file macchina):
//   brand.md              pagina d'ingresso e RIGA della tracksheet (frontmatter coi numeri)
//   creativita-<anno>.md  contenuto: indice + copy verbatim + trascrizioni, una sezione per ad_id
//   analisi-<anno>.md     giudizio: osservazioni di periodo + un'analisi per creatività
//   ledger.json           stato macchina · _run.json  manifest dell'ultimo run
//
// SYNC  — legge `Angolo (1 riga)` e `Formato` dalle analisi e li riporta sul ledger; segna
//         `trascritta` su ogni riga video del manifest.
// CHECK — creatività a ledger senza sezione nel contenitore (il controllo che conta: vorrebbe dire
//         contenuto non archiviato), analisi che puntano a creatività inesistenti, frontmatter di
//         brand.md rotto, residui delle strutture precedenti.
//
// Uso: node tools/check-archivio.mjs <brand-slug> [--no-sync] [--root <archivio>]
// Esce con codice 1 se trova incoerenze.

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
if (!BRAND) { console.error("Uso: node check-archivio.mjs <brand-slug> [--no-sync]"); process.exit(1); }

const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveArchiveRoot() {
  if (flags.root) return flags.root;
  if (process.env.BRAND_MONITOR_ARCHIVE) return process.env.BRAND_MONITOR_ARCHIVE;
  const cfg = join(__dirname, "..", "archive-root.txt");
  if (existsSync(cfg)) { const p = readFileSync(cfg, "utf8").trim(); if (p) return p; }
  console.error("Archivio non configurato: archive-root.txt / --root / BRAND_MONITOR_ARCHIVE.");
  process.exit(1);
}
const DIR = join(resolveArchiveRoot(), BRAND);
const LEDGER_PATH = join(DIR, "ledger.json");
const ledger = existsSync(LEDGER_PATH) ? JSON.parse(readFileSync(LEDGER_PATH, "utf8")) : {};
const manifest = existsSync(join(DIR, "_run.json")) ? JSON.parse(readFileSync(join(DIR, "_run.json"), "utf8")) : null;

const contenitori = readdirSync(DIR).filter(f => /^creativita-\d+\.md$/.test(f)).sort();
const fileAnalisi = readdirSync(DIR).filter(f => /^analisi-\d+\.md$/.test(f)).sort();
const testoCont = contenitori.map(f => readFileSync(join(DIR, f), "utf8")).join("\n");
const testoAnalisi = fileAnalisi.map(f => readFileSync(join(DIR, f), "utf8")).join("\n");
const sezioniDi = (t) => new Set([...t.matchAll(/^### (\d+)$/gm)].map(m => m[1]));
const idContenuto = sezioniDi(testoCont);
const idAnalisi = sezioniDi(testoAnalisi);

const problemi = [];   // bloccanti: qualcosa è incoerente o perso
const note = [];       // spiegabili: da sapere, non fanno fallire il check

// ---------- 1. SYNC: angolo e formato dalle analisi → ledger ----------
let sincronizzate = 0;
if (!flags["no-sync"]) {
  for (const f of fileAnalisi) {
    const t = readFileSync(join(DIR, f), "utf8");
    for (const blocco of t.split(/(?=^### \d+$)/m)) {
      const id = (blocco.match(/^### (\d+)$/m) || [])[1];
      if (!id || !ledger[id]) continue;
      const angolo = (blocco.match(/^-\s*\*\*Angolo \(1 riga\)\*\*:\s*(.+)$/m) || [])[1];
      const formato = (blocco.match(/^-\s*\*\*Formato\*\*:\s*(.+)$/m) || [])[1];
      if (angolo) ledger[id].angolo_1riga = angolo.replace(/\*\*/g, "").trim();
      if (formato) ledger[id].formato = formato.replace(/\*\*/g, "").trim();
      ledger[id].analisi = `${f}#${id}`;
      sincronizzate++;
    }
  }
}

// `trascritta` è un fatto del run: va su ogni riga video del manifest, non solo su quelle analizzate
let videoTot = 0, videoTrascritti = 0, videoMuti = 0, videoFalliti = 0;
if (manifest) {
  for (const it of (manifest.deep || [])) {
    if (!it.video) continue;
    videoTot++;
    if (haParlatoUtile(it.trascrizione)) videoTrascritti++;
    else if (it.trascrizione_errore) videoFalliti++;
    else videoMuti++;
    const riga = ledger[it.ledger_key || it.rep_id];
    if (riga && !flags["no-sync"]) riga.trascritta = haParlatoUtile(it.trascrizione);
  }
}
if (!flags["no-sync"]) writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + "\n");

// ---------- 2. CHECK ----------
if (!contenitori.length) problemi.push("nessun creativita-<anno>.md: lancia append-creativita.mjs");
if (!existsSync(join(DIR, "brand.md"))) problemi.push("manca brand.md: lancia componi-brand.mjs");
else {
  const t = readFileSync(join(DIR, "brand.md"), "utf8");
  const m = t.match(/^---\n([\s\S]*?)\n---/);
  if (!m) problemi.push("brand.md senza frontmatter: non comparirà nella tracksheet");
  else {
    if (!/^tipo:\s*brand-monitorato\s*$/m.test(m[1])) problemi.push("brand.md: manca `tipo: brand-monitorato`, la riga non compare in tracksheet");
    // un valore non quotato che contiene ": " rompe il YAML e Obsidian scarta la nota IN SILENZIO
    for (const line of m[1].split("\n")) {
      const mm = line.match(/^([a-z_]+):\s+(.*)$/i);
      if (!mm) continue;
      const v = mm[2].trim();
      if (!v || v.startsWith('"') || v.startsWith("'") || v.startsWith("[")) continue;
      if (/:\s/.test(v)) problemi.push(`brand.md: \`${mm[1]}\` contiene ": " e non è fra virgolette → YAML rotto, Obsidian scarta la nota senza errori`);
    }
  }
}

// ogni creatività a ledger deve avere la sua sezione nel contenitore
let senzaSezione = 0;
for (const k of Object.keys(ledger)) {
  if (!idContenuto.has(k)) { senzaSezione++; if (senzaSezione <= 5) problemi.push(`creatività ${k} a ledger ma senza sezione nel contenitore`); }
}
if (senzaSezione > 5) problemi.push(`…e altre ${senzaSezione - 5} creatività senza sezione nel contenitore`);

// ogni analisi deve riferirsi a una creatività archiviata
for (const id of idAnalisi) if (!idContenuto.has(id)) problemi.push(`analisi ${id}: non esiste la creatività corrispondente nel contenitore`);

// il manifest corrente non deve avere creatività fuori dal ledger
if (manifest) for (const it of (manifest.deep || [])) {
  const key = it.ledger_key || it.rep_id;
  if (!ledger[key]) problemi.push(`manifest: creatività ${key} censita ma senza riga a ledger`);
}

// residui delle strutture precedenti
for (const f of readdirSync(DIR)) {
  if (f === "ads") problemi.push("residuo: la cartella ads/ — le analisi ora stanno in analisi-<anno>.md");
  if (f === "report") problemi.push("residuo: la cartella report/ — le osservazioni ora stanno in analisi-<anno>.md");
  if (/^trascrizioni-/.test(f)) problemi.push(`residuo: ${f} — il testo vive in creativita-<anno>.md`);
  if (/^_run-\d{4}-W/.test(f)) problemi.push(`residuo: ${f} — il manifest ora è _run.json`);
  if (f === "cruscotto.md") problemi.push("residuo: cruscotto.md — i numeri stanno nel frontmatter di brand.md");
}

// ---------- esito ----------
console.log(`\n🔍 check archivio · ${BRAND}`);
console.log(`   ledger ${Object.keys(ledger).length} creatività · contenitore ${idContenuto.size} sezioni · analisi ${idAnalisi.size}${flags["no-sync"] ? "" : ` (${sincronizzate} sincronizzate)`}`);
if (manifest) console.log(`   ultimo run ${manifest.week || "n/d"} · ${videoTot} video · ${videoTrascritti} con parlato · ${videoMuti} muti · ${videoFalliti} falliti`);
console.log(`   file: ${["brand.md", ...contenitori, ...fileAnalisi, "ledger.json", "config.json"].map(f => `${existsSync(join(DIR, f)) ? "✓" : "✗"} ${f}`).join(" · ")}`);
if (note.length) {
  console.log(`\nℹ️  ${note.length} note (nessun dato a rischio):`);
  for (const n of note) console.log("   · " + n);
}
if (problemi.length) {
  console.log(`\n❌ ${problemi.length} incoerenze:`);
  for (const p of problemi) console.log("   · " + p);
  process.exit(1);
}
console.log(`\n✅ archivio coerente.`);
