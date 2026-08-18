// componi-brand.mjs — scrive <brand>/brand.md: la pagina d'ingresso del brand osservato.
//
// È **la riga della tracksheet**: Obsidian Bases fa una riga per nota, e il frontmatter di questo
// file porta i numeri del brand. Cliccando la riga si apre questa pagina, da cui si scende alle
// creatività e alle analisi.
//
// Il file ha due parti con proprietari diversi:
//   · frontmatter + blocco fra i marcatori "numeri"  → li scrive la MACCHINA, si rigenerano a ogni run
//   · tutto ciò che viene dopo il marcatore di fine  → lo scrive l'UMANO (il dossier del brand),
//     e non viene mai toccato. Se il file non esiste, si crea con un dossier segnaposto da riempire.
//
// Uso:
//   node tools/componi-brand.mjs [<brand-slug>] [--root <archivio>]
//   (senza slug: rigenera tutti i brand configurati)

import { writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { const k = argv[i].slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
  else pos.push(argv[i]);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
function resolveArchiveRoot() {
  if (flags.root) return flags.root;
  if (process.env.BRAND_MONITOR_ARCHIVE) return process.env.BRAND_MONITOR_ARCHIVE;
  const cfg = join(__dirname, "..", "archive-root.txt");
  if (existsSync(cfg)) { const p = readFileSync(cfg, "utf8").trim(); if (p) return p; }
  console.error("Archivio non configurato."); process.exit(1);
}
const ARCHIVE = resolveArchiveRoot();

const brands = pos.length ? pos : readdirSync(ARCHIVE).filter(d => {
  try { return statSync(join(ARCHIVE, d)).isDirectory() && existsSync(join(ARCHIVE, d, "ledger.json")); } catch { return false; }
}).sort();

const INIZIO = "<!-- numeri: rigenerati dalla macchina, non modificare a mano -->";
const FINE = "<!-- fine numeri -->";
// un valore con ": " non fra virgolette rompe il YAML e Obsidian scarta la nota in silenzio
const q = (s) => `"${String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

for (const b of brands) {
  const dir = join(ARCHIVE, b);
  const config = existsSync(join(dir, "config.json")) ? JSON.parse(readFileSync(join(dir, "config.json"), "utf8")) : {};
  const ledger = JSON.parse(readFileSync(join(dir, "ledger.json"), "utf8"));
  const run = existsSync(join(dir, "_run.json")) ? JSON.parse(readFileSync(join(dir, "_run.json"), "utf8")) : {};

  const contenitori = readdirSync(dir).filter(f => /^creativita-\d+\.md$/.test(f)).sort();
  const analisi = readdirSync(dir).filter(f => /^analisi-\d+\.md$/.test(f)).sort();
  const anni = [...new Set([...contenitori, ...analisi].map(f => f.match(/(\d+)/)[1]))].sort();

  // le creatività si contano dalle sezioni del contenitore: è l'archivio, non il ledger
  const sezioni = contenitori.flatMap(f => [...readFileSync(join(dir, f), "utf8").matchAll(/^### (\d+)$/gm)].map(m => m[1]));
  const nAnalisi = analisi.reduce((s, f) => s + [...readFileSync(join(dir, f), "utf8").matchAll(/^### (\d+)$/gm)].length, 0);
  const righe = sezioni.map(id => ledger[id]).filter(Boolean);
  const conta = (p) => righe.filter(p).length;
  const peso = [...contenitori, ...analisi].reduce((s, f) => s + statSync(join(dir, f)).size, 0);

  const stat = {
    creativita: sezioni.length,
    ads_attive: righe.reduce((s, r) => s + (r.varianti_attive || 0), 0),
    winner_30gg: conta(r => (r.giorni_attivi || 0) >= 30),
    novita_14gg: conta(r => (r.giorni_attivi || 0) <= 14),
    video: conta(r => r.video),
    trascritte: conta(r => r.trascritta),
    analisi: nAnalisi,
    longevita_max: Math.max(0, ...righe.map(r => r.giorni_attivi || 0)),
  };

  const fm = [
    "---",
    "tipo: brand-monitorato",
    `brand: ${b}`,
    `nome: ${q(config.nome || b)}`,
    `commento: ${q(config.commento || "")}`,
    ...Object.entries(stat).map(([k, v]) => `${k}: ${v}`),
    `ultimo_run: ${q(run.week || "n/d")}`,
    `archivio_kb: ${Math.round(peso / 1024)}`,
    `sito: ${q(config.sito || "")}`,
    `paese: ${q(config.paese || "")}`,
    "---",
  ].join("\n");

  const pagine = (config.pagine_fb || []).map(p => `\`${p.nome}\` (${p.page_id})`).join(" · ");
  const L = [];                                   // le righe si accumulano: "" è una riga vuota vera
  L.push(INIZIO);
  L.push(`**${stat.creativita} creatività** da ${stat.ads_attive} ads attive · 🏆 ${stat.winner_30gg} winner (≥30gg) · 🆕 ${stat.novita_14gg} recenti (≤14gg) · longevità massima ${stat.longevita_max} giorni`);
  L.push(`**${stat.video} video**, di cui ${stat.trascritte} trascritti · **${stat.analisi} analisi** scritte · ultimo censimento ${run.week || "n/d"}`);
  L.push("", "| Dove | Cosa c'è dentro |", "|---|---|");
  for (const a of anni) {
    if (existsSync(join(dir, `creativita-${a}.md`)))
      L.push(`| **[creativita-${a}.md](creativita-${a}.md)** | Tutte le creatività ${a}: indice in testa, poi copy verbatim e trascrizione integrale di ciascuna. Ctrl+F per cercare un angolo o una frase |`);
    if (existsSync(join(dir, `analisi-${a}.md`)))
      L.push(`| **[analisi-${a}.md](analisi-${a}.md)** | Osservazioni di periodo (cosa stanno testando) + un'analisi per le creatività che se lo meritano |`);
  }
  L.push("| `ledger.json` | Stato macchina: una riga per creatività, motore del dedup |");
  if (config.sito || pagine) {
    L.push("");
    L.push(`**Fonte**: ${config.sito ? `[${config.sito.replace(/^https?:\/\//, "")}](${config.sito})` : ""}${pagine ? ` · pagine monitorate: ${pagine}` : ""}`);
  }
  L.push("", FINE);
  const blocco = L.join("\n");

  const DEST = join(dir, "brand.md");
  let dossier;
  if (existsSync(DEST)) {
    const vecchio = readFileSync(DEST, "utf8");
    const i = vecchio.indexOf(FINE);
    dossier = i >= 0 ? vecchio.slice(i + FINE.length).replace(/^\n+/, "\n\n") : "\n\n" + vecchio.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^# .+\n/m, "").trim() + "\n";
  } else {
    dossier = [
      "",
      "",
      "## Il brand",
      "",
      `_Da scrivere: cos'è, cosa vende, a chi. Due o tre righe._`,
      "",
      "## Perché lo seguiamo",
      "",
      "_Da scrivere: a quale nostro brand o funnel serve, e per cosa di preciso._",
      "",
      "## Come è costruito l'account",
      "",
      "_Da scrivere dopo il primo censimento: dove sta il budget, cosa testano davvero, gli stampi ricorrenti._",
      "",
    ].join("\n");
  }

  writeFileSync(DEST, `${fm}\n\n# ${config.nome || b}\n\n${blocco}${dossier}`);
  console.log(`✓ ${b}/brand.md · ${stat.creativita} creatività · ${stat.analisi} analisi · ${Math.round(peso / 1024)} KB di archivio`);
}
