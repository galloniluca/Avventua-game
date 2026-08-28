/** Campagne, turni di gioco, tiri di dado, sessioni e memoria narrativa. */

import { creaProvider } from '../ai';
import * as repo from '../db/repos';
import type { Complessita, LunghezzaTarget } from '../db/schema';
import { chiudiMemoriaSessione, componiRiassunto, generaRomanzo } from '../domain/memory';
import {
  avviaCampagna,
  eseguiAzione,
  eseguiTiro,
  type Dipendenze,
  type ParametriTiro,
} from '../domain/turn';
import { leggiConfig } from '../env';
import {
  ErroreHttp,
  campoEnum,
  campoStringa,
  json,
  leggiBody,
  nonTrovato,
  richiestaNonValida,
  utenteDaRichiesta,
} from '../http';
import type { Contesto } from '../router';
import { tira, type Vantaggio } from '../rules/dice';
import { caricaProprio } from './characters';

const LUNGHEZZE: readonly LunghezzaTarget[] = ['breve', 'media', 'lunga'];
const COMPLESSITA: readonly Complessita[] = ['semplice', 'media', 'articolata'];
const VANTAGGI: readonly Vantaggio[] = ['nessuno', 'vantaggio', 'svantaggio'];

function dipendenze(ctx: Contesto): Dipendenze {
  return { db: ctx.env.DB, ai: creaProvider(ctx.env), config: leggiConfig(ctx.env) };
}

/** Verifica che la campagna esista e che appartenga a un PG dell'utente. */
async function caricaCampagnaPropria(ctx: Contesto, campaignId: string) {
  const utenteId = utenteDaRichiesta(ctx.req);
  const campagna = await repo.getCampaign(ctx.env.DB, campaignId);
  if (!campagna) throw nonTrovato('Campagna');

  const iscritti = await repo.partecipanti(ctx.env.DB, campaignId);
  const mio = iscritti.find((c) => c.utente_id === utenteId);
  if (!mio) throw new ErroreHttp(403, 'Campagna di un altro utente');

  return { campagna, personaggio: mio };
}

export async function listaCampagne(ctx: Contesto): Promise<Response> {
  const utenteId = utenteDaRichiesta(ctx.req);
  return json({ campagne: await repo.listaCampaignsPerUtente(ctx.env.DB, utenteId) });
}

export async function creaCampagna(ctx: Contesto): Promise<Response> {
  const corpo = await leggiBody(ctx.req);
  const characterId = campoStringa(corpo, 'character_id', { obbligatorio: true, max: 64 });
  const pg = await caricaProprio(ctx, characterId);

  const campagna = await repo.creaCampaign(
    ctx.env.DB,
    {
      setting_id: pg.setting_id,
      nome: campoStringa(corpo, 'nome', { obbligatorio: true, max: 100 }),
      lunghezza_target: campoEnum(corpo, 'lunghezza_target', LUNGHEZZE, 'media'),
      complessita: campoEnum(corpo, 'complessita', COMPLESSITA, 'media'),
      incipit: campoStringa(corpo, 'incipit', { max: 1000 }),
    },
    pg.id,
  );

  return json({ campagna, personaggio: pg }, 201);
}

export async function getCampagna(ctx: Contesto): Promise<Response> {
  const { campagna, personaggio } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const sessione = await repo.sessioneAperta(ctx.env.DB, campagna.id);
  const eventi = sessione ? await repo.eventiSessione(ctx.env.DB, sessione.id) : [];
  const riassunto = componiRiassunto(await repo.riassuntiCampagna(ctx.env.DB, campagna.id));
  return json({ campagna, personaggio, sessione, eventi, riassunto });
}

export async function avvia(ctx: Contesto): Promise<Response> {
  const { campagna, personaggio } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const turno = await avviaCampagna(dipendenze(ctx), campagna.id, personaggio.id);
  return json({ turno }, 201);
}

