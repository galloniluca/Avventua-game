/**
 * Motore di turno: l'unico posto in cui azione del giocatore, chiamata al DM-AI
 * e applicazione degli effetti meccanici si incontrano.
 *
 * Invariante: l'AI propone, il backend dispone. Tiri di dado, XP, punti ferita e
 * stato del mondo passano tutti da qui prima di diventare permanenti.
 */

import type { ProviderAi } from '../ai/provider';
import * as repo from '../db/repos';
import type { Character, GameSession, SessionEvent } from '../db/schema';
import { parseJson } from '../db/schema';
import type { Config } from '../env';
import { ErroreHttp, nonTrovato } from '../http';
import {
  messaggioAzione,
  messaggioEsitoTiro,
  messaggioIncipit,
  promptSistemaDm,
  type ContestoDm,
} from '../prompts/dm';
import { SCHEMA_RISPOSTA_DM, normalizzaRispostaDm, type RispostaDm } from '../prompts/contract';
import { assegnaXp, livelloPerXp } from '../rules/progression';
import { ErroreNotazione, tira, type RisultatoTiro, type Rng, type Vantaggio } from '../rules/dice';
import { bonusTiro, type Caratteristica, CARATTERISTICHE } from '../rules/stats';
import { applicaAggiornamenti } from './worldstate';

export interface Dipendenze {
  db: D1Database;
  ai: ProviderAi;
  config: Config;
  /** Iniettabile nei test per rendere i tiri deterministici. */
  rng?: Rng;
}

export interface RisultatoTurno {
  sessione: GameSession;
  eventi: SestoEvento[];
  narrazione: string;
  richiestaTiro: RichiestaTiroPubblica | null;
  personaggio: Character;
  effetti: EffettiApplicati;
  campagnaConclusa: boolean;
  fineSessioneSuggerita: boolean;
}

/** Alias esplicito: gli eventi restituiti al client sono quelli appena scritti. */
type SestoEvento = SessionEvent;

export interface RichiestaTiroPubblica {
  notazione: string;
  caratteristica: string;
  competenza: boolean;
  /** Bonus già calcolato dal backend a partire dalla scheda. */
  modificatore: number;
  cd: number | null;
  vantaggio: Vantaggio;
  motivo: string;
}

export interface EffettiApplicati {
  xpGuadagnati: number;
  saliDiLivello: boolean;
  livello: number;
  danni: number;
  cure: number;
  pf: number;
  pfMax: number;
  svenuto: boolean;
  aggiornamentiMondo: number;
  nuoveEntita: number;
}

async function caricaContesto(
  deps: Dipendenze,
  campaignId: string,
  characterId: string,
): Promise<{ ctx: ContestoDm; sessione: GameSession }> {
  const { db, config } = deps;
  const campaign = await repo.getCampaign(db, campaignId);
  if (!campaign) throw nonTrovato('Campagna');

  const character = await repo.getCharacter(db, characterId);
  if (!character) throw nonTrovato('Personaggio');

  const iscritti = await repo.partecipanti(db, campaignId);
  if (!iscritti.some((c) => c.id === characterId)) {
    throw new ErroreHttp(403, 'Il personaggio non partecipa a questa campagna');
  }

  const setting = await repo.getSetting(db, campaign.setting_id);
  if (!setting) throw nonTrovato('Ambientazione');

  const sessione = (await repo.sessioneAperta(db, campaignId)) ?? (await repo.apriSessione(db, campaignId));

  const [inventario, riassunti, eventiRecenti] = await Promise.all([
    repo.inventario(db, characterId),
    repo.riassuntiCampagna(db, campaignId),
    repo.eventiSessione(db, sessione.id, config.finestraEventiRecenti),
  ]);

  const { componiRiassunto } = await import('./memory');

  return {
    sessione,
    ctx: {
      setting,
      campaign,
      character,
      inventario,
      riassunto: componiRiassunto(riassunti),
      eventiRecenti,
    },
  };
}

async function chiediAlDm(
  deps: Dipendenze,
  ctx: ContestoDm,
  messaggioUtente: string,
): Promise<RispostaDm> {
  const risposta = await deps.ai.chiamaAI({
    sistema: promptSistemaDm(ctx),
    messaggi: [{ ruolo: 'utente', testo: messaggioUtente }],
    temperatura: 0.9,
    maxToken: 2048,
    schema: SCHEMA_RISPOSTA_DM,
  });
  const dm = normalizzaRispostaDm(risposta.json ?? risposta.testo);
  if (!dm.narrazione) {
    throw new ErroreHttp(502, 'Il DM non ha prodotto narrazione');
  }
  return dm;
}

/** Trasforma la richiesta di tiro del DM in una con modificatore già calcolato. */
function preparaRichiestaTiro(dm: RispostaDm, character: Character): RichiestaTiroPubblica | null {
  const t = dm.richiesta_tiro;
  if (!t) return null;

  const caratteristica = (CARATTERISTICHE as readonly string[]).includes(t.caratteristica)
    ? (t.caratteristica as Caratteristica)
    : null;

  return {
    notazione: t.notazione,
    caratteristica: t.caratteristica,
    competenza: t.competenza,
    modificatore: caratteristica
      ? bonusTiro(character.statistiche, caratteristica, character.livello, t.competenza)
      : 0,
    cd: t.cd > 0 ? t.cd : null,
    vantaggio: t.vantaggio,
    motivo: t.motivo,
  };
}

