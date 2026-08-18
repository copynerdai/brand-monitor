# Brand Monitor — DESIGN: archivio, schede, tracking

> **v3 — stato REALE del sistema.** Progettato il 2026-07-24 (Opus), costruito e affinato lo stesso giorno con Fable insieme a Simone. Il pilota vive in `monitoraggio/` con le prime 2 ads di Emma. v3 aggiunge il modello a **creatività/varianti** e le regole di **campionamento e costi** (§6bis), decise con Simone. Compagno del [piano](brand-monitor-piano.md) e del [SETUP](SETUP.md).

---

## 1. Principi (le regole che non si rompono)

1. **L'unità di lavoro è la CREATIVITÀ, non la singola ad.** Un brand può lanciare la stessa creatività come decine di `ad_id` diversi (duplicati su più adset). Raggruppiamo per creatività (`cluster_id`): **una creatività = una scheda**. L'`ad_id` resta l'identificatore atomico che leggiamo dallo scraper, ma la scheda si scrive una volta per creatività, usando come chiave il suo `ad_id` **rappresentante** (il più longevo). Il numero di duplicati attivi diventa un **segnale di scaling**, non rumore.
2. **`cluster_id` = chiave di dedup.** Per i **video** è l'`xpv_asset_id` (identificativo stabile del file, presente nell'URL del video: sopravvive a cambi di caption e ri-upload come nuovo ad_id). Per le **statiche** è l'hash dell'immagine/copy normalizzato. È così che riconosciamo "questa creatività l'ho già vista" anche se l'ad_id è nuovo.
3. **Si elabora UNA volta sola.** Alla prima comparsa di una creatività (se supera il cancello, §6bis): trascrizione + analisi → scheda permanente. Il corpo non si rigenera mai; i run successivi aggiornano **solo tre campi** nel frontmatter: `stato`, `giorni_attivi`, `varianti_attive`.
4. **`ad_id` sempre come stringa** (15-16 cifre: come numero rischia arrotondamenti in JSON/JS).
5. **Archivio CENTRALIZZATO.** Un brand osservato = una cartella in `monitoraggio/`, elaborata una volta per tutti. I brand clienti si collegano via watchlist (`brands/<brand>/competitors/watchlist.md`).
6. **Nessun media conservato in locale.** Il video si scarica in tmp solo per la trascrizione, poi si cestina; le immagini non si scaricano. Per rivedere una creatività: link Ad Library (`?id=<ad_id>`) — se l'ad è spenta, togliere il filtro "ads attive" (la libreria mostra anche le inattive).
7. **Tre documenti, una sola fonte di verità per ciascun lavoro.** `creativita-<anno>.md` per il testo, `analisi-<anno>.md` per il giudizio, `ledger.json` per lo stato macchina. La tracksheet è la proiezione del frontmatter di `brand.md`: si aggiorna da sola, non si rigenera a mano.
8. **Tutto in italiano** nei file umani, proprietà del frontmatter comprese. In inglese solo i termini canonici del direct response (Winner, Hook, Big Idea, CTA) e gli identificatori tecnici (`ad_id`, `cluster_id`, `url`).
9. **Compatibile con la swipe library**: stessa grammatica (copy verbatim + struttura + angolo) di swipe-ingestion → un'ad vincente si promuove a swipe entry senza rifare il lavoro.

---

## 2. Architettura file (come costruita) — **v4, riorganizzata il 2026-08-02**

Due strati separati: il **pacchetto skill** (`_system/skills/brand-monitor/`: questo DESIGN, CLAUDE.md, `tools/` — condivisibile, senza dati) e l'**archivio dati** (per-utente, percorso in `archive-root.txt`):

