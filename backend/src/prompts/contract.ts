/**
 * Contratto di risposta del DM-AI.
 *
 * Il modello non risponde in prosa libera ma con un JSON conforme a questo
 * schema: la narrazione è solo uno dei campi. Gli altri campi sono *proposte*
 * (tiro richiesto, XP, danni, nuove entità) che il backend valida e applica
 * secondo le regole — l'AI non ha mai l'ultima parola sui numeri.
 */
import type { SchemaJson } from '../ai/provider';
import { CARATTERISTICHE } from '../rules/stats';

export const SCHEMA_RISPOSTA_DM: SchemaJson = {
  tipo: 'oggetto',
  proprieta: {
    narrazione: {
      tipo: 'stringa',
      descrizione:
        'La narrazione da mostrare al giocatore. Prosa in seconda persona, senza elenchi di opzioni.',
    },
    richiesta_tiro: {
      tipo: 'oggetto',
      proprieta: {
        serve: { tipo: 'booleano', descrizione: 'true se serve un tiro di dado prima di proseguire' },
        notazione: { tipo: 'stringa', descrizione: 'Notazione del dado, es. "1d20" o "2d6"' },
        caratteristica: { tipo: 'stringa', enum: [...CARATTERISTICHE, 'nessuna'] },
        competenza: { tipo: 'booleano' },
        cd: { tipo: 'numero', descrizione: 'Classe difficoltà da battere, 0 se non applicabile' },
        vantaggio: { tipo: 'stringa', enum: ['nessuno', 'vantaggio', 'svantaggio'] },
        motivo: { tipo: 'stringa', descrizione: 'Cosa sta tentando il personaggio, in una riga' },
      },
      obbligatorie: ['serve', 'notazione', 'caratteristica', 'competenza', 'cd', 'vantaggio', 'motivo'],
    },
    aggiornamenti_mondo: {
      tipo: 'array',
      descrizione: 'Modifiche allo stato del mondo da rendere permanenti.',
      elementi: {
        tipo: 'oggetto',
        proprieta: {
          percorso: {
            tipo: 'stringa',
            descrizione: 'Percorso puntato, es. "png.bram.stato" o "quest.corona.stato"',
          },
          valore: { tipo: 'stringa', descrizione: 'Nuovo valore testuale' },
        },
        obbligatorie: ['percorso', 'valore'],
      },
    },
    nuove_entita: {
      tipo: 'array',
      descrizione: 'PNG, mostri o oggetti introdotti ora e da salvare nell\'ambientazione.',
      elementi: {
        tipo: 'oggetto',
        proprieta: {
          categoria: { tipo: 'stringa', enum: ['png', 'mostro', 'oggetto'] },
          nome: { tipo: 'stringa' },
          descrizione: { tipo: 'stringa' },
          dati: {
            tipo: 'stringa',
            descrizione: 'JSON serializzato con statistiche/effetti; "{}" se non servono',
          },
        },
        obbligatorie: ['categoria', 'nome', 'descrizione', 'dati'],
      },
    },
    xp_assegnati: { tipo: 'numero', descrizione: 'XP guadagnati con questo turno, 0 se nessuno' },
    danni_subiti: { tipo: 'numero', descrizione: 'Punti ferita persi dal personaggio, 0 se nessuno' },
    cure_ricevute: { tipo: 'numero', descrizione: 'Punti ferita recuperati, 0 se nessuno' },
    fine_sessione_suggerita: {
      tipo: 'booleano',
      descrizione: 'true se la scena è a un punto di sosta naturale',
    },
    campagna_conclusa: { tipo: 'booleano', descrizione: 'true solo alla vera fine della storia' },
  },
  obbligatorie: [
    'narrazione',
    'richiesta_tiro',
    'aggiornamenti_mondo',
    'nuove_entita',
    'xp_assegnati',
    'danni_subiti',
    'cure_ricevute',
    'fine_sessione_suggerita',
    'campagna_conclusa',
  ],
};

