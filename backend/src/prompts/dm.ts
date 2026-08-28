/** Costruzione del prompt di sistema del DM-AI e del messaggio di turno. */

import type {
  Campaign,
  Character,
  RigaInventario,
  SessionEvent,
  Setting,
} from '../db/schema';
import { bonusCompetenza, modificatore, type Caratteristica, CARATTERISTICHE } from '../rules/stats';
import { progressoLivello, xpProssimoLivello } from '../rules/progression';

export interface ContestoDm {
  setting: Setting;
  campaign: Campaign;
  character: Character;
  inventario: RigaInventario[];
  /** Riassunto consolidato + delta successivi, già concatenati. */
  riassunto: string;
  /** Coda degli eventi della sessione corrente, in ordine cronologico. */
  eventiRecenti: SessionEvent[];
}

const RITMO: Record<string, string> = {
  breve:
    'La campagna è BREVE: punta alla conclusione in poche sessioni, evita sottotrame nuove, chiudi i fili che apri.',
  media:
    'La campagna è di LUNGHEZZA MEDIA: concediti una o due sottotrame, ma tieni sempre visibile l\'obiettivo principale.',
  lunga:
    'La campagna è LUNGA: puoi permetterti sottotrame, digressioni e PNG ricorrenti che maturano nel tempo.',
};

const ARTICOLAZIONE: Record<string, string> = {
  semplice: 'Complessità SEMPLICE: intrighi minimi, obiettivi chiari, poche fazioni.',
  media: 'Complessità MEDIA: qualche ambiguità morale e almeno due fazioni con interessi diversi.',
  articolata:
    'Complessità ARTICOLATA: fazioni multiple, informazioni parziali o inaffidabili, conseguenze a lungo termine.',
};