export async function azione(ctx: Contesto): Promise<Response> {
  const { campagna, personaggio } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const corpo = await leggiBody(ctx.req);
  const testo = campoStringa(corpo, 'azione', { obbligatorio: true, max: 2000 });
  const turno = await eseguiAzione(dipendenze(ctx), campagna.id, personaggio.id, testo.trim());
  return json({ turno });
}

export async function tiroDado(ctx: Contesto): Promise<Response> {
  const { campagna, personaggio } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const corpo = await leggiBody(ctx.req);

  const cdGrezza = corpo.cd;
  const parametri: ParametriTiro = {
    notazione: campoStringa(corpo, 'notazione', { obbligatorio: true, max: 20 }),
    caratteristica: campoStringa(corpo, 'caratteristica', { max: 20, default: 'nessuna' }),
    competenza: corpo.competenza === true,
    cd:
      typeof cdGrezza === 'number' && Number.isFinite(cdGrezza) && cdGrezza > 0
        ? Math.round(cdGrezza)
        : null,
    vantaggio: campoEnum(corpo, 'vantaggio', VANTAGGI, 'nessuno'),
    motivo: campoStringa(corpo, 'motivo', { max: 300 }),
  };

  const turno = await eseguiTiro(dipendenze(ctx), campagna.id, personaggio.id, parametri);
  return json({ turno });
}

/** Tiro libero fuori dal loop narrativo (il bottone "tira" della UI). */
export async function tiroLibero(ctx: Contesto): Promise<Response> {
  const corpo = await leggiBody(ctx.req);
  const notazione = campoStringa(corpo, 'notazione', { obbligatorio: true, max: 20 });
  try {
    return json({ tiro: tira(notazione, { vantaggio: campoEnum(corpo, 'vantaggio', VANTAGGI, 'nessuno') }) });
  } catch (err) {
    throw richiestaNonValida((err as Error).message);
  }
}

export async function chiudiSessione(ctx: Contesto): Promise<Response> {
  const { campagna, personaggio } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const sessione = await repo.sessioneAperta(ctx.env.DB, campagna.id);
  if (!sessione) throw new ErroreHttp(409, 'Nessuna sessione aperta');

  const eventi = await repo.eventiSessione(ctx.env.DB, sessione.id);
  if (eventi.length === 0) {
    await repo.chiudiSessione(ctx.env.DB, sessione.id);
    return json({ sessione, memoria: null });
  }

  const deps = dipendenze(ctx);
  const memoria = await chiudiMemoriaSessione(
    ctx.env.DB,
    deps.ai,
    deps.config,
    campagna,
    personaggio,
    sessione.numero,
    eventi,
  );
  await repo.chiudiSessione(ctx.env.DB, sessione.id);

  return json({ sessione, memoria });
}

export async function getSessioni(ctx: Contesto): Promise<Response> {
  const { campagna } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  return json({ sessioni: await repo.listaSessioni(ctx.env.DB, campagna.id) });
}

export async function getEventiSessione(ctx: Contesto): Promise<Response> {
  const { campagna } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const sessioni = await repo.listaSessioni(ctx.env.DB, campagna.id);
  const sessione = sessioni.find((s) => s.id === ctx.params.sessionId);
  if (!sessione) throw nonTrovato('Sessione');
  return json({ sessione, eventi: await repo.eventiSessione(ctx.env.DB, sessione.id) });
}

export async function getRiassunto(ctx: Contesto): Promise<Response> {
  const { campagna } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const riassunti = await repo.riassuntiCampagna(ctx.env.DB, campagna.id);
  return json({ riassunto: componiRiassunto(riassunti), versioni: riassunti });
}

/** Il riassunto finale, riscritto come racconto da tenere. */
export async function getRomanzo(ctx: Contesto): Promise<Response> {
  const { campagna, personaggio } = await caricaCampagnaPropria(ctx, ctx.params.id!);
  const deps = dipendenze(ctx);
  return json({ racconto: await generaRomanzo(ctx.env.DB, deps.ai, campagna, personaggio) });
}
