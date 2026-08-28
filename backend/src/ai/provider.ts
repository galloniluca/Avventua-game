/**
 * Interfaccia unica verso il motore AI.
 *
 * Tutto il resto del backend parla solo di `ProviderAi.chiamaAI`. I modelli
 * free-tier vengono deprecati senza preavviso: cambiare fornitore deve voler
 * dire scrivere un nuovo file in questa cartella e cambiare una variabile
 * d'ambiente, non toccare il gioco.
 */

export type RuoloMessaggio = 'utente' | 'modello';

export interface MessaggioAi {
  ruolo: RuoloMessaggio;
  testo: string;
}

/** Sottoinsieme di JSON Schema che tutti i provider devono saper rispettare. */
export type SchemaJson =
  | { tipo: 'stringa'; enum?: string[]; descrizione?: string }
  | { tipo: 'numero'; descrizione?: string }
  | { tipo: 'booleano'; descrizione?: string }
  | { tipo: 'array'; elementi: SchemaJson; descrizione?: string }
  | {
      tipo: 'oggetto';
      proprieta: Record<string, SchemaJson>;
      obbligatorie?: string[];
      descrizione?: string;
    };

export interface RichiestaAi {
  /** Istruzioni di sistema (il ruolo del DM, le regole di comportamento). */
  sistema: string;
  messaggi: MessaggioAi[];
  temperatura?: number;
  maxToken?: number;
  /** Se presente, la risposta deve essere JSON conforme allo schema. */
  schema?: SchemaJson;
}

export interface RispostaAi {
  testo: string;
  /** Popolato solo quando la richiesta aveva uno schema. */
  json?: unknown;
  provider: string;
  modello: string;
}

export interface ProviderAi {
  readonly nome: string;
  chiamaAI(richiesta: RichiestaAi): Promise<RispostaAi>;
}

export class ErroreAi extends Error {
  constructor(
    message: string,
    readonly stato?: number,
    readonly ritentabile = false,
  ) {
    super(message);
    this.name = 'ErroreAi';
  }
}

/** Estrae il primo oggetto JSON da un testo che potrebbe avere contorno. */
export function estraiJson(testo: string): unknown {
  const pulito = testo
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    return JSON.parse(pulito);
  } catch {
    const inizio = pulito.indexOf('{');
    const fine = pulito.lastIndexOf('}');
    if (inizio >= 0 && fine > inizio) {
      try {
        return JSON.parse(pulito.slice(inizio, fine + 1));
      } catch {
        /* cade sotto */
      }
    }
    throw new ErroreAi('La risposta del modello non è JSON valido');
  }
}
