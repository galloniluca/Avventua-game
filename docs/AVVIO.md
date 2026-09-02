# Come far partire Avventua

Guida da zero: al momento su GitHub c'è solo il codice, non c'è niente di acceso
da nessuna parte. Questa pagina ti porta, in quattro tappe, da "non ho creato
niente" a "ho l'app sul telefono".

Le tappe sono in ordine di sforzo crescente. **Puoi fermarti dopo la Tappa 1** e
avere già l'app che gira davanti agli occhi.

| Tappa | Cosa ottieni | Account da creare | Tempo |
| --- | --- | --- | --- |
| 1 | L'app nel browser del tuo PC, giocabile | nessuno | ~30 min (quasi tutti di installazione) |
| 2 | L'app installata sul telefono | nessuno | ~15 min |
| 3 | Il Dungeon Master vero (AI) | Google AI Studio (gratis) — **oppure nessuno, se hai Ollama** | ~5 min |
| 4 | Funziona anche lontano dal PC | Cloudflare (gratis) | ~20 min |

---

## Tappa 0 — Cosa installare

Due cose sole, sul tuo computer.

**Node.js** (fa girare il backend) — https://nodejs.org, versione LTS.

**Flutter** (fa girare l'app) — https://docs.flutter.dev/get-started/install,
scegli il tuo sistema operativo. È un download grosso (~2 GB), è la parte lenta.

Poi verifica che ci siano entrambi:

```bash
node --version      # deve stampare v20 o superiore
flutter doctor      # deve avere il segno di spunta su "Flutter"
```

`flutter doctor` si lamenterà di cose che ancora non hai (Android Studio, licenze,
Xcode). **Per la Tappa 1 va benissimo così**: serve solo la riga di Flutter e un
browser Chrome.

Poi scarica il codice:

```bash
git clone https://github.com/galloniluca/Avventua-game.git
cd Avventua-game
git checkout claude/dnd-ai-dm-app-bmz0ip
```

### Nota per Windows

Se hai **Git for Windows** installato, hai già **Git Bash**: tutti i comandi di
questa guida vanno scritti lì (non nel Prompt dei comandi né in PowerShell — la
sintassi è quella di bash).

- **Node.js**: scarica l'installer `.msi` versione LTS da nodejs.org ed eseguilo
  con le opzioni di default.
- **Flutter**: scarica lo **zip** (non serve Android Studio per questa tappa),
  estrailo in un percorso corto e senza spazi come `C:\src\flutter` — non dentro
  `Program Files` e **non dentro OneDrive**, che sincronizza ogni singolo file e
  rallenta tutto. Poi aggiungi `C:\src\flutter\bin` al PATH da
  *Modifica le variabili d'ambiente relative all'account* → *Path* → *Nuovo*, e
  **riapri Git Bash** perché legga il PATH aggiornato.
- Clona il repository anch'esso **fuori da OneDrive**, es. `C:\dev\Avventua-game`
  (`mkdir -p /c/dev && cd /c/dev` in Git Bash).
- Se `flutter doctor` si lamenta di "Developer Mode", esegui
  `start ms-settings:developers` e attivalo — per la sola prova nel browser di
  solito non serve, ma può servire più avanti per l'APK.

---

## Tappa 1 — L'app nel browser, senza nessun account

Servono **due terminali aperti contemporaneamente**: uno per il backend, uno per
l'app. È normale: sono due programmi separati che si parlano.

### Terminale 1 — il backend

```bash
cd Avventua-game/backend
npm install
npx wrangler d1 migrations apply avventua --local
npm run dev:demo
```

L'ultimo comando resta aperto e scrive `Ready on http://localhost:8787`.
**Lascialo aperto.**

`dev:demo` fa partire il backend con un **Dungeon Master di prova**: risponde
senza AI, con narrazione precotta, ma fa girare per davvero dadi, punti ferita,
punti esperienza e riassunti. Serve per vedere che tutta la macchina funziona
prima di procurarti una chiave AI.

> Tutto questo gira **sul tuo computer**. Non serve un account Cloudflare: il
> database è un file dentro `backend/.wrangler/`. Se wrangler ti chiede di fare
> login, vuol dire che sta provando ad andare online — controlla di aver scritto
> `--local` nel comando delle migration.

### Terminale 2 — l'app

```bash
cd Avventua-game/app
flutter pub get
flutter run -d chrome --dart-define=AVVENTUA_API=http://localhost:8787
```

Si apre Chrome con l'app. Da lì:

1. **Nuovo personaggio** → dai un nome, scegli razza e classe, premi **Tira 4d6**
   (i dadi arrivano dal backend, non dal browser), salva.
2. Apri il personaggio → **Nuova campagna** → titolo, lunghezza, complessità.
3. **Comincia l'avventura** → il DM apre la scena.
4. Scrivi liberamente cosa fai. Ogni tanto il DM chiede un tiro: compare il d20,
   lo tiri, e il DM narra com'è andata.

Se qualcosa non va, salta alla sezione **Se qualcosa non funziona** in fondo.

### Perché Chrome e non un'app sul desktop

Flutter sa compilare anche in app nativa per Windows, macOS e Linux, quindi la
domanda è legittima. Per questo progetto Chrome resta la scelta migliore per il
primo giro, per tre motivi:

1. **Non richiede altro.** Il desktop nativo su Windows vuole Visual Studio con
   il carico "Sviluppo di applicazioni desktop con C++" (circa 7 GB), su macOS
   vuole Xcode, su Linux le librerie GTK di sviluppo. È più installazione di
   quanta ne serva per l'APK Android.
2. **È lo stesso identico codice.** Non stai guardando un'approssimazione:
   `lib/` è quello che finirà nell'APK.
3. **Ti serve comunque.** La build web è quella che ti mette l'app sul telefono
   in cinque minuti nella Tappa 2a, senza Android Studio.

Una cosa da fare però sì: **guardala a misura di telefono.** L'interfaccia è
disegnata per uno schermo stretto, e a tutta larghezza di monitor sembra sbagliata.
In Chrome premi `F12`, poi l'icona del telefono in alto a sinistra nel pannello
(o `Ctrl+Shift+M`), e scegli un dispositivo tipo *Pixel 7*.

Mentre `flutter run` è attivo, il terminale accetta comandi utili:
`r` ricarica le modifiche al volo, `R` riavvia l'app, `q` esce.

Se più avanti vuoi la resa davvero fedele, l'**emulatore Android** di Android
Studio è la strada giusta — ma tanto vale installarlo quando ti servirà per
costruire l'APK (Tappa 2b), non adesso.

---

## Tappa 2 — L'app sul telefono

Ci sono due modi. Il primo è immediato, il secondo dà l'app vera.

### 2a. Installarla dal browser del telefono (subito, zero configurazione)

L'app è già una PWA: Android sa installarla dalla pagina web. Perché il telefono
veda il tuo PC, devono essere sulla **stessa rete Wi-Fi**.

Trova l'indirizzo IP del tuo computer (`ipconfig` su Windows, `ifconfig | grep inet`
su Mac/Linux) — sarà tipo `192.168.1.42`. Poi:

