# DESIGN — Automazione: VPS che scopre, Mac che lavora

> **Stato: IDEA APPUNTATA, non costruita.** Ragionamento del 2026-07-26 con Simone. Nessun lavoro in corso: questo file esiste per non perdere il disegno.
> Riferimenti: [CLAUDE.md](CLAUDE.md) · [DESIGN-report-e-tracking.md](DESIGN-report-e-tracking.md) · [SETUP.md](SETUP.md)

---

## Il problema

`/ad-scraping` **non può girare in automatico**.

Per una skill schedulata servirebbe la VPS (il Mac può essere spento o addormentato). Ma sulla VPS **il download dei video non funziona**, e senza il file video non c'è trascrizione — quindi niente schede profonde, niente report completi.

Quasi certamente è il CDN di Meta che blocca gli IP da datacenter: la Ad Library si apre e si legge, ma il `fetch()` del media viene rifiutato. *(Da confermare — vedi §5.)*

---

## 1 · La pipeline è già spezzata nel punto giusto

Non serve riprogettare niente. Lo split esiste già:

```
scrape-ads.mjs        censimento + clustering + ledger + MANIFEST      ← non tocca il CDN
        ↓  (il manifest porta i video_url)
transcribe-deep.mjs   fetch del video → Whisper → trascrizione         ← tocca il CDN
```

E `transcribe-deep.mjs` filtra così:

```js
const videoItems = (manifest.deep || []).filter(it => it.video && it.video_url && !it.trascrizione)
```

Quel **`!it.trascrizione`** significa che è **già una coda ripartibile e idempotente**: processa solo ciò che manca, e ci scrive dentro il risultato. Si può interrompere e riprendere senza danni.

**Il manifest è già il file di job.** Non va inventata una coda: c'è.

---

## 2 · L'idea: il filesystem sincronizzato È il bus

> **Non costruire un sistema di messaggi fra le due macchine. Ne hanno già uno.**

Il vault è replicato Mac ↔ VPS via **Syncthing**, e `.stignore` esclude solo `.git`, `.DS_Store`, `node_modules`: **il pacchetto `brand-monitor/` e l'archivio `monitoraggio/` sono già sincronizzati.**

```
VPS scrive il job  →  Syncthing lo porta  →  il Mac lo vede
il Mac scarica, trascrive, scrive nel vault  →  Syncthing riporta indietro
```

Nessuna API, nessun webhook, nessun demone che parla con un altro demone. Zero segreti da gestire. Se una macchina è spenta i job **si accumulano invece di perdersi**, e lo stato è ispezionabile a occhio.

### La regola per non litigare con Syncthing

**Una cartella, un solo scrittore.**

```
brand-monitor/coda/
├── da-fare/     ← ci scrive SOLO la VPS
└── fatto/       ← ci scrive SOLO il Mac
```

Il Mac **non cancella** i job da `da-fare/` (sarebbe scrivere in casa d'altri): scrive l'esito in `fatto/`, e la VPS fa pulizia al giro successivo. Così nessun file viene toccato da due parti e non nascono i `.sync-conflict`.

---

## 3 · Le due strade

| | **A — tutto sul Mac** | **B — VPS scopre, Mac lavora** |
|---|---|---|
| Come | `launchd` schedula `run-all.mjs` in locale | cron sulla VPS + `launchd` sul Mac che smaltisce la coda |
| Da costruire | quasi niente | la coda + lo split del run |
| Se il Mac è spento | non scopre nulla, recupera dopo | **scopre lo stesso**, il Mac recupera |
| Rischio URL scaduti | nessuno | sì — vedi §5 |

### Raccomandazione: partire da A

Va contro la premessa iniziale ("l'automazione deve stare sulla VPS"), ma la ragione è solida:

**il pezzo pesante deve stare sul Mac comunque**, e non solo per il blocco CDN. La trascrizione Whisper su un Hetzner senza GPU va a passo d'uomo; su Apple Silicon vola. `SETUP.md` lo riconosce già: la scelta del modello Whisper è **per macchina**.

Quindi il Mac dev'essere sveglio in ogni caso. E se dev'essere sveglio comunque, la VPS aggiunge **solo la scoperta mentre dormi** — che per un monitoraggio settimanale vale poco.

**Si passa a B** se si scopre di star perdendo ads perché il Mac era spento nei giorni sbagliati. Non prima: sarebbe aggiungere due macchine da tenere in sincrono per risolvere un problema che forse non esiste.

---

## 4 · Il ritorno delle trascrizioni

Non serve un viaggio di ritorno. **Il Mac scrive direttamente nell'archivio** `monitoraggio/<brand-osservato>/` — schede in `ads/`, `ledger.json`, report — e Syncthing porta tutto sulla VPS da solo.

Coerente con la regola già decisa nel modello dati: **nessun media conservato**, il video vive in una cartella temporanea il tempo della trascrizione e poi si cestina.

---

## 5 · ⚠️ La cosa da verificare PRIMA di costruire B

**Quanto durano i `video_url` di Meta?**

Sono quasi certamente firmati e a scadenza. Se scadono in poche ore e il Mac resta spento due giorni, la VPS gli passa **link morti** e la pipeline sembra rotta senza motivo apparente.

**Il test costa cinque minuti:**

```bash
# prendere un video_url da un manifest di ieri
curl -I "<video_url>"
# 403 o 410 → scadono. 200 → reggono.
```

**Se scadono**, il disegno di B cambia — in meglio:

> la VPS passa gli **ID delle creatività**, non gli URL. Il Mac risolve l'URL fresco al momento del download.

Più robusto, e rimette ogni macchina al suo posto: la VPS tiene il **calendario e il ledger** (cosa è nuovo, cosa è già stato visto), il Mac fa **tutto ciò che tocca il CDN**.

---

## 6 · Le insidie da mettere in conto

- **Il Mac addormentato.** `launchd` scatta solo a macchina sveglia. Per svegliarla: `pmset repeat wakeorpoweron`. Per un lavoro settimanale è più semplice lasciare che recuperi al risveglio.
- **Latenza Syncthing:** secondi o pochi minuti. Irrilevante qui.
- **Git è locale al Mac** e `.git` non si sincronizza (è nel `.stignore`, ed è voluto: replicarlo corromperebbe il repo). La VPS che scrive nel vault non crea problemi al versionamento; resta la regola dura: **mai `git push`**, ci sono segreti in chiaro nei file tracciati.
- **`archive-root.txt` è per-macchina e gitignorato.** Le due macchine devono puntare alla stessa cartella dati *logica*, con path propri.

---

## Cosa serve per riprendere in mano questa idea

1. Fare il test del §5 e scrivere qui il risultato.
2. Decidere A o B.
3. Se A: un `launchd` plist e si è finito.
4. Se B: la coda del §2 + lo split di `run-all.mjs` in *discovery* (VPS) ed *elaborazione* (Mac).
