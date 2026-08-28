/**
 * Stato del mondo: JSON annidato aggiornato dal DM tramite percorsi puntati.
 *
 * L'AI propone `{percorso: "png.bram.stato", valore: "ostile"}`; qui si applica
 * la modifica in modo controllato, senza mai lasciare che una stringa arbitraria
 * scriva dove vuole nell'oggetto.
 */

import type { WorldState } from '../db/schema';
import type { AggiornamentoMondo } from '../prompts/contract';

/** Segmenti vietati: eviterebbero il prototype pollution su oggetti semplici. */
const SEGMENTI_VIETATI = new Set(['__proto__', 'constructor', 'prototype']);

const RE_SEGMENTO = /^[a-z0-9_àèéìòù-]{1,48}$/i;
const MAX_PROFONDITA = 5;
const MAX_CHIAVI_TOTALI = 400;

export function percorsoValido(percorso: string): boolean {
  const segmenti = percorso.split('.');
  if (segmenti.length === 0 || segmenti.length > MAX_PROFONDITA) return false;
  return segmenti.every((s) => RE_SEGMENTO.test(s) && !SEGMENTI_VIETATI.has(s.toLowerCase()));
}

function contaChiavi(v: unknown, profondita = 0): number {
  if (profondita > MAX_PROFONDITA || v === null || typeof v !== 'object') return 1;
  return Object.values(v as Record<string, unknown>).reduce<number>(
    (acc, x) => acc + contaChiavi(x, profondita + 1),
    1,
  );
}

export interface EsitoAggiornamento {
  world: WorldState;
  applicati: AggiornamentoMondo[];
  scartati: Array<AggiornamentoMondo & { motivo: string }>;
}

/** Applica gli aggiornamenti su una copia; l'originale non viene toccato. */
export function applicaAggiornamenti(
  world: WorldState,
  aggiornamenti: AggiornamentoMondo[],
): EsitoAggiornamento {
  const copia: WorldState = structuredClone(world);
  const applicati: AggiornamentoMondo[] = [];
  const scartati: Array<AggiornamentoMondo & { motivo: string }> = [];

  for (const agg of aggiornamenti) {
    if (!percorsoValido(agg.percorso)) {
      scartati.push({ ...agg, motivo: 'percorso non valido' });
      continue;
    }
    if (agg.valore.length > 500) {
      scartati.push({ ...agg, motivo: 'valore troppo lungo' });
      continue;
    }
    if (contaChiavi(copia) > MAX_CHIAVI_TOTALI) {
      scartati.push({ ...agg, motivo: 'stato del mondo troppo grande' });
      continue;
    }

    const segmenti = agg.percorso.split('.');
    const foglia = segmenti.pop()!;
    let nodo: Record<string, unknown> = copia;
    let ok = true;

    for (const seg of segmenti) {
      const attuale = nodo[seg];
      if (attuale === undefined || attuale === null) {
        nodo[seg] = {};
      } else if (typeof attuale !== 'object' || Array.isArray(attuale)) {
        // Il percorso attraversa un valore scalare già esistente: lo promuoviamo
        // a oggetto conservando il vecchio valore sotto "_valore".
        nodo[seg] = { _valore: attuale };
      }
      const prossimo = nodo[seg];
      if (typeof prossimo !== 'object' || prossimo === null) {
        ok = false;
        break;
      }
      nodo = prossimo as Record<string, unknown>;
    }

    if (!ok) {
      scartati.push({ ...agg, motivo: 'percorso non attraversabile' });
      continue;
    }

    nodo[foglia] = agg.valore;
    applicati.push(agg);
  }

  return { world: copia, applicati, scartati };
}
