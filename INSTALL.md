# INSTALL — installare la skill ad-scraping (per lo studente)

> **Questo file è scritto perché lo esegua Claude Code**, non tu a mano. Tu fai 2 cose (sotto); a tutto il resto pensa Claude.
>
> **Cosa fai tu (2 passi):**
> 1. Apri il Terminale e incolla: `git clone https://github.com/<ACCOUNT>/brand-monitor.git ~/brand-monitor`
> 2. Apri Claude Code e scrivi: **"installa la skill ad-scraping seguendo ~/brand-monitor/INSTALL.md"**
>
> Poi rispondi a un paio di domande che Claude ti fa. Fine: userai `/ad-scraping`.

---

## Istruzioni per Claude (esegui questi passi, adattandoti al sistema operativo)

**Obiettivo**: rendere operativa la skill `brand-monitor` (`/ad-scraping`) su questa macchina, con trascrizione. Rileva il SO (`process.platform`: `darwin`=Mac, `win32`=Windows) e usa i comandi giusti. Verifica ogni passo prima di procedere; se un passo fallisce, spiega all'utente in parole semplici cosa serve e fermati.

### 1. Prerequisiti di base
- **Node.js** (LTS). Verifica `node -v`. Se manca: Mac → `brew install node` (installa prima Homebrew da brew.sh se assente); Windows → installer LTS da nodejs.org (o `winget install OpenJS.NodeJS.LTS`).
- **Git**: già usato per il clone.

### 2. Scraping (obbligatorio)
Dalla cartella del pacchetto (`~/brand-monitor`):
```
npm install playwright
npx playwright install chromium
```
Verifica: `node tools/scrape-ads.mjs` senza argomenti deve stampare l'uso (non un errore di modulo). Se Playwright non è nel percorso di default, annota il `NODE_PATH` corretto per i comandi successivi.

### 3. Trascrizione (richiesta: sì)
- **ffmpeg**: Mac → `brew install ffmpeg`; Windows → `winget install Gyan.FFmpeg` (o `choco install ffmpeg`). Verifica `ffmpeg -version`.
- **Whisper** — scegli il motore in base alla macchina (dettagli in [SETUP.md](SETUP.md) Parte B):
  - **Mac Apple Silicon** (M1–M4): `pip install mlx-whisper` (usa la GPU Apple). Il pacchetto usa `transcribe.sh` che chiama `mlx_whisper`.
  - **Mac Intel** o **Windows**: `mlx-whisper` NON è disponibile → installa `pip install faster-whisper` e avvisa l'utente che su questa macchina la trascrizione userà faster-whisper (potrebbe servire un piccolo adattamento del wrapper: segnalalo, non bloccare l'installazione — scraping e schede funzionano comunque).
  - Modello consigliato: `large-v3-turbo` (macchine con GPU/Apple Silicon) o `small` (macchine deboli).

### 4. Trascrittore (transcribe.sh)
Il tool `tools/transcribe-deep.mjs` cerca `transcribe.sh` come skill sorella. Se non presente accanto al pacchetto, copia `tools/` a parte oppure imposta la variabile: crea un piccolo `transcribe.sh` locale che invochi il motore Whisper scelto (vedi il modello in SETUP.md). Su Mac Apple Silicon con `mlx-whisper` funziona out-of-the-box.

### 5. Slash command
Crea `~/.claude/commands/ad-scraping.md` con lo stesso contenuto del file già nel pacchetto (`ad-scraping-command.md`, se incluso) oppure con:
> "Leggi ed esegui `~/brand-monitor/CLAUDE.md`; per il brand in $ARGUMENTS (o TUTTI se vuoto/‘tutti’) esegui la pipeline."

### 6. Archivio dati (per-utente)
- Chiedi all'utente **dove tiene il suo Copy Genius / Second Brain**. L'archivio andrà lì, in una cartella `monitoraggio/`. Se non lo sa o non ha un vault, usa `~/brand-monitor-dati/`.
- Crea `~/brand-monitor/archive-root.txt` con il **percorso assoluto** di quella cartella `monitoraggio/`. Crea la cartella se non esiste.

### 7. (Opzionale) Aggancio a Copy Genius
Lo slash command `/ad-scraping` funziona già da solo. Se l'utente vuole anche le parole di attivazione ("monitora la concorrenza"), aggiungi al `CLAUDE.md` del suo Copy Genius una riga di intent che rimanda a `~/brand-monitor/CLAUDE.md`. Non è necessario per usarla.

### 8. Verifica finale
Fai un mini test guidato: chiedi all'utente un brand + il sito + una pagina Facebook; scopri il `page_id`; scrivi il `config.json`; lancia un censimento a campione ridotto (`--per-page 10`) e mostra il risultato. Se il report esce, l'installazione è a posto.

---

**Aggiornamenti futuri**: `cd ~/brand-monitor && git pull` (come per Copy Genius).