```
<archivio>/  (es. monitoraggio/)
├── index.md                        ← mappa dell'area
├── tracksheet-concorrenza.base     ← UNA riga per BRAND (filtra tipo == "brand-monitorato")
└── <brand-osservato>/
    ├── brand.md                    🔄 testa rigenerata + dossier a mano · ⭐ È LA RIGA DELLA TRACKSHEET
    ├── creativita-<anno>.md        ➕ APPESO   indice + copy + trascrizioni di tutte le creatività
    ├── analisi-<anno>.md           ➕ APPESO   osservazioni di periodo + un'analisi per creatività
    ├── config.json                 ← UNA VOLTA nome, sito, pagine_fb[], commento
    ├── ledger.json                 🔄 RISCRITTO una riga per creatività (motore del dedup)
    └── _run.json                   🔄 RISCRITTO manifest dell'ULTIMO run (file di lavoro, fuori git)
```

**Tre documenti per brand**, non uno per ad e non uno per settimana. A 20 brand sono 60 file markdown, e restano 60 anche dopo un anno di run.

### I tre strati, e perché sono separati

Tre lavori diversi, con costi e cicli di vita diversi. Confonderli è ciò che faceva esplodere l'archivio.

1. **CONTENUTO** → `creativita-<anno>.md`. Copy verbatim e trascrizioni integrali di **tutte** le creatività. Nessuno lo legge in sequenza: serve a Ctrl+F, a grep e al modello. Cresce di ~1,9 KB per creatività.
2. **INDICE** → `ledger.json` (macchina, completo) + la tabella in testa al contenitore (umano). Dice cosa esiste, quanto è longevo, quante varianti ha.
3. **GIUDIZIO** → `analisi-<anno>.md`. Costoso, quindi solo per chi supera il cancello. Sta in un file solo per brand, con le stesse ancore `### <ad_id>` del contenitore: `analisi-<anno>.md#<ad_id>` sta al giudizio come `creativita-<anno>.md#<ad_id>` sta al testo.
4. **IDENTITÀ** → `brand.md`. Chi è il brand, perché lo seguiamo, com'è costruito il suo account. Porta nel frontmatter i numeri, ed è per questo che **è la riga della tracksheet**: Obsidian Bases fa una riga per nota.

### Le regole del contenitore