/** Applica al DB tutto ciò che il DM ha proposto, entro i limiti delle regole. */
async function applicaEffetti(
  deps: Dipendenze,
  ctx: ContestoDm,
  dm: RispostaDm,
): Promise<{ effetti: EffettiApplicati; personaggio: Character }> {
  const { db } = deps;
  const { campaign, character, setting } = ctx;

  // 1. Stato del mondo.
  const esitoMondo = applicaAggiornamenti(campaign.world_state, dm.aggiornamenti_mondo);
  if (esitoMondo.applicati.length > 0) {
    await repo.salvaWorldState(db, campaign.id, esitoMondo.world);
    campaign.world_state = esitoMondo.world;
  }
  if (esitoMondo.scartati.length > 0) {
    console.warn('Aggiornamenti mondo scartati:', esitoMondo.scartati);
  }

  // 2. Nuove entità introdotte dall'AI: diventano contenuto dell'ambientazione.
  for (const e of dm.nuove_entita) {
    await repo.salvaEntitaGenerata(
      db,
      setting.id,
      e.categoria,
      e.nome,
      e.descrizione,
      parseJson<Record<string, unknown>>(e.dati, {}),
    );
  }

  // 3. Punti ferita.
  const pfMax = character.stato.pfMax || 1;
  const pf = Math.max(
    0,
    Math.min(pfMax, character.stato.pf - dm.danni_subiti + dm.cure_ricevute),
  );
  const condizioni = new Set(character.stato.condizioni);
  if (pf === 0) condizioni.add('privo di sensi');
  else condizioni.delete('privo di sensi');

  // 4. XP e livello.
  const esitoXp = assegnaXp(character.xp, dm.xp_assegnati);
  const nuovoStato = { pf, pfMax, condizioni: [...condizioni] };

  await repo.aggiornaProgressione(db, character.id, esitoXp.xpDopo, esitoXp.livelloDopo, nuovoStato);

  if (dm.campagna_conclusa) {
    await repo.segnaCampagnaConclusa(db, campaign.id);
  }

  const personaggio: Character = {
    ...character,
    xp: esitoXp.xpDopo,
    livello: esitoXp.livelloDopo,
    stato: nuovoStato,
  };

  return {
    personaggio,
    effetti: {
      xpGuadagnati: esitoXp.xpDopo - esitoXp.xpPrima,
      saliDiLivello: esitoXp.saliDiLivello,
      livello: esitoXp.livelloDopo,
      danni: dm.danni_subiti,
      cure: dm.cure_ricevute,
      pf,
      pfMax,
      svenuto: pf === 0,
      aggiornamentiMondo: esitoMondo.applicati.length,
      nuoveEntita: dm.nuove_entita.length,
    },
  };
}

function descriviRichiestaTiro(t: RichiestaTiroPubblica): string {
  const segno = t.modificatore >= 0 ? '+' : '';
  const parti = [
    `${t.notazione}${t.modificatore !== 0 ? `${segno}${t.modificatore}` : ''}`,
    t.caratteristica !== 'nessuna' ? `prova di ${t.caratteristica}` : null,
    t.cd !== null ? `CD ${t.cd}` : null,
    t.vantaggio !== 'nessuno' ? t.vantaggio : null,
    t.motivo || null,
  ].filter(Boolean);
  return parti.join(' — ');
}

export function descriviRisultato(r: RisultatoTiro): string {
  const dettaglio = `[${r.tirati.join(', ')}]${r.scartati.length ? ` (scartati ${r.scartati.join(', ')})` : ''}`;
  const mod = r.modificatore !== 0 ? ` ${r.modificatore > 0 ? '+' : '-'} ${Math.abs(r.modificatore)}` : '';
  const esito =
    r.successo === null ? '' : r.successo ? ` — SUCCESSO (CD ${r.cd})` : ` — FALLIMENTO (CD ${r.cd})`;
  const critico = r.critico ? ' — 20 naturale!' : r.fallimentoCritico ? ' — 1 naturale!' : '';
  return `${r.notazione} ${dettaglio}${mod} = ${r.totale}${esito}${critico}`;
}

// --- Casi d'uso -----------------------------------------------------------------

/** Primo turno: il DM apre la campagna e presenta la scena iniziale. */
export async function avviaCampagna(
  deps: Dipendenze,
  campaignId: string,
  characterId: string,
): Promise<RisultatoTurno> {
  const { ctx, sessione } = await caricaContesto(deps, campaignId, characterId);

  const eventiEsistenti = await repo.eventiSessione(deps.db, sessione.id);
  if (eventiEsistenti.length > 0) {
    throw new ErroreHttp(409, 'La campagna è già stata avviata');
  }

  const dm = await chiediAlDm(deps, ctx, messaggioIncipit(ctx.campaign, ctx.character));
  return await concludiTurno(deps, ctx, sessione, dm, []);
}