```bash
# Terminale 1: backend in ascolto su tutta la rete, non solo su localhost
cd backend && npm run dev:demo -- --ip 0.0.0.0

# Terminale 2: app compilata puntando all'IP del PC
cd app
flutter build web --dart-define=AVVENTUA_API=http://192.168.1.42:8787
cd build/web && python3 -m http.server 8080
```

Dal telefono apri `http://192.168.1.42:8080`, poi menù di Chrome →
**Aggiungi a schermata Home**. Ottieni un'icona che apre l'app a schermo intero,
senza barra del browser.

È un ottimo modo per provarla in mano, ma resta legata al PC acceso. Per l'app
vera, il punto 2b.

### 2b. Costruire l'APK da installare

Serve **Android Studio** installato (`flutter doctor` ti dice cosa manca e come
sistemarlo, incluse le licenze da accettare con `flutter doctor --android-licenses`).

Il progetto non ha ancora la cartella `android/`: la genera Flutter.

```bash
cd app
flutter create --platforms=android --project-name avventua .
```

> ⚠️ Questo comando potrebbe sovrascrivere `lib/main.dart` con il template
> standard di Flutter. Subito dopo controlla e, se è successo, ripristina:
> ```bash
> git status                # se compare lib/main.dart come modificato
> git checkout lib/main.dart
> ```
> Il resto del codice in `lib/` non viene toccato. Ho preferito farti generare
> la cartella con Flutter invece di scriverla a mano: contiene file Gradle molto
> sensibili alla versione, ed è meglio che li produca il tuo Flutter, non io.

