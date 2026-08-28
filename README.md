# Avventua

Un gioco di ruolo D&D-like in cui il Dungeon Master è un'AI. Il giocatore non
sceglie fra opzioni preconfezionate: scrive liberamente cosa fa, e il DM narra
le conseguenze restando coerente con le regole e con tutto ciò che è già
successo.

> **Non hai ancora installato niente?** Parti da
> **[docs/AVVIO.md](docs/AVVIO.md)**: ti porta da zero all'app che gira, senza
> bisogno di creare account da nessuna parte per il primo giro.

```
app/       Applicazione Flutter (Android e web, poi iOS)
backend/   Cloudflare Worker + D1: dati, regole, motore DM-AI
docs/      Decisioni di progetto e punti aperti
```

## Come funziona un turno

```
giocatore scrive un'azione
        │
        ▼
POST /campaigns/:id/action ──► costruisce il prompt del DM
                                 (ambientazione + riassunto campagna
                                  + eventi recenti + stato del mondo
                                  + scheda personaggio)
        │
        ▼
   Gemini risponde in JSON strutturato
   { narrazione, richiesta_tiro, xp, danni, nuove entità, stato del mondo }
        │
        ▼
   il backend VALIDA e APPLICA: XP con cap, PF nei limiti, percorsi dello
   stato del mondo controllati, entità nuove salvate nell'ambientazione
        │
        ▼
   se serve un tiro ──► POST /campaigns/:id/roll
                        il numero nasce qui, mai nel modello
                        poi il DM narra l'esito
```

L'invariante è una sola: **l'AI propone, il backend dispone.** Nessun numero
che conta ai fini delle regole viene generato dal modello — né i dadi, né gli
XP effettivi, né i punti ferita risultanti, né il bonus di caratteristica. Il
motivo immediato è la coerenza con il regolamento; quello a lungo termine è il
multiplayer, dove tutti i partecipanti devono vedere lo stesso risultato.

## Backend

Cloudflare Workers + D1 (SQLite serverless), TypeScript, nessuna dipendenza a
runtime.

```bash
cd backend
npm install

# Database
npx wrangler d1 create avventua           # copiare database_id in wrangler.toml
npm run db:migrate:local                  # oppure db:migrate:remote

# Chiave Gemini
cp .dev.vars.example .dev.vars            # e inserire la chiave
npx wrangler secret put GEMINI_API_KEY    # per il deploy

npm run dev        # http://localhost:8787
npm test           # 59 test
npm run typecheck
npm run deploy
```

Con un modello locale già installato: `npm run dev:ollama` (vedi
[docs/AVVIO.md](docs/AVVIO.md), Tappa 3a). Per giocare **senza niente di niente**
basta `npm run dev:demo`: un Dungeon Master di
prova risponde con narrazione precotta ma fa girare per davvero dadi, punti
ferita, XP e riassunti, così si può verificare tutta la macchina prima di
procurarsi una chiave. Nei test si usa `AI_PROVIDER=mock`, deterministico.

### API

| Metodo | Rotta | Cosa fa |
| --- | --- | --- |
| `GET` | `/settings` | Ambientazioni disponibili |
| `GET` | `/settings/:id/{bestiary,npcs,items}` | Contenuti dell'ambientazione |
| `GET` `POST` | `/characters` | Elenca / crea personaggi |
| `POST` | `/characters/roll-stats` | Tira 4d6 scarta il peggiore |
| `GET` | `/characters/:id` | Scheda + inventario |
| `POST` `PATCH` `DELETE` | `/characters/:id/inventory[/:itemId]` | Inventario |
| `GET` `POST` | `/campaigns` | Elenca / crea campagne |
| `GET` | `/campaigns/:id` | Stato partita: campagna, PG, eventi, riassunto |
| `POST` | `/campaigns/:id/start` | Incipit generato dal DM |
| `POST` | `/campaigns/:id/action` | **Turno di gioco** |
| `POST` | `/campaigns/:id/roll` | Esegue il tiro richiesto e ne fa narrare l'esito |
| `POST` | `/campaigns/:id/end-session` | Chiude la sessione e aggiorna la memoria |
| `GET` | `/campaigns/:id/summary` | Riassunto della campagna |
| `POST` | `/campaigns/:id/novel` | Riscrive la cronaca come racconto |
| `POST` | `/dice/roll` | Tiro libero, fuori dal loop narrativo |

L'utente si identifica con l'header `x-utente-id`. In v1 non c'è
autenticazione: l'app genera un id locale alla prima apertura. È l'unico punto
da sostituire quando arriverà il login vero.

## App

```bash
cd app
flutter pub get

# nel browser (il modo più rapido per vederla)
flutter run -d chrome --dart-define=AVVENTUA_API=http://localhost:8787

# su emulatore Android: 10.0.2.2 è il localhost dell'host visto dall'emulatore
flutter run --dart-define=AVVENTUA_API=http://10.0.2.2:8787
```

Su dispositivo fisico va messo l'IP della macchina o l'URL del Worker deployato.
L'indirizzo viene congelato nel binario al momento della compilazione.

Richiede Flutter 3.27 o successivo. Stato con Riverpod, parsing JSON scritto a
mano (niente `build_runner` da mantenere).

Nel repository c'è la cartella `web/` (l'app è anche una PWA installabile dalla
schermata home). La cartella `android/` va generata una volta con
`flutter create --platforms=android .` — vedi [docs/AVVIO.md](docs/AVVIO.md),
Tappa 2b, per l'unica accortezza da avere.

## Memoria narrativa

Il problema è tenere una campagna coerente per decine di sessioni senza rileggere
tutto a ogni turno.

- **Fine sessione** → una chiamata AI riassume *solo* quella sessione e accoda
  il paragrafo. Costo: una chiamata a sessione.
- **Ogni N sessioni** (o oltre una soglia di lunghezza) → una chiamata rilegge
  consolidato + delta accumulati e li riscrive in un testo unico, eliminando
  ridondanze e contraddizioni. I delta inglobati vengono cancellati.
- **Fine campagna** → lo stesso consolidato viene riscritto come racconto e
  consegnato al giocatore.

Le soglie sono in `wrangler.toml` (`CONSOLIDA_OGNI_N_SESSIONI`,
`CONSOLIDA_SOGLIA_CARATTERI`).

## Cambiare motore AI

Tutto il backend parla solo con `ProviderAi.chiamaAI`. Per cambiare fornitore
si aggiunge un file in `backend/src/ai/`, si aggiunge un caso in `creaProvider`
e si cambia la variabile `AI_PROVIDER`. Nessun'altra riga di codice di gioco
cambia — utile visto che i free tier vengono deprecati senza preavviso.

Al momento ci sono quattro provider:

| `AI_PROVIDER` | Cosa fa |
| --- | --- |
| `gemini` | Gemini Flash via API. Serve `GEMINI_API_KEY`. |
| `ollama` | Modello locale via Ollama. Nessuna chiave, niente esce dal computer. |
| `demo` | Dungeon Master finto: narrazione precotta, meccaniche vere. Nessuna dipendenza. |
| `mock` | Deterministico, per i test. |

## Documenti

- [`docs/AVVIO.md`](docs/AVVIO.md) — guida passo passo da zero: installazione,
  primo avvio in locale, app sul telefono, messa online.
- [`docs/architettura.md`](docs/architettura.md) — decisioni di schema, contratto
  con l'AI, scelte che si discostano dalla bozza iniziale e punti ancora aperti.