/** Turno normale: il giocatore scrive un'azione libera. */
export async function eseguiAzione(
  deps: Dipendenze,
  campaignId: string,
  characterId: string,
  azione: string,
): Promise<RisultatoTurno> {
  const { ctx, sessione } = await caricaContesto(deps, campaignId, characterId);

  if (ctx.campaign.stato === 'conclusa') {
    throw new ErroreHttp(409, 'La campagna è conclusa');
  }

  const [eventoAzione] = await repo.aggiungiEventi(deps.db, sessione.id, [
    { tipo: 'azione', attore: characterId, contenuto: azione },
  ]);

  // L'azione appena scritta deve essere visibile al DM in questo stesso turno.
  ctx.eventiRecenti = [...ctx.eventiRecenti, ...(eventoAzione ? [eventoAzione] : [])];

  const dm = await chiediAlDm(deps, ctx, messaggioAzione(ctx.character.nome, azione));
  return await concludiTurno(deps, ctx, sessione, dm, eventoAzione ? [eventoAzione] : []);
}

export interface ParametriTiro {
  notazione: string;
  caratteristica: string;
  competenza: boolean;
  cd: number | null;
  vantaggio: Vantaggio;
  motivo: string;
}

/**
 * Tiro di dado: il numero nasce qui, poi il DM ne narra l'esito.
 * Il client passa i parametri che ha ricevuto dalla richiesta di tiro, ma il
 * modificatore viene ricalcolato dalla scheda — non ci si fida del client.
 */
export async function eseguiTiro(
  deps: Dipendenze,
  campaignId: string,
  characterId: string,
  parametri: ParametriTiro,
): Promise<RisultatoTurno & { tiro: RisultatoTiro }> {
  const { ctx, sessione } = await caricaContesto(deps, campaignId, characterId);

  if (ctx.campaign.stato === 'conclusa') {
    throw new ErroreHttp(409, 'La campagna è conclusa');
  }

  const caratteristica = (CARATTERISTICHE as readonly string[]).includes(parametri.caratteristica)
    ? (parametri.caratteristica as Caratteristica)
    : null;
  const modificatore = caratteristica
    ? bonusTiro(ctx.character.statistiche, caratteristica, ctx.character.livello, parametri.competenza)
    : 0;

  const base = parametri.notazione.trim();
  const notazioneCompleta =
    modificatore === 0 ? base : `${base}${modificatore > 0 ? '+' : '-'}${Math.abs(modificatore)}`;

  let risultato: RisultatoTiro;
  try {
    risultato = tira(notazioneCompleta, {
      vantaggio: parametri.vantaggio,
      cd: parametri.cd,
      rng: deps.rng,
    });
  } catch (err) {
    if (err instanceof ErroreNotazione) throw new ErroreHttp(400, err.message);
    throw err;
  }

  const descrizione = `${parametri.motivo || 'prova'} — ${descriviRisultato(risultato)}`;

  const [eventoTiro] = await repo.aggiungiEventi(deps.db, sessione.id, [
    {
      tipo: 'tiro',
      attore: characterId,
      contenuto: descrizione,
      dati: { ...risultato, caratteristica: parametri.caratteristica, competenza: parametri.competenza },
    },
  ]);

  ctx.eventiRecenti = [...ctx.eventiRecenti, ...(eventoTiro ? [eventoTiro] : [])];

  const dm = await chiediAlDm(deps, ctx, messaggioEsitoTiro(descrizione));
  const turno = await concludiTurno(deps, ctx, sessione, dm, eventoTiro ? [eventoTiro] : []);
  return { ...turno, tiro: risultato };
}

/** Applica gli effetti, scrive gli eventi del DM e compone la risposta. */
async function concludiTurno(
  deps: Dipendenze,
  ctx: ContestoDm,
  sessione: GameSession,
  dm: RispostaDm,
  eventiPrecedenti: SessionEvent[],
): Promise<RisultatoTurno> {
  const { effetti, personaggio } = await applicaEffetti(deps, ctx, dm);
  const richiestaTiro = preparaRichiestaTiro(dm, personaggio);

  const daScrivere: repo.NuovoEvento[] = [
    { tipo: 'narrazione', attore: 'dm', contenuto: dm.narrazione, dati: { effetti } },
  ];
  if (richiestaTiro) {
    daScrivere.push({
      tipo: 'richiesta_tiro',
      attore: 'dm',
      contenuto: descriviRichiestaTiro(richiestaTiro),
      dati: richiestaTiro as unknown as Record<string, unknown>,
    });
  }

  const scritti = await repo.aggiungiEventi(deps.db, sessione.id, daScrivere);

  return {
    sessione,
    eventi: [...eventiPrecedenti, ...scritti],
    narrazione: dm.narrazione,
    richiestaTiro,
    personaggio,
    effetti,
    campagnaConclusa: dm.campagna_conclusa,
    fineSessioneSuggerita: dm.fine_sessione_suggerita,
  };
}

export { livelloPerXp };
