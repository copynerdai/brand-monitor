# INSTALL — installare la skill ad-scraping (per lo studente)

> **Questo file è scritto perché lo esegua Claude Code**, non tu a mano. Tu fai 2 cose (sotto); a tutto il resto pensa Claude.
>
> **Cosa fai tu (2 passi):**
> 1. Apri il Terminale e incolla: `git clone https://github.com/copynerdai/brand-monitor.git ~/brand-monitor`
> 2. Apri Claude Code e scrivi: **"installa la skill ad-scraping seguendo ~/brand-monitor/INSTALL.md"**
>
> Poi rispondi a un paio di domande che Claude ti fa. Fine: userai `/ad-scraping`.

---

## Istruzioni per Claude (esegui questi passi, adattandoti al sistema operativo)

**Obiettivo**: rendere operativa la skill `brand-monitor` (`/ad-scraping`) su questa macchina, trascrizione inclusa. Rileva il SO (`process.platform`: `darwin`=Mac, `win32`=Windows) e usa i comandi giusti. Verifica ogni passo prima di procedere; se un passo fallisce, spiega all'utente in parole semplici cosa serve e fermati.

### 1. Prerequisiti di base
- **Node.js** (LTS). Verifica `node -v`. Se manca: Mac → `brew install node`; Windows → `winget install OpenJS.NodeJS.LTS` (o installer LTS da nodejs.org).
- **Git**: già usato per il clone.
- **Python 3** (serve per la trascrizione). Verifica `python3 --version` (Mac) / `python --version` (Windows). Se manca su Windows: `winget install Python.Python.3.12` (o da python.org spuntando "Add to PATH").

### 2. Scraping (obbligatorio)
Dalla cartella del pacchetto (`~/brand-monitor`):
```
npm install playwright
npx playwright install chromium
```
Verifica: `node tools/scrape-ads.mjs` senza argomenti deve stampare l'uso (non un errore di modulo mancante). Playwright si risolve dal `node_modules` del pacchetto: nessuna variabile d'ambiente necessaria.

### 3. Trascrizione video
Il pacchetto include **`tools/transcribe.py`**, che gestisce da solo entrambi i motori: prova **mlx-whisper** (Mac Apple Silicon, GPU) e in mancanza ripiega su **faster-whisper** (Mac Intel / Windows / CPU). Nessun wrapper da creare, nessun adattamento.

- **ffmpeg**: Mac → `brew install ffmpeg`; Windows → `winget install Gyan.FFmpeg`. Verifica `ffmpeg -version`.
- **Motore Whisper** — uno solo, in base alla macchina:
  - Mac **Apple Silicon** (M1–M4): `pip3 install mlx-whisper`
  - Mac **Intel** o **Windows**: `pip install faster-whisper`
- Modelli (opzionali, via env): `BRAND_MONITOR_WHISPER` = modello faster-whisper (default `small`); `BRAND_MONITOR_WHISPER_MLX` = modello mlx (default `large-v3-turbo`). I default vanno bene per le ads.
- Verifica: `python3 tools/transcribe.py` (Windows: `python tools\transcribe.py`) senza argomenti deve stampare l'uso. Se poi alla prima trascrizione manca il motore, lo script lo dice chiaramente.
- Se la trascrizione non si riesce a installare: **non bloccare** — censimento, schede e report funzionano comunque; segnala solo che i video non verranno trascritti.

### 4. Slash command
Copia il file già pronto nel pacchetto:
- Mac: `mkdir -p ~/.claude/commands && cp ~/brand-monitor/ad-scraping-command.md ~/.claude/commands/ad-scraping.md`
- Windows (PowerShell): `New-Item -ItemType Directory -Force $HOME\.claude\commands | Out-Null; Copy-Item $HOME\brand-monitor\ad-scraping-command.md $HOME\.claude\commands\ad-scraping.md`

### 5. Archivio dati (per-utente)
- Chiedi all'utente **dove tiene il suo Copy Genius / Second Brain**. L'archivio andrà lì, in una cartella `monitoraggio/`. Se non lo sa o non ha un vault, usa `~/Documents/monitoraggio-ads/`.
- Crea `~/brand-monitor/archive-root.txt` con il **percorso assoluto** di quella cartella. Crea la cartella se non esiste.

### 6. (Opzionale) Aggancio a Copy Genius
Lo slash command `/ad-scraping` funziona già da solo. Se l'utente vuole anche le parole di attivazione ("monitora la concorrenza"), aggiungi al `CLAUDE.md` del suo Copy Genius una riga di intent che rimanda a `~/brand-monitor/CLAUDE.md`. Non è necessario per usarla.

### 7. Verifica finale
Fai un mini test guidato: chiedi all'utente un brand + il sito + una pagina Facebook; scopri il `page_id`; scrivi il `config.json`; lancia un censimento a campione ridotto (`node tools/scrape-ads.mjs <slug> --per-page 10`) e mostra il risultato. Se il censimento esce, l'installazione è a posto.

---

**Aggiornamenti futuri**: `cd ~/brand-monitor && git pull` (come per Copy Genius).
