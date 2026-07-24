# Brand Monitor — SETUP da zero

> Come installare la skill di monitoraggio ads (Piano B, scraping no-login) su un computer nuovo. **Nessun account Meta, nessun token, nessuna approvazione.** Compagno del [piano di costruzione](brand-monitor-piano.md).

---

## Parte A — Scaletta d'installazione (da zero)

### 0. Prerequisiti base (se non già presenti)
| Cosa | Mac | Windows |
|---|---|---|
| **Node.js** (LTS) | `brew install node` — oppure da nodejs.org | da nodejs.org (installer LTS) |
| **Python 3** (serve solo per la trascrizione) | già presente; verifica `python3 --version` | da python.org (spunta "Add to PATH") |
| **Homebrew** (solo Mac, per ffmpeg) | da brew.sh | — |

### 1. Scraping (obbligatorio)
```bash
npm install playwright            # la libreria browser
npx playwright install chromium   # scarica il browser Chromium (~150MB)
```
Poi mettere lo script `scrape-ads.mjs` (il cuore della skill) in una cartella `tools/`.
✅ Verifica: `node scrape-ads.mjs "<un brand noto>"` restituisce delle ads.

### 2. Trascrizione video (opzionale — solo se vuoi i testi parlati)
```bash
# ffmpeg (estrae/gestisce l'audio)
brew install ffmpeg               # Mac
winget install Gyan.FFmpeg        # Windows (o choco install ffmpeg)

# Whisper: SCEGLI il motore in base al computer → vedi Parte B
```
✅ Verifica: trascrivi un mp4 di prova e controlla il .txt in output.

### 3. Verifica finale
Run completo su 1 brand → copy + screenshot + (se video) trascrizione + riepilogo.

---

## Parte B — Quale Whisper? (auto-check in 2 passi)

### Passo 1 — Che computer ho?
**Su Mac**:  → "Informazioni su questo Mac". Leggi:
- **Chip**: `Apple M1/M2/M3/M4…` = **Apple Silicon** · `Intel…` = **Mac Intel**
- **Memoria**: la RAM in GB

**Su Windows**: Impostazioni → Sistema → Informazioni (Processore + RAM installata). Per la scheda video: Gestione attività (Ctrl+Shift+Esc) → Prestazioni → cerca una **GPU NVIDIA**.

### Passo 2 — Scegli MOTORE (dal tipo di macchina) e MODELLO (dalla potenza)

**MOTORE — dipende dalla piattaforma:**
| Computer | Motore | Installazione |
|---|---|---|
| **Mac Apple Silicon** (M1–M4) | `mlx-whisper` (usa la GPU Apple) | `pip install mlx-whisper` |
| **Mac Intel** | `faster-whisper` (CPU) | `pip install faster-whisper` |
| **PC con GPU NVIDIA** | `faster-whisper` (CUDA, velocissimo) | `pip install faster-whisper` |
| **PC solo CPU** | `faster-whisper` (CPU) | `pip install faster-whisper` |

**MODELLO — dipende dalla potenza (precisione ↔ velocità):**
| Potenza macchina | Modello consigliato | Precisione | Note |
|---|---|---|---|
| **Forte** — Apple Silicon o GPU NVIDIA, RAM ≥16GB | **`large-v3-turbo`** ⭐ *(default per quasi tutti)* | Altissima | Veloce E accurato |
| Vuoi il massimo assoluto | `large-v3` | Massima | Più lento, guadagno minimo sul turbo |
| **Media** — RAM 8–16GB, no GPU | `medium` | Buona | Compromesso |
| **Debole** — RAM ≤8GB, macchina datata | `small` | Sufficiente | Per le ads (audio pulito, corte) spesso basta |
| Molto debole / lentissima | `base` | Bassa | Ultima spiaggia |

**ID modello da passare** (cambia per motore):
| Modello | mlx-whisper (Apple Silicon) | faster-whisper (Intel/PC) |
|---|---|---|
| turbo ⭐ | `mlx-community/whisper-large-v3-turbo` | `turbo` |
| max | `mlx-community/whisper-large-v3-mlx` | `large-v3` |
| medium | `mlx-community/whisper-medium-mlx` | `medium` |
| small | `mlx-community/whisper-small-mlx` | `small` |

### Regola pratica (per non pensarci troppo)
- **Hai un Mac M-qualcosa o un PC con scheda NVIDIA?** → usa `large-v3-turbo` e non farti domande.
- **Macchina vecchia/debole?** → parti da `small`. Per le ads (clip corte, audio chiaro) la differenza è minima.
- La lingua si imposta a parte (`it`, `en`, o `auto` per rilevamento). Le ads USA vanno in `en`, quelle italiane in `it`.

---

## Cosa contiene la skill (pacchetto da distribuire)
1. `scrape-ads.mjs` — scraper (ricerca + intercettazione GraphQL + download media)
2. passo trascrizione — wrapper Whisper (motore scelto in Parte B)
3. generazione report — la fa l'AI leggendo i dati grezzi
4. `watchlist` — quali brand monitorare (per brand cliente)
5. questo `SETUP.md`

> ⚠️ Manutenzione: lo scraping segue la struttura della Ad Library di Meta; se cambia il layout/GraphQL lo script va aggiornato. Volumi bassi (settimanale, pochi brand), sempre da IP residenziale (il proprio computer), mai da VPS/datacenter.
