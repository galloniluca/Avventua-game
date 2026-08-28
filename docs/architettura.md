# Architettura e decisioni

Documento di lavoro: registra *perché* le cose stanno come stanno, comprese le
scelte che si discostano dalla bozza di progetto iniziale, e cosa resta aperto.

## 1. Schema dati

Le nove entità della bozza ci sono tutte. Due cose sono strutturate diversamente,
in entrambi i casi per non dover ristrutturare più avanti.

### `campaign_participants` invece di `campaigns.partecipanti` (JSON)

La bozza prevedeva una lista JSON di `character_id` dentro `campaigns`. È una
tabella di join perché il requisito esplicito era "schema già pensato per
diventare multiplayer senza ristrutturazioni": con una lista JSON, "tutte le
campagne di questo personaggio" è una scansione completa con parsing applicativo,
mentre con la join è un indice. Oggi c'è sempre esattamente una riga per
campagna, quindi nella pratica non cambia niente per la v1.

### `session_events` invece di `sessions.eventi` (JSON)

Stessa logica, ragione più forte. Il log di sessione è *la* struttura su cui si
fa append a ogni turno e da cui si legge la finestra degli eventi recenti per il
prompt. Come blob JSON, ogni turno vorrebbe dire leggere tutto, deserializzare,
appendere e riscrivere tutto — con una race condition garantita appena due
richieste si sovrappongono. Come righe, l'append è una `INSERT` che calcola
l'ordine dentro la query stessa, con una `UNIQUE (session_id, ordine)` a fare
da rete di sicurezza.

Il conteggio delle "9 tabelle" della bozza resta concettualmente valido: sono
le stesse nove entità, con due relazioni normalizzate.

### `characters.inventario_id` rimosso

La bozza aveva sia `characters.inventario_id` sia una tabella `inventories`.
Sono due modi di dire la stessa cosa; è rimasta la tabella, che regge anche
quantità ed equipaggiato.

## 2. Il contratto con l'AI

Il DM non risponde in prosa libera: risponde con un JSON conforme a uno schema
(`src/prompts/contract.ts`), di cui la narrazione è solo un campo. Gli altri
campi sono **proposte**:

| Campo | Chi decide davvero |
| --- | --- |
| `narrazione` | l'AI |
| `richiesta_tiro` | l'AI chiede il tiro, il backend calcola il modificatore dalla scheda e genera il numero |
| `xp_assegnati` | il backend applica il cap per evento e ricalcola il livello |
| `danni_subiti` / `cure_ricevute` | il backend li applica entro `0..pfMax` |
| `aggiornamenti_mondo` | il backend valida i percorsi puntati prima di scrivere |
| `nuove_entita` | il backend le salva come contenuto dell'ambientazione, con upsert idempotente |

`normalizzaRispostaDm` non si fida di niente: campi mancanti, tipi sbagliati e
valori fuori dominio vengono ricondotti a qualcosa di sicuro invece di far
fallire il turno. Un modello che risponde male fa una brutta scena, non rompe la
partita.

### Perché lo stato del mondo usa percorsi puntati

L'AI propone `{"percorso": "png.bram.stato", "valore": "ostile"}` invece di
riscrivere l'intero `world_state`. Riscrivere tutto significherebbe che ogni
allucinazione cancella la memoria strutturata della campagna. Con i percorsi, il
danno massimo è una chiave sbagliata. `applicaAggiornamenti` valida ogni segmento
(niente `__proto__`, profondità e dimensione massime) e lavora su una copia.

## 3. Dadi

`src/rules/dice.ts` copre la notazione completa (`2d6+3`, `4d6kh3`, `1d20-1`),
vantaggio/svantaggio sul d20 singolo, CD e critici. L'RNG è iniettabile: in
produzione è `crypto.getRandomValues`, nei test è una sequenza fissa.

Il 20 naturale passa sempre e l'1 naturale fallisce sempre, indipendentemente
dalla CD — è la regola di tavolo che i giocatori si aspettano.

Il modificatore non arriva mai dal client: quando l'app invia un tiro, il backend
ricalcola il bonus dalla scheda del personaggio ignorando quello ricevuto.

## 4. Progressione

Soglie XP classiche fino al livello 20, incrementi di caratteristica ai livelli
4/8/12/16/19. `XP_MAX_PER_EVENTO` limita quanto un singolo turno può assegnare:
serve contro un modello troppo generoso, non contro il giocatore.

## 5. Costo delle chiamate AI

Il free tier di Gemini Flash dà 1.500 richieste al giorno. Il consumo per
sessione è:

- 1 chiamata per turno di azione;
- 1 chiamata in più per ogni tiro di dado (il DM deve narrarne l'esito);
- 1 chiamata a fine sessione per il delta di riassunto;
- 1 chiamata ogni N sessioni per il consolidamento.

Una sessione da 20 turni con 8 tiri costa quindi ~29 chiamate. Il retry sui 429
è già implementato; quando la quota è davvero finita l'app lo dice con parole
comprensibili invece di mostrare un errore HTTP.

## 6. Cosa resta aperto

- **Autenticazione.** Oggi l'header `x-utente-id` è dichiarativo: chiunque può
  spacciarsi per un altro utente conoscendone l'id. Va bene per lo sviluppo, non
  per la pubblicazione. Il punto da cambiare è solo `utenteDaRichiesta`
  (backend) e `utenteIdProvider` (app).
- **Rate limiting per utente.** Senza, un client che va in loop può bruciare la
  quota giornaliera condivisa di tutti.
- **Salita di livello.** Il backend rileva il passaggio di livello e i livelli
  con incremento di caratteristica, ma non c'è ancora il flusso in cui il
  giocatore *sceglie* dove mettere i punti: al momento le statistiche restano
  quelle iniziali.
- **Combattimento strutturato.** Oggi il combattimento è narrativo con tiri
  singoli. Il bestiario ha già le statistiche per gestirlo a turni con
  iniziativa, ma il motore non c'è.
- **Multiplayer.** Lo schema è pronto (join dei partecipanti, eventi come righe,
  dadi lato server). Manca il livello realtime: Firebase Realtime DB come da
  bozza, con gli eventi di sessione come sorgente di verità.
- **Immagini e musica.** Non toccati in questa fase, come da bozza.
- **Modalità "giocatore come DM".** Fuori scope v1.

## 7. Test

`npm test` esegue 59 test:

- unità su dadi, progressione, statistiche, normalizzazione del contratto,
  stato del mondo, memoria narrativa e provider Gemini (con `fetch` iniettato);
- end-to-end sul Worker vero, con D1 emulato su SQLite in memoria e un provider
  AI a risposte precotte: creazione personaggio → campagna → incipit → azione →
  tiro richiesto dal DM → tiro eseguito → chiusura sessione con riassunto, più
  consolidamento e isolamento fra utenti.

I test end-to-end usano gli handler e le query reali: se una migration rompe una
query, falliscono.