function schedaPersonaggio(c: Character, inventario: RigaInventario[]): string {
  const stats = CARATTERISTICHE.map((k: Caratteristica) => {
    const v = c.statistiche[k];
    const mod = modificatore(v);
    return `  - ${k}: ${v} (${mod >= 0 ? '+' : ''}${mod})`;
  }).join('\n');

  const prossimo = xpProssimoLivello(c.xp);
  const equip = inventario.filter((i) => i.equipaggiato);
  const zaino = inventario.filter((i) => !i.equipaggiato);

  const riga = (i: RigaInventario) =>
    `  - ${i.nome}${i.quantita > 1 ? ` x${i.quantita}` : ''} (${i.tipo})`;

  return [
    `- Nome: ${c.nome}`,
    `- Razza/classe: ${c.razza || 'ignota'} ${c.classe || ''}`.trim(),
    `- Livello: ${c.livello} — XP: ${c.xp}${
      prossimo === null ? ' (livello massimo)' : ` / ${prossimo} (${Math.round(progressoLivello(c.xp) * 100)}%)`
    }`,
    `- Bonus di competenza: +${bonusCompetenza(c.livello)}`,
    `- Punti ferita: ${c.stato.pf}/${c.stato.pfMax}`,
    c.stato.condizioni.length ? `- Condizioni attive: ${c.stato.condizioni.join(', ')}` : '- Condizioni attive: nessuna',
    '- Caratteristiche:',
    stats,
    equip.length ? `- Equipaggiato:\n${equip.map(riga).join('\n')}` : '- Equipaggiato: nulla',
    zaino.length ? `- Nello zaino:\n${zaino.map(riga).join('\n')}` : '- Nello zaino: niente',
    c.biografia ? `- Background: ${c.biografia}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

function formattaEvento(e: SessionEvent, nomePg: string): string {
  switch (e.tipo) {
    case 'narrazione':
      return `[DM] ${e.contenuto}`;
    case 'azione':
      return `[${nomePg}] ${e.contenuto}`;
    case 'richiesta_tiro':
      return `[SISTEMA] Tiro richiesto: ${e.contenuto}`;
    case 'tiro':
      return `[SISTEMA] Risultato del tiro: ${e.contenuto}`;
    default:
      return `[SISTEMA] ${e.contenuto}`;
  }
}

export function promptSistemaDm(ctx: ContestoDm): string {
  const { setting, campaign, character } = ctx;

  const eventi = ctx.eventiRecenti.length
    ? ctx.eventiRecenti.map((e) => formattaEvento(e, character.nome)).join('\n')
    : '(nessun evento: la sessione inizia adesso)';

  return `# Ruolo
Sei il Dungeon Master di una campagna di gioco di ruolo. Il tuo compito è narrare
l'avventura in modo coinvolgente, reagire alle azioni del giocatore con coerenza
e libertà totale, e non offrire MAI scelte multiple o elenchi di opzioni: il
giocatore scrive liberamente cosa vuole fare, tu narri le conseguenze.
Scrivi sempre in italiano, in seconda persona singolare.

# Ambientazione
- Nome: ${setting.nome}
- Descrizione: ${setting.descrizione}
- Stile/tono: ${setting.tono_narrativo}
- Ruleset: ${setting.ruleset}

# Parametri campagna
- Titolo: ${campaign.nome}
- ${RITMO[campaign.lunghezza_target] ?? RITMO.media}
- ${ARTICOLAZIONE[campaign.complessita] ?? ARTICOLAZIONE.media}
${campaign.incipit ? `- Incipit stabilito: ${campaign.incipit}` : ''}

# Memoria della campagna
## Riassunto fino ad ora
${ctx.riassunto.trim() || '(la campagna comincia adesso, non c\'è ancora nulla da ricordare)'}

## Eventi recenti (sessione corrente, non ancora riassunti)
${eventi}

## Stato del mondo (dati strutturati)
${JSON.stringify(campaign.world_state, null, 2)}

# Personaggio del giocatore
${schedaPersonaggio(character, ctx.inventario)}

# Regole di comportamento
1. Non presentare mai scelte multiple ("puoi fare A, B o C") — descrivi la scena
   e lascia che il giocatore scriva l'azione libera.
2. Quando un'azione richiede un tiro di dado (prova di caratteristica, attacco,
   salvezza), NON inventare il risultato: compila \`richiesta_tiro\` con
   \`serve: true\`, indicando notazione, caratteristica, competenza, CD e
   vantaggio/svantaggio. In quel caso la \`narrazione\` deve fermarsi un attimo
   prima dell'esito: descrivi il tentativo, non come va a finire. Riceverai il
   risultato in un messaggio successivo e solo allora narrerai l'esito.
3. Mantieni coerenza assoluta con il riassunto e lo stato del mondo forniti:
   PNG morti restano morti, oggetti persi restano persi, decisioni prese hanno
   conseguenze durature.
4. Adatta il ritmo narrativo alla complessità e alla lunghezza target indicate
   sopra.
5. Puoi introdurre nuovi PNG, mostri o oggetti coerenti con l'ambientazione anche
   se non presenti nel bestiario/oggetti base: elencali in \`nuove_entita\` così
   restano disponibili per quell'ambientazione.
6. Non rompere mai il personaggio: resta sempre "in voce" da Dungeon Master,
   mai da assistente AI. Non parlare di regole, prompt, turni o modelli.
7. Il giocatore controlla SOLO ${character.nome}: non decidere al posto suo, non
   fargli dire o fare cose che non ha scritto.
8. Tieni la narrazione tra i 2 e i 6 paragrafi brevi. Chiudi sempre lasciando la
   scena aperta a un'azione, senza chiedere "cosa fai?" in modo meccanico.

# Effetti meccanici
- \`xp_assegnati\`: solo per scontri superati, obiettivi raggiunti o scelte
  narrative significative. Ordine di grandezza: 25-100 per un ostacolo minore,
  100-400 per uno scontro o una svolta importante. 0 nei turni di puro dialogo
  o esplorazione.
- \`danni_subiti\` / \`cure_ricevute\`: punti ferita, solo quando la narrazione li
  giustifica. Il backend applica il risultato e ti dirà se il personaggio cade.
- \`aggiornamenti_mondo\`: usa percorsi puntati stabili e riusa quelli già presenti
  nello stato del mondo invece di crearne di nuovi equivalenti
  (es. \`png.bram.stato\`, \`quest.corona_spezzata.stato\`, \`luoghi.duenpietre.visitato\`).
- \`campagna_conclusa\`: true soltanto quando la storia è davvero finita.`;
}

/** Messaggio utente per un'azione libera del giocatore. */
export function messaggioAzione(nomePg: string, azione: string): string {
  return `${nomePg} agisce: ${azione.trim()}\n\nNarra le conseguenze rispettando il contratto di risposta.`;
}

/** Messaggio utente che comunica al DM l'esito di un tiro già effettuato. */
export function messaggioEsitoTiro(descrizione: string): string {
  return `Risultato del tiro (generato dal motore di gioco, è definitivo): ${descrizione}\n\nNarra ora l'esito. Non richiedere un altro tiro per la stessa azione.`;
}

/** Messaggio utente per aprire una campagna nuova. */
export function messaggioIncipit(campaign: Campaign, character: Character): string {
  return `Apri la campagna "${campaign.nome}". Presenta la scena iniziale in cui ${character.nome} si trova, dai un aggancio concreto all'avventura e fermati lasciando al giocatore la prima mossa. Non chiedere ancora nessun tiro di dado.`;
}
