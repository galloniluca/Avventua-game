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
| 3 | Il Dungeon Master vero (AI) | Google AI Studio (gratis) | ~5 min |
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

Finora hai giocato con il DM di prova. Per avere l'AI serve una chiave Gemini,
gratuita.

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

Da adesso narra il modello vero.

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

**Voglio ripartire da zero con il database locale** — cancella la cartella
`backend/.wrangler/` e rifai il comando delle migration.

---

## Riepilogo dei comandi

```bash
# ogni volta che vuoi giocare in locale, due terminali:
cd backend && npm run dev            # (o dev:demo senza chiave AI)
cd app && flutter run -d chrome --dart-define=AVVENTUA_API=http://localhost:8787

# verificare che il backend sia sano
cd backend && npm test               # 64 test
```
