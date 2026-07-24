// run-all.mjs — "monitora TUTTI i brand" in un colpo solo.
// Cicla ogni cartella dell'archivio che ha un config.json ed esegue per ciascuna:
//   scrape-ads.mjs (censimento) + transcribe-deep.mjs (trascrizione dei video da scheda profonda).
// Le schede e i report li scrive poi il modello, brand per brand, leggendo i manifest.
//
// Uso:
//   NODE_PATH=~/.invoice-tools/node_modules node run-all.mjs [--per-page 100] [--cap 18] [--no-transcribe] [--only slug1,slug2]

import { readdirSync, existsSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { const k = argv[i].slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
}
const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveArchiveRoot() {
  if (flags.root) return flags.root;
  if (process.env.BRAND_MONITOR_ARCHIVE) return process.env.BRAND_MONITOR_ARCHIVE;
  const cfg = join(__dirname, "..", "archive-root.txt");
  if (existsSync(cfg)) { const p = readFileSync(cfg, "utf8").trim(); if (p) return p; }
  console.error("Archivio non configurato: archive-root.txt / --root / BRAND_MONITOR_ARCHIVE.");
  process.exit(1);
}
const ARCHIVE = resolveArchiveRoot();

// brand = sottocartelle dell'archivio con un config.json
let brands = readdirSync(ARCHIVE)
  .filter(d => { try { return statSync(join(ARCHIVE, d)).isDirectory() && existsSync(join(ARCHIVE, d, "config.json")); } catch { return false; } });
if (flags.only) { const set = new Set(String(flags.only).split(",").map(s => s.trim())); brands = brands.filter(b => set.has(b)); }

if (!brands.length) { console.error(`Nessun brand configurato in ${ARCHIVE} (serve <brand>/config.json).`); process.exit(1); }

const passthru = [];
if (flags["per-page"]) passthru.push("--per-page", String(flags["per-page"]));
if (flags.cap) passthru.push("--cap", String(flags.cap));

console.log(`\n🔁 MONITORA TUTTI — ${brands.length} brand: ${brands.join(", ")}\n`);
const esiti = [];
for (const b of brands) {
  console.log(`\n════════ ${b} ════════`);
  try {
    execFileSync("node", [join(__dirname, "scrape-ads.mjs"), b, ...passthru], { stdio: "inherit" });
    if (!flags["no-transcribe"]) execFileSync("node", [join(__dirname, "transcribe-deep.mjs"), b], { stdio: "inherit" });
    esiti.push(`✓ ${b}`);
  } catch (e) {
    esiti.push(`✗ ${b} (${e.message.split("\n")[0]})`);
  }
}
console.log(`\n=== FINE — ${brands.length} brand processati ===`);
for (const e of esiti) console.log("  " + e);
console.log(`\nOra il modello scrive schede + report per ogni brand leggendo i manifest _run-<week>.json in ${ARCHIVE}/<brand>/.`);
