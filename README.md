# brand-monitor — pacchetto skill portabile

Monitoraggio settimanale delle ads della concorrenza sulla **Meta Ad Library** (senza login). Pacchetto **autonomo**: codice + documenti, **nessun dato utente**. Si aggancia a Copy Genius e si attiva con `/ad-scraping`.

## Cosa c'è dentro

```
brand-monitor/
├── CLAUDE.md                     ← il cervello: identità, attivazione, pipeline (leggi questo per primo)
├── DESIGN-report-e-tracking.md   ← il contratto del modello dati (schede, ledger, campionamento)
├── DESIGN-automazione-vps-mac.md ← 💡 IDEA APPUNTATA, non costruita: come farla partire in automatico
│                                    (VPS scopre, Mac scarica e trascrive, Syncthing fa da bus)
├── brand-monitor-piano.md        ← storia di costruzione, fasi, decisioni
├── SETUP.md                      ← installazione da zero (dipendenze, scelta Whisper per macchina)
├── tools/
│   ├── scrape-ads.mjs            ← censimento + clustering per creatività + ledger + manifest
│   ├── transcribe-deep.mjs       ← trascrizione locale (Whisper) dei video da scheda profonda
│   └── probe-*.mjs               ← diagnostica (rieseguire se Meta cambia layout)
└── archive-root.txt              ← [per-macchina, gitignorato] percorso della cartella dati dell'utente
```

## Due strati (importante)

- **Questo pacchetto** = codice + documenti, uguale per tutti, condivisibile.
- **L'archivio** (i dati veri: `<brand>/config.json`, `ledger.json`, `ads/`, `report/`, `tracksheet-concorrenza.base`) = **per-utente**, vive FUORI dal pacchetto, nella cartella indicata in `archive-root.txt`. Non si condivide mai (sono i brand e i dati di quell'utente).

I tool trovano l'archivio da soli: `--root <path>` → env `BRAND_MONITOR_ARCHIVE` → `archive-root.txt`.

## Condividere con gli studenti (il modo più semplice)

Il pacchetto è pubblicato su **github.com/copynerdai/brand-monitor**. Lo studente fa **2 cose sole**, al resto pensa il suo Claude:

1. Nel Terminale: `git clone https://github.com/copynerdai/brand-monitor.git ~/brand-monitor`
2. Nel suo Claude Code: **"installa la skill ad-scraping seguendo ~/brand-monitor/INSTALL.md"**

[INSTALL.md](INSTALL.md) è scritto perché lo **esegua Claude**: rileva Mac o Windows, installa le dipendenze (Node + Playwright + Chromium; ffmpeg + Whisper per le trascrizioni), mette lo slash command, crea `archive-root.txt`, e fa un mini test. Lo studente risponde solo a un paio di domande. Aggiornamenti: `cd ~/brand-monitor && git pull`.

**Integrazione = solo lo slash command.** `/ad-scraping` punta da solo a questo `CLAUDE.md`: lo studente lo usa **senza toccare il suo Copy Genius**. (Facoltativo: aggiungere le parole di attivazione al suo Copy Genius — vedi INSTALL.md §7.)

## Uso quotidiano

- `/ad-scraping <brand>` — un brand. Se non è configurato, la skill chiede nome + sito + pagine Facebook, scopre i `page_id` e scrive il `config.json`.
- `/ad-scraping` (senza brand) o **"monitora tutti"** — **tutti** i brand configurati in un colpo (`tools/run-all.mjs`).
- Poi: censimento → trascrizione → schede + report, con le **novità in evidenza**.