export interface RichiestaTiroDm {
  serve: boolean;
  notazione: string;
  caratteristica: string;
  competenza: boolean;
  cd: number;
  vantaggio: 'nessuno' | 'vantaggio' | 'svantaggio';
  motivo: string;
}

export interface AggiornamentoMondo {
  percorso: string;
  valore: string;
}

export interface NuovaEntita {
  categoria: 'png' | 'mostro' | 'oggetto';
  nome: string;
  descrizione: string;
  dati: string;
}

export interface RispostaDm {
  narrazione: string;
  richiesta_tiro: RichiestaTiroDm | null;
  aggiornamenti_mondo: AggiornamentoMondo[];
  nuove_entita: NuovaEntita[];
  xp_assegnati: number;
  danni_subiti: number;
  cure_ricevute: number;
  fine_sessione_suggerita: boolean;
  campagna_conclusa: boolean;
}

function num(v: unknown, def = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : def;
}

function str(v: unknown, def = ''): string {
  return typeof v === 'string' ? v : def;
}

function bool(v: unknown, def = false): boolean {
  return typeof v === 'boolean' ? v : def;
}

/**
 * Normalizza la risposta grezza del modello. Non si fida di niente: campi
 * mancanti, tipi sbagliati e valori fuori dominio vengono ricondotti a
 * qualcosa di sicuro invece di far fallire il turno.
 */
export function normalizzaRispostaDm(grezza: unknown): RispostaDm {
  const r = (grezza && typeof grezza === 'object' ? grezza : {}) as Record<string, unknown>;

  const tiroGrezzo = (r.richiesta_tiro ?? {}) as Record<string, unknown>;
  const serve = bool(tiroGrezzo.serve) && str(tiroGrezzo.notazione).trim() !== '';
  const vantaggioGrezzo = str(tiroGrezzo.vantaggio, 'nessuno');
  const vantaggio: RichiestaTiroDm['vantaggio'] =
    vantaggioGrezzo === 'vantaggio' || vantaggioGrezzo === 'svantaggio' ? vantaggioGrezzo : 'nessuno';

  const caratteristica = str(tiroGrezzo.caratteristica, 'nessuna').toLowerCase();

  return {
    narrazione: str(r.narrazione).trim(),
    richiesta_tiro: serve
      ? {
          serve: true,
          notazione: str(tiroGrezzo.notazione, '1d20').trim(),
          caratteristica: (CARATTERISTICHE as readonly string[]).includes(caratteristica)
            ? caratteristica
            : 'nessuna',
          competenza: bool(tiroGrezzo.competenza),
          cd: Math.max(0, Math.min(40, num(tiroGrezzo.cd))),
          vantaggio,
          motivo: str(tiroGrezzo.motivo).trim(),
        }
      : null,
    aggiornamenti_mondo: Array.isArray(r.aggiornamenti_mondo)
      ? r.aggiornamenti_mondo
          .map((a) => {
            const o = (a ?? {}) as Record<string, unknown>;
            return { percorso: str(o.percorso).trim(), valore: str(o.valore).trim() };
          })
          .filter((a) => a.percorso !== '')
          .slice(0, 20)
      : [],
    nuove_entita: Array.isArray(r.nuove_entita)
      ? r.nuove_entita
          .map((e) => {
            const o = (e ?? {}) as Record<string, unknown>;
            const categoria = str(o.categoria).toLowerCase();
            return {
              categoria: (categoria === 'png' || categoria === 'mostro' || categoria === 'oggetto'
                ? categoria
                : 'png') as NuovaEntita['categoria'],
              nome: str(o.nome).trim(),
              descrizione: str(o.descrizione).trim(),
              dati: str(o.dati, '{}'),
            };
          })
          .filter((e) => e.nome !== '')
          .slice(0, 10)
      : [],
    xp_assegnati: Math.max(0, num(r.xp_assegnati)),
    danni_subiti: Math.max(0, num(r.danni_subiti)),
    cure_ricevute: Math.max(0, num(r.cure_ricevute)),
    fine_sessione_suggerita: bool(r.fine_sessione_suggerita),
    campagna_conclusa: bool(r.campagna_conclusa),
  };
}
