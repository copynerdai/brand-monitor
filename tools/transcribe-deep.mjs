// transcribe-deep.mjs — Fase 5 del brand-monitor.
// Legge il manifest _run-<week>.json di un brand, e per ogni creatività VIDEO da scheda profonda
// scarica il video in una cartella temporanea, lo trascrive con tools/transcribe.py
// (mlx-whisper su Mac Apple Silicon, fallback faster-whisper su Intel/Windows),
// scrive la trascrizione DENTRO il manifest, poi CESTINA il video (nessun media conservato — DESIGN §1.6).
//
// Uso:
//   node tools/transcribe-deep.mjs <brand-slug> [--week 2026-W30] [--lang auto] [--limit N] [--root <archivio>]
//
// Dopo questo passo, il manifest è pronto per la skill brand-monitor.md (scrive schede + report).

import { writeFileSync, readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const argv = process.argv.slice(2);
const flags = {};
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { const k = argv[i].slice(2); flags[k] = (argv[i + 1] && !argv[i + 1].startsWith("--")) ? argv[++i] : true; }
  else pos.push(argv[i]);
}
const BRAND = pos[0];
if (!BRAND) { console.error("Uso: node transcribe-deep.mjs <brand-slug> [--week W] [--lang auto] [--limit N]"); process.exit(1); }
const LIMIT = flags.limit ? parseInt(flags.limit, 10) : Infinity;

const __dirname = dirname(fileURLToPath(import.meta.url));
// Archivio dati (per-utente): --root → env → archive-root.txt nel pacchetto
function resolveArchiveRoot() {
  if (flags.root) return flags.root;
  if (process.env.BRAND_MONITOR_ARCHIVE) return process.env.BRAND_MONITOR_ARCHIVE;
  const cfg = join(__dirname, "..", "archive-root.txt");
  if (existsSync(cfg)) { const p = readFileSync(cfg, "utf8").trim(); if (p) return p; }
  console.error(`Archivio non configurato: crea ${join(__dirname, "..", "archive-root.txt")}, oppure --root <path>, oppure env BRAND_MONITOR_ARCHIVE.`);
  process.exit(1);
}
const MON_ROOT = resolveArchiveRoot();
const BRAND_DIR = join(MON_ROOT, BRAND);

// lingua: --lang, oppure config.json del brand, oppure "auto"
let LANG = flags.lang;
if (!LANG) {
  const cfg = join(BRAND_DIR, "config.json");
  if (existsSync(cfg)) { try { LANG = JSON.parse(readFileSync(cfg, "utf8")).lingua; } catch {} }
}
LANG = LANG || "auto";

// manifest unico di lavoro
const MANIFEST = join(BRAND_DIR, "_run.json");
if (!existsSync(MANIFEST)) { console.error("Manifest non trovato:", MANIFEST, "— lancia prima scrape-ads.mjs."); process.exit(1); }
const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));

// trascrittore cross-platform incluso nel pacchetto (Mac: mlx-whisper · Windows/Intel: faster-whisper)
const PY = process.platform === "win32" ? "python" : "python3";
const TRANSCRIBE_PY = join(__dirname, "transcribe.py");
const TMP = join(tmpdir(), "brand-monitor-transcribe");
mkdirSync(TMP, { recursive: true });

const videoItems = (manifest.deep || []).filter(it => it.video && it.video_url && !it.trascrizione);
console.log(`\n🎙️  trascrizione — ${BRAND}\n   video da trascrivere: ${videoItems.length} (limite ${LIMIT === Infinity ? "∞" : LIMIT}) · lingua ${LANG}\n`);

let done = 0;
for (const it of videoItems) {
  if (done >= LIMIT) break;
  const id = it.rep_id;
  const mp4 = join(TMP, `${id}.mp4`);
  try {
    process.stdout.write(`  [${done + 1}] ${id} … scarico`);
    const r = await fetch(it.video_url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    writeFileSync(mp4, Buffer.from(await r.arrayBuffer()));
    process.stdout.write(" · trascrivo");
    execFileSync(PY, [TRANSCRIBE_PY, mp4, LANG, TMP], { stdio: ["ignore", "ignore", "inherit"] });
    const txtPath = join(TMP, `${id} - trascrizione.txt`);
    it.trascrizione = existsSync(txtPath) ? readFileSync(txtPath, "utf8").trim() : "";
    console.log(` · ✓ ${it.trascrizione.length} caratteri`);
    done++;
    // cestina i file temporanei (sono in tmp, non nel vault → rm ok)
    rmSync(mp4, { force: true });
    rmSync(txtPath, { force: true });
  } catch (e) {
    console.log(` · ❌ ${e.message}`);
    it.trascrizione_errore = e.message;
    try { rmSync(mp4, { force: true }); } catch {}
  }
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
console.log(`\n✓ trascritti ${done}/${videoItems.length} · manifest aggiornato → ${BRAND}/_run.json`);
console.log(`  (le trascrizioni sono ora nei deep[].trascrizione, pronte per la skill)`);
