/**
 * Memoria narrativa della campagna.
 *
 * Strategia (economica in chiamate AI):
 *  - fine sessione  -> UNA chiamata che riassume solo la sessione appena chiusa
 *                      e accoda il paragrafo (delta);
 *  - ogni N sessioni o oltre soglia di lunghezza -> UNA chiamata che rilegge
 *    consolidato + delta e li riscrive in un testo unico, poi i delta inglobati
 *    vengono eliminati.
 */

import type { ProviderAi } from '../ai/provider';
import type { Campaign, CampaignSummary, Character, SessionEvent } from '../db/schema';
import * as repo from '../db/repos';
import type { Config } from '../env';
import {
  SISTEMA_CONSOLIDAMENTO,
  SISTEMA_DELTA,
  SISTEMA_ROMANZO,
  promptConsolidamento,
  promptDelta,
  promptRomanzo,
} from '../prompts/summary';

/** Il testo di memoria da iniettare nel prompt del DM: consolidato + delta. */
export function componiRiassunto(riassunti: CampaignSummary[]): string {
  const consolidato = [...riassunti].reverse().find((r) => r.tipo === 'consolidato');
  const delta = riassunti.filter(
    (r) =>
      r.tipo === 'delta' &&
      (!consolidato || r.versione_timestamp >= consolidato.versione_timestamp) &&
      r.id !== consolidato?.id,
  );
  return [consolidato?.contenuto_md ?? '', ...delta.map((d) => d.contenuto_md)]
    .filter((t) => t.trim() !== '')
    .join('\n\n');
}

export function serveConsolidamento(riassunti: CampaignSummary[], config: Config): boolean {
  const consolidato = [...riassunti].reverse().find((r) => r.tipo === 'consolidato');
  const delta = riassunti.filter(
    (r) => r.tipo === 'delta' && (!consolidato || r.versione_timestamp >= consolidato.versione_timestamp),
  );
  if (delta.length === 0) return false;
  const caratteri = delta.reduce((acc, d) => acc + d.contenuto_md.length, 0);
  return delta.length >= config.consolidaOgniNSessioni || caratteri >= config.consolidaSogliaCaratteri;
}

export interface EsitoFineSessione {
  delta: string;
  consolidato: string | null;
}

/** Chiude la memoria di una sessione: genera il delta e, se serve, consolida. */
export async function chiudiMemoriaSessione(
  db: D1Database,
  ai: ProviderAi,
  config: Config,
  campaign: Campaign,
  character: Character,
  numeroSessione: number,
  eventi: SessionEvent[],
): Promise<EsitoFineSessione> {
  const rispostaDelta = await ai.chiamaAI({
    sistema: SISTEMA_DELTA,
    messaggi: [{ ruolo: 'utente', testo: promptDelta(campaign, character, numeroSessione, eventi) }],
    temperatura: 0.4,
    maxToken: 600,
  });
  const delta = rispostaDelta.testo.trim();

  const precedenti = await repo.riassuntiCampagna(db, campaign.id);
  const contatore =
    precedenti.filter((r) => r.tipo === 'delta').length -
    (precedenti.findLast((r) => r.tipo === 'consolidato')?.aggiornato_alla_sessione ?? 0);

  await repo.salvaRiassunto(db, campaign.id, 'delta', delta, numeroSessione, Math.max(0, contatore) + 1);

  const aggiornati = await repo.riassuntiCampagna(db, campaign.id);
  if (!serveConsolidamento(aggiornati, config)) {
    return { delta, consolidato: null };
  }

  const consolidatoPrec = [...aggiornati].reverse().find((r) => r.tipo === 'consolidato');
  const daInglobare = aggiornati.filter(
    (r) =>
      r.tipo === 'delta' &&
      (!consolidatoPrec || r.versione_timestamp >= consolidatoPrec.versione_timestamp),
  );

  const rispostaCons = await ai.chiamaAI({
    sistema: SISTEMA_CONSOLIDAMENTO,
    messaggi: [
      {
        ruolo: 'utente',
        testo: promptConsolidamento(
          campaign,
          consolidatoPrec?.contenuto_md ?? '',
          daInglobare.map((d) => d.contenuto_md),
        ),
      },
    ],
    temperatura: 0.3,
    maxToken: 1600,
  });

  const consolidato = rispostaCons.testo.trim();
  await repo.salvaRiassunto(db, campaign.id, 'consolidato', consolidato, numeroSessione, 0);
  await repo.eliminaRiassunti(db, [
    ...daInglobare.map((d) => d.id),
    ...(consolidatoPrec ? [consolidatoPrec.id] : []),
  ]);

  return { delta, consolidato };
}

/** Il riassunto finale raddoppia come racconto da consegnare al giocatore. */
export async function generaRomanzo(
  db: D1Database,
  ai: ProviderAi,
  campaign: Campaign,
  character: Character,
): Promise<string> {
  const cronaca = componiRiassunto(await repo.riassuntiCampagna(db, campaign.id));
  const risposta = await ai.chiamaAI({
    sistema: SISTEMA_ROMANZO,
    messaggi: [{ ruolo: 'utente', testo: promptRomanzo(campaign, character, cronaca) }],
    temperatura: 0.8,
    maxToken: 3000,
  });
  return risposta.testo.trim();
}