Poi:

```bash
flutter build apk --release --dart-define=AVVENTUA_API=http://192.168.1.42:8787
```

L'APK finisce in `build/app/outputs/flutter-apk/app-release.apk`. Copialo sul
telefono e installalo (Android chiederà di consentire le app da origini
sconosciute: è normale per un'app non pubblicata sul Play Store).

Attenzione: l'indirizzo del backend viene **congelato dentro l'APK** al momento
della compilazione. Con un IP di casa, l'app funziona solo sulla tua rete. Per
farla funzionare ovunque serve la Tappa 4.

---

## Tappa 3 — Il Dungeon Master vero

Finora hai giocato con il DM di prova, che non usa AI. Ci sono due strade per
avere un modello vero, e puoi cambiare idea quando vuoi: il motore AI sta dietro
un'interfaccia unica, quindi si passa dall'uno all'altro con una variabile.

| | Ollama (sul tuo PC) | Gemini (nel cloud) |
| --- | --- | --- |
| Account | nessuno | Google, gratuito |
| Costo | zero | zero fino a 1.500 richieste/giorno |
| Privacy | non esce niente dal PC | i prompt vanno a Google |
| Velocità | 10-90 secondi a turno, dipende dal PC | 2-5 secondi |
| Qualità in italiano | discreta con un modello da 7-8B | nettamente migliore |
| Funziona da fuori casa | no | sì |

Se hai già Ollama installato, **parti da lì**: è a costo zero e non richiede di
creare niente. Quando vorrai giudicare come scrive davvero il Dungeon Master,
passa a Gemini.

### 3a. Con Ollama (già installato sul tuo PC)

Scarica un modello, se non ne hai già uno adatto:

```bash
ollama pull qwen2.5:7b      # ~5 GB, buona resa in italiano e con il JSON
```

Alternative, se hai almeno 16 GB di RAM: `mistral-nemo` (12B, scrive meglio in
italiano ma è più lento) oppure `llama3.1:8b`.

Poi fai partire il backend puntandolo su Ollama:

```bash
cd backend
npm run dev:ollama
```

Il modello e l'indirizzo si cambiano in `wrangler.toml` (`OLLAMA_MODEL`,
`OLLAMA_URL`), oppure al volo:

```bash
npx wrangler dev --var AI_PROVIDER:ollama --var OLLAMA_MODEL:mistral-nemo
```

Due cose da sapere:

- **Il primo turno è lento.** Ollama deve caricare i pesi in memoria. Dal secondo
  in poi va molto più veloce, perché il modello resta caricato dieci minuti.
- **`num_ctx` è impostato a 8192 apposta.** Il default di Ollama è spesso 2048
  token, mentre il prompt del Dungeon Master (ambientazione + riassunto della
  campagna + eventi recenti + scheda del personaggio) li supera facilmente. Con
  un contesto troppo corto il modello perde l'inizio delle istruzioni e comincia
  a proporti scelte multiple o a dimenticarsi chi è morto.

Cosa aspettarsi onestamente: un modello da 7-8 miliardi di parametri regge bene
le meccaniche (chiede i tiri giusti, rispetta il formato) ma scrive un italiano
più piatto e ogni tanto perde il filo delle sottotrame lunghe. Va benissimo per
sviluppare e per capire se il gioco ti diverte.

### 3b. Con Gemini

Serve una chiave, gratuita.

1. Vai su https://aistudio.google.com/apikey e accedi con un account Google.
2. **Create API key** → copia la chiave.
3. Crea il file `backend/.dev.vars` (è già ignorato da git, non finirà su GitHub):