- **Append-only**: una creatività entra una volta sola e la sua sezione non viene **mai** riscritta né riordinata. Le nuove si aggiungono in fondo.
- **Solo fatti immutabili nel corpo** (titolo dell'ad, data di attivazione, landing, url, testo). I contatori che cambiano a ogni run — `giorni_attivi`, `varianti_attive`, la scheda collegata — vivono **solo nell'indice in testa**, che è l'unica parte rigenerata. Per questo il corpo non ha mai motivo di cambiare.
- **Ancora = `ad_id` nudo** (`### 1575436696895220`): immutabile, deterministica, generata dalla macchina. Da ovunque: `creativita-<anno>.md#<ad_id>`.
- **Anno = quello di `prima_vista`**; una creatività non cambia mai file. Split per semestre se un file supera ~1,5 MB (sopra, Obsidian rallenta in edit).
- **Superset di tutto ciò che abbiamo**: entrano anche le creatività che hanno perso la riga a ledger (rappresentante di cluster cambiato fra due run) purché ne esista il contenuto. Buttare del testo già raccolto è l'unica perdita irreversibile della pipeline.
- **Un'ad spenta resta.** È un archivio, non un monitor: il valore di uno swipe non scade.

### Cosa NON esiste più (deciso il 2026-08-02)

- ~~`trascrizioni-<settimana>.md`~~ — ogni run ri-elencava le stesse creatività ancora attive: a 20 brand sarebbero stati 1.040 file/anno e 307 MB, duplicati al ~95%.
- ~~`_run-<settimana>.json`~~ — il manifest è un file di lavoro, non un archivio. La storia temporale sta in `ledger[].settimane_viste`.
- ~~`report/<settimana>.md`~~ — sostituiti da `report/<anno>.md` con una sezione appesa per run: da 52 file/brand/anno a 1.
- ~~Copy e trascrizione duplicati dentro le schede~~ — l'analisi linka l'ancora nel contenitore.
- ~~Un file per scheda in `ads/`~~ — **[2026-08-02, secondo giro]** le analisi sono confluite in `analisi-<anno>.md`. Motivo: con migliaia di creatività una cartella di schede è ingestibile, e una tabella per-ad è illeggibile. La navigazione va per strati: tracksheet (brand) → brand.md → contenitore/analisi → ancora della singola ad.
- ~~`report/<anno>.md` separato~~ — le osservazioni di periodo sono analisi anche loro e stanno in `analisi-<anno>.md`. Non hanno cadenza fissa: si scrivono quando c'è qualcosa da dire.

**Effetto misurato** su una proiezione a 20 brand × 300 creatività/anno: da ~4.000 file e 626 MB a ~980 file e 38 MB. Il numero di file cresce con **quante ads meritano un'analisi**, non con **quante settimane passano**.

- **Nome scheda** = `<slug>-<ad_id>.md`: lo slug (2-3 parole kebab-case, coniato alla creazione, poi immutabile) rende leggibili tab/ricerca/backlink di Obsidian; l'id in coda garantisce unicità.
- **Watchlist per brand cliente**: `brands/<brand>/competitors/watchlist.md`.
- **Niente cartelle `raw/` né `media/`**.

## 3. `ledger.json` — lo stato che abilita il dedup

Una riga per **creatività** (chiave = `ad_id` rappresentante, stringa). È l'unico file che lo script legge per decidere "creatività nuova / già nota" e "già trascritta?". Schema reale:

```json
{
  "961585206240439": {
    "brand": "emma",
    "cluster_id": "video-asset-902626546149604",
    "formato": "video-testimonial",
    "angolo_1riga": "reframe di meccanismo — non è la fibra, sono i batteri",
    "attiva_dal": "2026-04-08",
    "prima_vista": "2026-07-24",
    "settimane_viste": ["2026-W30"],
    "stato": "attiva",
    "giorni_attivi": 107,
    "varianti_attive": null,
    "fascia_impression": "n/d",
    "piattaforme": ["FACEBOOK", "INSTAGRAM", "AUDIENCE_NETWORK", "MESSENGER"],
    "video": true,
    "trascritta": true,
    "analisi": "analisi-2026.md#961585206240439",
    "url_ad_library": "https://www.facebook.com/ads/library/?id=961585206240439"
  }
}
```

Note di schema:

- **`cluster_id`** raggruppa i duplicati: se al censimento compaiono nuovi ad_id con lo stesso `cluster_id`, NON si crea una nuova riga — si aggiorna `varianti_attive` sulla riga esistente. È così che 830 ads collassano in ~50 righe.
- **`varianti_attive`** = numero di ad_id attivi che condividono quel `cluster_id` (dal censimento della settimana). È uno dei tre campi che il run aggiorna sempre; entra anche nella tracksheet (richiesta di Simone).
- **`giorni_attivi`** della creatività = oggi − `attiva_dal` più vecchio tra i membri del cluster (quando il brand l'ha lanciata la prima volta).
- **Niente `last_seen`**: la storia è l'array `settimane_viste` (l'ultimo elemento è l'ultimo avvistamento). Non si tracciano le spente: chi smette di essere visto smette di crescere in `giorni_attivi` e scende dai winner da solo.
- Date ISO complete (`2026-07-24`); settimane sempre zero-padded (`W01`…`W09`, mai `W9`).

---

## 4. L'analisi — una sezione di `analisi-<anno>.md`, non un file

Ogni creatività che supera il cancello riceve un'**analisi**: una sezione `### <ad_id>` appesa in fondo alla parte «Analisi per creatività» di `analisi-<anno>.md`. Stessa ancora del contenitore: `analisi-<anno>.md#<ad_id>` sta al giudizio come `creativita-<anno>.md#<ad_id>` sta al testo. Scritta una volta, mai rigenerata. Template:

```markdown
### 961585206240439
**[Brand] formato — titolo parlante**
📄 testo integrale: [creativita-<anno>.md#<ad_id>](creativita-<anno>.md#<ad_id>) · 🔗 [Ad Library](…)

##### Analisi — angolo & formato
- **Formato**: …                          ← check-archivio la legge e la riporta sul ledger
- **Angolo (1 riga)**: …                  ← idem: righe obbligatorie, in questa forma esatta
- Big idea / meccanismo · Hook · Struttura
- Leva emotiva · Target/avatar · CTA / offerta · 💡 Trasferibile a noi

##### Creatività
> Non conservata in locale — si vede nell'Ad Library. [1 riga sul visual]
```

**Il testo verbatim NON sta qui**: sta nel contenitore, e l'analisi ne linka l'ancora. Due copie dello stesso testo divergono; una sola no.

In testa al file: l'**indice delle analisi** (tabella creatività → angolo → ancora) e la parte «**Osservazioni di periodo**» — l'erede del report settimanale, senza cadenza fissa: una sezione `## <periodo>` quando c'è qualcosa da dire (cosa stanno testando, winner consolidati, pattern emergenti).

---

## 5. `tracksheet-concorrenza.base` — una riga per BRAND

Core plugin **Bases** di Obsidian (zero installazioni). Filtra `tipo == "brand-monitorato"` → **una riga per brand osservato** (il frontmatter di `brand.md`), non per ad. La colonna Brand è una formula `file.asLink(nome)`: il nome è cliccabile e apre la pagina del brand.

Colonne: Brand (link) · commento · creatività · ads attive · 🏆 winner ≥30gg · 🆕 ultimi 14gg · video · trascritte · analisi · longevità max · ultimo run. Viste: **Brand osservati** · **📊 Copertura del lavoro** (censite vs trascritte vs analizzate) · **🆕 Attività recente**.

La tabella non cresce col tempo: cresce coi brand. Il dettaglio per-ad non le appartiene — si scende cliccando il brand, poi dall'indice del contenitore.

---

## 6. Report — `report/<anno>.md`, una sezione per settimana

Digest del lunedì, **appeso in fondo al file dell'anno** come sezione `## <YYYY-W##>` (non più un file per settimana). Scorrendo il file si legge l'evoluzione del brand. Struttura (vedi 2026-W30):

```markdown
## In sintesi                       ← N creatività · 🆕 X nuove · 🏆 Y winner consolidati
## 🆕 Cosa stanno testando questa settimana   ← SEZIONE PRIORITARIA (Simone): il radar delle novità
     Per ogni NUOVA creatività (nuove sotto il cancello + appena "diplomate"): formato · **angolo in 1 riga** ·
     **snippet del copy nuovo** (1-2 righe verbatim) · link Ad Library · → scheda (se elaborata).
     Raggruppate per angolo quando emerge un pattern ("3 nuove ads sull'angolo X"). Deve bastare un colpo
     d'occhio per capire quali angoli/copy nuovi il brand sta provando.
## 🏆 Winner consolidati (≥30 gg)   ← tabella: creatività | formato | angolo | gg | varianti | scheda. Le ads vecchie confermate.
## 🎯 Angoli & formati della settimana (aggregazione dai dati)   ← FATTUALE: nuovi angoli comparsi vs. angoli che reggono
## 💡 Idee da testare (proposte del modello — da vagliare)       ← unica sezione interpretativa
```

Due letture affiancate, entrambe facili da vedere: **cosa c'è di nuovo** (🆕, cosa stanno testando: angoli e copy nuovi) e **cosa è confermato** (🏆, i winner vecchi che pagano). **Niente sezione "spente"** (decisione Simone): un'ad che smette di girare smette di accumulare longevità e scende da sola dai winner — si auto-squalifica, non serve tracciarla. Il report **non ricopia** le trascrizioni: linka le schede.

---

## 6bis. Campionamento, varianti e costi (come si decide quanto analizzare) — **[DECISO 2026-07-24]**

Il costo non è uniforme: tre lavori, tre prezzi. **Censimento** (leggere i metadati) = gratis (solo Playwright). **Trascrizione** = gratis, locale (mlx-whisper, ~15-20s a video). **Analisi + scheda** = l'unico costo in token. Quindi la leva del costo NON è "quante ads scrapo" ma "su quante faccio il lavoro pesante". Tre velocità:

**1. Censimento — le prime 100 ads attive di OGNI pagina del brand, gratis. [DECISO 2026-07-24 sera]**
- **Un brand = nome + sito + una o più pagine Facebook** da cui sponsorizza. **Le pagine le fornisce Simone** (non si indovinano: una pagina "Emma's Finds" trovata per keyword si è rivelata un brand anti-fumo estraneo). Config in `monitoraggio/<brand>/config.json`: `nome`, `sito`, `paese`, `lingua`, `pagine_fb[]` con `page_id`. Si compila una volta.
- **Campione = le prime 100 ads attive PER PAGINA** (`active_status=active` + `view_all_page_id=<id>` → solo le ads di quella pagina, **zero rumore**). 100 è sufficiente (decisione di Simone) e sostituisce sia il vecchio filtro-90-giorni sia il criterio "scroll" (che non era un criterio chiaro).
- **Perché 100 NON perde i winner vecchi**: il set iniziale della Ad Library non è "i più recenti", mescola già longevi e nuovi — verificato: tra le prime ~80-180 ads di Emma comparivano creatività da 300+ giorni ancora attive. Quindi 100 cattura sia i **winner consolidati** sia le **novità**. ⚠️ Il filtro-data su `start_date` **NON si usa ed è stato rimosso** (taglierebbe i winner longevi ancora attivi). Ordinamento/probe filtri (`tools/probe-filters.mjs`) restano disponibili ma non necessari con le pagine esatte.
- Unisce le ads di tutte le pagine → raggruppa per `cluster_id` → calcola `giorni_attivi` e `varianti_attive`. Popola/aggiorna il ledger. Nessun token speso qui.
- **Niente tracking delle spente** (decisione Simone 2026-07-24): non ci serve sapere quali ads si sono spente. Un'ad che smette di essere vista smette di accumulare `giorni_attivi` e scende da sola dalla classifica dei winner → **si auto-squalifica per longevità**. Nessuna sezione "spente" nel report, nessuna vista "spente" nella tracksheet, nessuna logica di rilevamento nello scraper. Il gioco è la longevità: chi cresce funziona.

**2. Lettura leggera — ogni creatività NUOVA, quasi gratis.**
- Il copy è già testo scaricato → il modello ne ricava l'angolo in una riga (~50 token). Va nel report ("🆕 comparse 12 nuove angolazioni"): fiuti gli angoli in anticipo, prima ancora che si sappia se reggono. Nessuna trascrizione.

**3. Scheda profonda — solo i winner oltre il cancello, costosa ma UNA volta.**
- **Cancello di longevità = 14 giorni.** Una creatività riceve trascrizione + scheda completa solo quando `giorni_attivi ≥ 14` (ha dimostrato di reggere 2 settimane). Le più giovani restano righe di censimento + lettura leggera; se sopravvivono, si "diplomano" e ricevono la scheda la settimana in cui superano il cancello. **La spesa insegue il segnale.**
- **Tetto per brand = ~15-20 creatività a fondo per run.** Se in una settimana i candidati superano il tetto, si processano i top per (`giorni_attivi`, `varianti_attive`) e si **logga cosa è stato rimandato** (mai tagli silenziosi — regola del vault).

**Due soglie distinte, non confonderle**: 14 gg = "merita una scheda a fondo"; 30 gg = etichetta "🏆 winner consolidato" nel report e nella vista Base. Servono a cose diverse.

**Costo reale.** I token seguono i **winner, non il volume**: un brand da 830 ads e uno da 30 costano uguale se hanno lo stesso numero di creatività oltre il cancello. Il grosso è **frontale all'onboarding** di un brand (si processa lo stock attuale di winner, a spanne ~100k token per un brand ricco); poi a regime ogni settimana si processano solo i **nuovi diplomati** (1-3 creatività → ~15-30k token). Aggiungere un brand alla watchlist è l'evento costoso; il mantenimento settimanale è minimo.

---

## 7. Logica del run settimanale (pseudocodice)

```
per ogni brand osservato:
  # CENSIMENTO — solo ads con attiva_dal negli ultimi 90 giorni
  scraped  = scrape(brand)   # prime 100 ads ATTIVE per ogni pagina del config (nessun filtro data) — gratis
  clusters = raggruppa(scraped)                      # video → xpv_asset_id ; statica → hash immagine/copy
  ledger   = load(ledger.json)
  da_elaborare = []

  per ogni cluster in clusters:
    rappr = ad_id più longevo del cluster
    cluster.varianti_attive = conta ad_id attivi nel cluster
    cluster.giorni_attivi   = oggi - min(attiva_dal dei membri)

    if cluster.cluster_id NON in ledger:
      # 🆕 nuova creatività
      report.nuove += (cluster, lettura_leggera(cluster.copy))    # angolo 1 riga dal solo copy, ~gratis
      if cluster.giorni_attivi >= 14: da_elaborare += cluster     # oltre il cancello già alla comparsa
      ledger[rappr] = {cluster_id, stato:'attiva', prima_vista:oggi, settimane_viste:[week],
                       giorni_attivi, varianti_attive, ...}
    else:
      # 🔁 già nota — aggiorna SOLO stato, giorni_attivi, varianti_attive
      r = ledger[cluster_id → rappr]
      r.settimane_viste += week
      r.giorni_attivi    = cluster.giorni_attivi
      r.varianti_attive  = cluster.varianti_attive
      if scheda_non_esiste(r) and cluster.giorni_attivi >= 14:
        da_elaborare += cluster        # si è "diplomata": ora merita la scheda piena

  # TETTO: se len(da_elaborare) > ~20 → tieni i top per (giorni_attivi, varianti_attive), LOGGA i rimandati
  per ogni cluster in da_elaborare[:tetto]:
    if cluster.video: scarica in tmp → trascrivi (una volta) → CESTINA
    analizza angolo/formato → appendi la sezione ### <ad_id> in analisi-<anno>.md

  # Niente rilevamento spente: chi non si vede più smette di crescere e scende dai winner da solo (auto-squalifica per longevità)

  save(ledger.json); scrivi report/<YYYY-W##>.md   # la Base si aggiorna da sola
```

**Trappole disinnescate**: riaccesa (stesso `cluster_id` → scheda già pronta, si segnala) · caption ≠ parlato (si trascrive sempre) · variante nuova di creatività nota (nessuna scheda nuova, solo `varianti_attive++`).

---

## 8. Tassonomia angoli & formati

**Formati = vocabolario chiuso** (filtrabili nella Base):
`statica-immagine` · `carosello` · `video-testimonial` · `video-talking-head` · `video-VSL` · `video-demo/screencast` · `video-broll+testo` · `video-UGC` · `meme/screenshot` · `advertorial-native`

**Angoli = 6 campi strutturati** per scheda (angolo-1riga, big idea/meccanismo, hook, struttura, leva emotiva, avatar): confrontabili e aggregabili nel report. Stessa griglia della swipe library.

---

## 9. Decisioni chiuse il 2026-07-24 (con Simone — non riaprirle)

1. Archivio **centralizzato** + watchlist per brand cliente
2. **Niente `last_seen`** nelle viste umane (solo `settimane_viste` nel ledger)
3. **Niente media in locale** (video: trascrivi e cestina; creatività si rivede in Ad Library, filtro "attive" rimosso per le spente)
4. **Niente `raw/`** nel vault (dati di test in `tools/`)
5. Vista tabellare = **Obsidian Bases** (`tracksheet-concorrenza.base`)
6. Schede `<slug>-<ad_id>.md`, frontmatter e proprietà **in italiano**
7. In git: schede, report, ledger, base, index (tutto tranne `tools/test-*`)
8. **Unità = creatività, non ad**: dedup per `cluster_id` (video: `xpv_asset_id`; statica: hash), una scheda per creatività, `varianti_attive` come conteggio e **colonna della tracksheet**
9. **Campionamento** (§6bis): cancello scheda profonda = **14 giorni**; lettura leggera delle nuove = **sì**; tetto **~18** creatività/brand/run con log dei rimandati; etichetta winner consolidato = 30 gg
10. **[2026-07-24 sera] Brand multi-pagina**: un brand = nome + sito + **una o più pagine FB** (fornite da Simone, in `config.json`). Il censimento cicla tutte le pagine.
11. **[2026-07-24 sera] Campione = prime 100 ads attive per pagina** (non il filtro-data, non lo "scroll"): sufficiente e cattura sia i winner vecchi sia le novità (il set iniziale della Ad Library li mescola già).
12. **[2026-07-24 sera] Report a due letture**: la sezione **🆕 "Cosa stanno testando"** (angoli e copy nuovi) è prioritaria e facile da vedere, accanto ai **🏆 winner confermati**.
13. **[2026-07-24 sera] Niente tracking/report delle spente**: la longevità le auto-squalifica (chi non cresce più scende dai winner). Rimosse: sezione report, vista Base, logica scraper.
14. **[2026-08-02] Tre strati separati** — contenuto (contenitore append-only per brand/anno) · indice (ledger + tabella in testa) · giudizio (schede). Motivo: il numero di file deve crescere con quante ads meritano un'analisi, non con quante settimane passano.
15. **[2026-08-02] Niente più file per settimana**: manifest unico `_run.json`, report annuale con sezioni appese, contenuto append-only. I vecchi `trascrizioni-<settimana>.md`, `_run-<settimana>.json` e `report/<settimana>.md` sono stati migrati e cestinati il 2026-08-02 (5 brand, 681 creatività, zero perdite verificate).
16. **[2026-08-02] Il testo verbatim sta in UN solo posto** (il contenitore). Le schede ne portano l'estratto d'apertura e il link all'ancora `#<ad_id>`.
17. **[2026-08-02] La tracksheet è per BRAND, non per ad.** Una riga per brand osservato (`brand.md` col frontmatter `tipo: brand-monitorato`), con commento e numeri. Cliccando si scende alla pagina del brand, da lì al contenitore e alle analisi, da lì all'ancora della singola ad. Le due alternative scartate: uno stub .md per creatività (migliaia di note per popolare una tabella) e la tabella per-ad (illeggibile oltre qualche centinaio di righe). Quando servirà un foglio ordinabile su tutto l'archivio, la strada è **un singolo HTML generato dai ledger**.
18. **[2026-08-02] Tre documenti per brand**: `brand.md` (identità + riga di tracksheet) · `creativita-<anno>.md` (il testo) · `analisi-<anno>.md` (il giudizio + le osservazioni di periodo). Sciolte le cartelle `ads/` e `report/`. Migrazione verificata: 96 analisi e 5 report, 1.119 frasi confrontate col backup, zero perdite.
19. **[2026-08-02] In `brand.md` la macchina possiede solo la testa**: frontmatter + blocco fra i marcatori `<!-- numeri -->`. Tutto ciò che viene dopo è dossier scritto a mano e non si tocca mai.

## 10. Punti aperti (da tarare sui dati reali)

1. ✅ **RISOLTO 2026-07-24**: la Ad Library pubblica accetta il **filtro data via URL** e offre l'**ordinamento** ("Impression: decrescenti" / "Più recenti") — vedi §6bis. Il censimento dei brand enormi si accorcia col filtro data (+ sort impression dove il dato UE è significativo).
2. Taratura fine di cancello (14), tetto (15-20) e pesi dello score (piano §6) dopo 2-3 settimane
3. Giorno/ora del run settimanale e canale di notifica

## Collegamenti

- index dell'area · [Piano brand-monitor](brand-monitor-piano.md) · [SETUP](SETUP.md) · swipe-ingestion
