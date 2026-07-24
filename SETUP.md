# Brand Monitor — SETUP da zero

> Come installare le dipendenze della skill su un computer nuovo (scraping no-login: **nessun account Meta, nessun token**). Per l'installazione guidata da Claude vedi [INSTALL.md](INSTALL.md); questo file è il riferimento tecnico, in particolare la **Parte B** (quale Whisper per quale macchina).

---

## Parte A — Scaletta d'installazione

### 0. Prerequisiti base (se non già presenti)
| Cosa | Mac | Windows |
|---|---|---|
| **Node.js** (LTS) | `brew install node` — oppure da nodejs.org | `winget install OpenJS.NodeJS.LTS` o da nodejs.org |
| **Python 3** (solo per la trascrizione) | già presente; verifica `python3 --version` | `winget install Python.Python.3.12` o da python.org (spunta "Add to PATH") |
| **Git** | incluso / `brew install git` | `winget install Git.Git` |

### 1. Scraping (obbligatorio)
Dalla cartella del pacchetto:
```bash
npm install playwright            # la libreria browser
npx playwright install chromium   # scarica il browser Chromium (~150MB)
```
✅ Verifica: `node tools/scrape-ads.mjs` senza argomenti stampa l'uso (nessun errore di modulo). Il test vero è il mini-censimento con un brand configurato: `node tools/scrape-ads.mjs <slug> --per-page 10` (vedi INSTALL.md §7).

### 2. Trascrizione video (per i testi dei video parlati)
Il trascrittore è **`tools/transcribe.py`**, incluso: prova mlx-whisper e ripiega da solo su faster-whisper. Da installare solo il motore adatto (Parte B) + ffmpeg:
```bash
brew install ffmpeg               # Mac
winget install Gyan.FFmpeg        # Windows
```
✅ Verifica: `python3 tools/transcribe.py <un-file.mp4>` produce `<nome> - trascrizione.txt`.

### 3. Verifica finale
Run completo su 1 brand configurato → censimento + trascrizione + schede + report (pipeline nel [CLAUDE.md](CLAUDE.md) della skill).

---

## Parte B — Quale Whisper? (auto-check in 2 passi)

### Passo 1 — Che computer ho?
**Su Mac**:  → "Informazioni su questo Mac". Leggi:
- **Chip**: `Apple M1/M2/M3/M4…` = **Apple Silicon** · `Intel…` = **Mac Intel**
- **Memoria**: la RAM in GB

**Su Windows**: Impostazioni → Sistema → Informazioni (Processore + RAM installata).

### Passo 2 — Installa il MOTORE giusto
| Computer | Motore | Installazione |
|---|---|---|
| **Mac Apple Silicon** (M1–M4) | `mlx-whisper` (usa la GPU Apple) | `pip3 install mlx-whisper` |
| **Mac Intel** | `faster-whisper` (CPU) | `pip install faster-whisper` |
| **PC Windows** | `faster-whisper` (CPU/CUDA) | `pip install faster-whisper` |

`transcribe.py` sceglie da solo il motore disponibile: installane **uno** e basta.

### Modelli (opzionali — i default vanno bene per le ads)
Si cambiano con variabili d'ambiente, senza toccare i file:

| Variabile | Vale per | Default | Alternative |
|---|---|---|---|
| `BRAND_MONITOR_WHISPER_MLX` | mlx-whisper (Apple Silicon) | `mlx-community/whisper-large-v3-turbo` | `mlx-community/whisper-large-v3-mlx` (max qualità) · `mlx-community/whisper-small-mlx` (macchine deboli) |
| `BRAND_MONITOR_WHISPER` | faster-whisper (Intel/Windows) | `small` | `turbo` / `medium` (macchine forti) · `base` (molto deboli) |

Regola pratica: **Apple Silicon → default e non pensarci**. Macchina vecchia/debole → il default `small` di faster-whisper è già la scelta prudente. La lingua la gestisce la pipeline dal `config.json` del brand (`en`, `it`, `auto`).

---

## Cosa contiene il pacchetto
1. [CLAUDE.md](CLAUDE.md) — l'orchestratore della skill (attivazione, pipeline, guardrail)
2. `tools/scrape-ads.mjs` — censimento (prime 100 ads attive per pagina, multi-pagina) + clustering per creatività + ledger + manifest. **Non scarica media**
3. `tools/transcribe-deep.mjs` + `tools/transcribe.py` — trascrizione dei video da scheda profonda (video in tmp, poi cestinato)
4. `tools/run-all.mjs` — "monitora tutti i brand" in un colpo
5. `tools/probe-*.mjs` — diagnostica (rieseguire se Meta cambia layout)
6. [DESIGN-report-e-tracking.md](DESIGN-report-e-tracking.md) · [INSTALL.md](INSTALL.md) · [README.md](README.md) · `ad-scraping-command.md`

I **dati** (config dei brand, ledger, schede, report) NON stanno nel pacchetto: vivono nell'archivio per-utente puntato da `archive-root.txt`.

> ⚠️ Manutenzione: lo scraping segue la struttura della Ad Library di Meta; se cambia il layout/GraphQL lo script va aggiornato (probe di diagnosi inclusi). Volumi bassi (settimanale, pochi brand), sempre da IP residenziale (il proprio computer), mai da VPS/datacenter.
