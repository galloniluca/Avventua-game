/**
 * Prompt della memoria narrativa.
 *
 * Due prompt distinti e volutamente più semplici di quello del DM: qui il
 * modello non deve intrattenere nessuno, deve comprimere senza perdere fatti.
 *
 *  - delta: a fine sessione, riassume SOLO la sessione appena chiusa. Costa una
 *    chiamata a sessione e si accoda al riassunto esistente.
 *  - consolidamento: ogni N sessioni (o oltre soglia di lunghezza) rilegge tutti
 *    i delta accumulati e li riscrive in un testo unico, coerente e compatto.
 */

import type { Campaign, Character, SessionEvent } from '../db/schema';

function trascrizione(eventi: SessionEvent[], nomePg: string): string {
  return eventi
    .map((e) => {
      switch (e.tipo) {
        case 'narrazione':
          return `DM: ${e.contenuto}`;
        case 'azione':
          return `${nomePg}: ${e.contenuto}`;
        case 'tiro':
          return `(tiro) ${e.contenuto}`;
        case 'richiesta_tiro':
          return null; // rumore: l'esito è già nell'evento 'tiro'
        default:
          return `(sistema) ${e.contenuto}`;
      }
    })
    .filter(Boolean)
    .join('\n');
}

export const SISTEMA_DELTA = `Sei l'archivista di una campagna di gioco di ruolo.
Ricevi la trascrizione di una singola sessione e produci il paragrafo di
riassunto che verrà accodato alla cronaca della campagna.

Regole:
- Scrivi in italiano, al passato, in terza persona.
- Da 80 a 200 parole. Prosa continua, niente elenchi puntati, niente titoli.
- Riporta SOLO ciò che è realmente accaduto: luoghi raggiunti, PNG incontrati e
  come sono stati lasciati (vivi, morti, ostili, alleati), oggetti ottenuti o
  persi, promesse fatte, quest aperte o chiuse, svolte irreversibili.
- Non inventare nulla che non sia nella trascrizione, non anticipare il futuro,
  non commentare la qualità della sessione né rivolgerti al giocatore.
- Preferisci i nomi propri ai pronomi: questo testo verrà riletto tra molte
  sessioni, fuori contesto.
- Rispondi con il solo paragrafo, senza preamboli.`;

export function promptDelta(
  campaign: Campaign,
  character: Character,
  numeroSessione: number,
  eventi: SessionEvent[],
): string {
  return `Campagna: "${campaign.nome}" (ambientazione ${campaign.setting_id}).
Protagonista: ${character.nome}, ${character.razza} ${character.classe} di livello ${character.livello}.
Sessione numero ${numeroSessione}.

Trascrizione della sessione:
---
${trascrizione(eventi, character.nome)}
---

Scrivi il paragrafo di riassunto di questa sessione.`;
}

export const SISTEMA_CONSOLIDAMENTO = `Sei l'archivista di una campagna di gioco di ruolo.
Ricevi la cronaca della campagna: un riassunto consolidato (eventualmente vuoto)
seguito da più paragrafi accodati sessione per sessione. Devi riscrivere il tutto
in un unico testo coerente.

Regole:
- Scrivi in italiano, al passato, in terza persona, in Markdown semplice
  (paragrafi; al massimo qualche "## " per le grandi fasi della storia).
- Comprimi: elimina ripetizioni, dettagli irrilevanti e passaggi di raccordo.
  Il testo finale deve essere sensibilmente più corto della somma dei paragrafi.
- Non perdere MAI: PNG e loro stato attuale, luoghi visitati, oggetti importanti
  posseduti o perduti, quest aperte e chiuse, debiti, minacce pendenti,
  decisioni irreversibili e le loro conseguenze.
- Se due paragrafi si contraddicono, vince il più recente; risolvi la
  contraddizione in silenzio, senza segnalarla.
- Non inventare eventi, non aggiungere conclusioni o morali, non anticipare il
  futuro.
- Mantieni un ordine cronologico chiaro. Massimo 700 parole.
- Rispondi con il solo testo del riassunto.`;

export function promptConsolidamento(
  campaign: Campaign,
  consolidatoPrecedente: string,
  delta: string[],
): string {
  return `Campagna: "${campaign.nome}".
Lunghezza target: ${campaign.lunghezza_target}. Complessità: ${campaign.complessita}.

## Riassunto consolidato precedente
${consolidatoPrecedente.trim() || '(nessuno: è il primo consolidamento)'}

## Paragrafi accodati da consolidare
${delta.map((d, i) => `${i + 1}. ${d.trim()}`).join('\n\n') || '(nessuno)'}

Riscrivi il tutto in un unico riassunto consolidato.`;
}

export const SISTEMA_ROMANZO = `Sei un narratore. Ricevi la cronaca completa di
una campagna di gioco di ruolo appena conclusa e la riscrivi come racconto
breve, da consegnare al giocatore come ricordo della sua avventura.

Regole:
- Italiano, passato remoto o imperfetto, terza persona.
- Prosa narrativa vera: scene, dialoghi brevi, atmosfera. Niente elenchi, niente
  linguaggio da regolamento, nessun riferimento a dadi, tiri, punti ferita,
  livelli o al fatto che sia un gioco.
- Resta fedele agli eventi della cronaca: puoi colorire, non contraddire.
- Dai al racconto un titolo su una prima riga come "# Titolo".
- Da 800 a 1500 parole.`;

export function promptRomanzo(campaign: Campaign, character: Character, cronaca: string): string {
  return `Campagna: "${campaign.nome}".
Protagonista: ${character.nome}, ${character.razza} ${character.classe}.

Cronaca completa:
---
${cronaca.trim()}
---

Scrivi il racconto.`;
}
