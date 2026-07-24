#!/usr/bin/env node
// verify-token.mjs — smoke test della Fase 0 (Brand Monitor).
// Verifica che il token Meta Ad Library funzioni e che l'endpoint ads_archive
// restituisca ads con eu_total_reach. NON usa il login di Simone: solo il token
// dell'app developer dedicata letto da ~/.secrets/meta-ad-library.env.
//
// Uso:
//   node verify-token.mjs "self publishing"     # ricerca per termine (default)
//   node verify-token.mjs 123456789012345        # ricerca per page_id (tutte cifre)
//   node verify-token.mjs "libri" DE             # secondo arg = paese (default IT)
//
// Richiede solo Node (fetch nativo). Nessun pacchetto npm.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const ENV_PATH = join(homedir(), ".secrets", "meta-ad-library.env");

function loadEnv(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    fail(`File token non trovato: ${path}\n→ Completa la Fase 0 (crea l'app Meta e incolla il token nel file).`);
  }
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return env;
}

function fail(msg) {
  console.error(`\n❌ ${msg}\n`);
  process.exit(1);
}

const env = loadEnv(ENV_PATH);
const token = env.META_ADLIB_TOKEN;
const version = env.META_GRAPH_VERSION || "v23.0";

if (!token || token === "INCOLLA_QUI_IL_TOKEN") {
  fail("Token non ancora inserito in ~/.secrets/meta-ad-library.env (valore ancora placeholder).");
}

const query = process.argv[2] || "self publishing";
const country = (process.argv[3] || "IT").toUpperCase();
const isPageId = /^\d+$/.test(query);

const params = new URLSearchParams({
  access_token: token,
  ad_reached_countries: JSON.stringify([country]),
  ad_type: "ALL",
  ad_active_status: "ALL",
  limit: "15",
  fields: [
    "id",
    "page_id",
    "page_name",
    "ad_delivery_start_time",
    "ad_creative_bodies",
    "publisher_platforms",
    "eu_total_reach",
  ].join(","),
});
if (isPageId) params.set("search_page_ids", JSON.stringify([query]));
else params.set("search_terms", query);

const url = `https://graph.facebook.com/${version}/ads_archive?${params}`;

console.log(`\n🔎 Verifica token Meta Ad Library`);
console.log(`   endpoint : ads_archive (${version})`);
console.log(`   ricerca  : ${isPageId ? "page_id" : "termine"} = "${query}"  paese = ${country}`);

const res = await fetch(url);
const json = await res.json().catch(() => null);

if (!res.ok || (json && json.error)) {
  const e = json?.error;
  let hint = "";
  if (e) {
    const m = (e.message || "").toLowerCase();
    if (m.includes("expired") || m.includes("session has expired")) {
      hint = "\n→ Token SCADUTO. Rigenera un token nel Graph API Explorer e riaggiorna il file env.";
    } else if (m.includes("invalid") && m.includes("token")) {
      hint = "\n→ Token NON valido. Controlla di aver incollato il token giusto (app dedicata, non BM).";
    } else if (e.code === 4 || m.includes("rate") || m.includes("limit")) {
      hint = "\n→ Rate limit raggiunto (~200/h). Aspetta e riprova.";
    }
    fail(`Errore API (HTTP ${res.status}): ${e.message}${hint}`);
  }
  fail(`Errore HTTP ${res.status}: ${JSON.stringify(json)}`);
}

const ads = json?.data || [];
if (ads.length === 0) {
  console.log(`\n⚠️  Token OK ma 0 ads per questa ricerca (prova un altro termine/page_id o paese).`);
  console.log(`✅ FASE 0 PASSATA comunque: l'API risponde senza errori di autenticazione.\n`);
  process.exit(0);
}

const withReach = ads.filter((a) => a.eu_total_reach != null);
console.log(`\n📦 Ads ricevute: ${ads.length}`);
console.log(`   con eu_total_reach valorizzato: ${withReach.length}/${ads.length}`);
console.log(`\n   Prime 3 ads:`);
for (const a of ads.slice(0, 3)) {
  const body = (a.ad_creative_bodies?.[0] || "").replace(/\s+/g, " ").slice(0, 70);
  console.log(`   • ${a.page_name || a.page_id} | start ${a.ad_delivery_start_time || "?"} | reach ${a.eu_total_reach ?? "—"}`);
  console.log(`     "${body}${body.length >= 70 ? "…" : ""}"`);
}

console.log(`\n✅ FASE 0 PASSATA: token valido, ads_archive risponde${withReach.length ? " con eu_total_reach" : ""}.\n`);