```
GEMINI_API_KEY="incolla-qui-la-tua-chiave"
```

4. Riavvia il backend, stavolta **senza** `:demo`:

```bash
cd backend
npm run dev
```

Da adesso narra Gemini.

Il piano gratuito dà 1.500 richieste al giorno. Una sessione di gioco da venti
turni con qualche tiro di dado ne consuma una trentina, quindi ci stai
comodamente. Quando la quota finisce, l'app te lo dice con parole comprensibili
invece di mostrare un errore.

---

## Tappa 4 — Metterla online

Serve perché l'app funzioni anche quando il tuo PC è spento. Account Cloudflare
gratuito: https://dash.cloudflare.com/sign-up

```bash
cd backend
npx wrangler login                    # apre il browser per autorizzare

npx wrangler d1 create avventua       # stampa un database_id
# copia quell'id dentro wrangler.toml, al posto degli zeri

npx wrangler d1 migrations apply avventua --remote
npx wrangler secret put GEMINI_API_KEY   # incolla la chiave quando la chiede
npx wrangler deploy
```

Alla fine `deploy` stampa l'indirizzo pubblico, tipo
`https://avventua-backend.tuonome.workers.dev`.

Da lì in poi usa quello al posto dell'IP di casa:

```bash
cd app
flutter build apk --release \
  --dart-define=AVVENTUA_API=https://avventua-backend.tuonome.workers.dev
```

Questo APK funziona ovunque, con qualsiasi connessione.

> **Prima di darlo ad altre persone**, leggi la sezione "Cosa resta aperto" in
> [architettura.md](architettura.md). In particolare non c'è ancora
> autenticazione: chi conosce l'identificativo di un altro utente può leggerne le
> partite. Per te che giochi da solo va bene; per un'app distribuita no.

---

## Se qualcosa non funziona

**`flutter: command not found`** — Flutter è scaricato ma non è nel PATH. Rifai
l'ultimo passo della guida di installazione ufficiale, quello che aggiunge
`flutter/bin` al PATH, e riapri il terminale.

**L'app si apre ma dice "Nessuna connessione al server di gioco"** — il backend
non è in ascolto o l'indirizzo è sbagliato. Controlla che il Terminale 1 stia
ancora scrivendo `Ready on http://localhost:8787`, e che l'indirizzo passato con
`--dart-define` sia esattamente quello.

**Dal telefono non si collega, dal PC sì** — è quasi sempre il firewall del
computer che blocca la porta 8787 dalla rete locale, oppure hai dimenticato
`--ip 0.0.0.0` sul backend.

**`wrangler` chiede di fare login nella Tappa 1** — manca `--local` nel comando
delle migration. In locale non serve nessun account.

**Il DM risponde con testo strano tipo "(DM di prova: ho ricevuto…)"** — stai
girando con `npm run dev:demo`. È corretto: è il DM finto. Passa alla Tappa 3.

**"Impossibile contattare Ollama"** — Ollama non è in esecuzione. Aprilo, oppure
da terminale `ollama serve`. Verifica che risponda con
`curl http://127.0.0.1:11434/api/tags`.

**"Ollama non ha il modello X"** — scaricalo con `ollama pull X`. Con
`ollama list` vedi quelli che hai già.

**Con Ollama il DM propone scelte multiple o si dimentica le cose** — quasi
sempre è il contesto troppo corto per il modello che stai usando. Alza
`OLLAMA_NUM_CTX` in `wrangler.toml`, o passa a un modello più capace.

**Voglio ripartire da zero con il database locale** — cancella la cartella
`backend/.wrangler/` e rifai il comando delle migration.

---

## Riepilogo dei comandi

```bash
# ogni volta che vuoi giocare in locale, due terminali:
cd backend && npm run dev            # Gemini    (serve la chiave)
cd backend && npm run dev:ollama     # Ollama    (modello sul tuo PC)
cd backend && npm run dev:demo       # DM finto  (niente AI, niente account)
cd app && flutter run -d chrome --dart-define=AVVENTUA_API=http://localhost:8787

# verificare che il backend sia sano
cd backend && npm test               # 64 test
```
