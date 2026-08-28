/** CRUD personaggi e inventario. */

import * as repo from '../db/repos';
import {
  ErroreHttp,
  campoStringa,
  json,
  leggiBody,
  nonTrovato,
  richiestaNonValida,
  utenteDaRichiesta,
} from '../http';
import type { Contesto } from '../router';
import { progressoLivello, xpProssimoLivello } from '../rules/progression';
import {
  CARATTERISTICHE,
  dadoVitaPerClasse,
  normalizzaStatistiche,
  pfMassimi,
  statisticheDefault,
} from '../rules/stats';
import { tira } from '../rules/dice';
import type { Character } from '../db/schema';

/** I personaggi sono isolati per utente: nessuna storia è mai condivisa. */
async function caricaProprio(ctx: Contesto, characterId: string): Promise<Character> {
  const utenteId = utenteDaRichiesta(ctx.req);
  const pg = await repo.getCharacter(ctx.env.DB, characterId);
  if (!pg) throw nonTrovato('Personaggio');
  if (pg.utente_id !== utenteId) throw new ErroreHttp(403, 'Personaggio di un altro utente');
  return pg;
}

function conProgressione(pg: Character) {
  return {
    ...pg,
    xp_prossimo_livello: xpProssimoLivello(pg.xp),
    progresso_livello: progressoLivello(pg.xp),
  };
}

export async function listaCharacters(ctx: Contesto): Promise<Response> {
  const utenteId = utenteDaRichiesta(ctx.req);
  const pgs = await repo.listaCharacters(ctx.env.DB, utenteId);
  return json({ personaggi: pgs.map(conProgressione) });
}

export async function getCharacter(ctx: Contesto): Promise<Response> {
  const pg = await caricaProprio(ctx, ctx.params.id!);
  const inventario = await repo.inventario(ctx.env.DB, pg.id);
  return json({ personaggio: conProgressione(pg), inventario });
}

export async function creaCharacter(ctx: Contesto): Promise<Response> {
  const utenteId = utenteDaRichiesta(ctx.req);
  const corpo = await leggiBody(ctx.req);

  const settingId = campoStringa(corpo, 'setting_id', { obbligatorio: true, max: 64 });
  const setting = await repo.getSetting(ctx.env.DB, settingId);
  if (!setting) throw nonTrovato('Ambientazione');

  const nome = campoStringa(corpo, 'nome', { obbligatorio: true, max: 60 });
  const razza = campoStringa(corpo, 'razza', { max: 40 });
  const classe = campoStringa(corpo, 'classe', { max: 40 });
  const biografia = campoStringa(corpo, 'biografia', { max: 2000 });

  const statistiche = corpo.statistiche
    ? normalizzaStatistiche(corpo.statistiche)
    : statisticheDefault();

  const dadoVita = dadoVitaPerClasse(classe);
  const max = pfMassimi(1, dadoVita, statistiche.costituzione);

  const pg = await repo.creaCharacter(ctx.env.DB, {
    utente_id: utenteId,
    setting_id: settingId,
    nome,
    razza,
    classe,
    statistiche,
    stato: { pf: max, pfMax: max, condizioni: [] },
    biografia,
  });

  return json({ personaggio: conProgressione(pg) }, 201);
}

/**
 * Tira le caratteristiche con il metodo 4d6 scarta il più basso. È un endpoint
 * e non una funzione lato client perché anche questi dadi devono nascere dal
 * motore di gioco, non dal telefono.
 */
export async function tiraStatistiche(): Promise<Response> {
  const valori: Record<string, ReturnType<typeof tira>> = {};
  for (const c of CARATTERISTICHE) {
    valori[c] = tira('4d6kh3');
  }
  return json({
    statistiche: Object.fromEntries(Object.entries(valori).map(([k, v]) => [k, v.totale])),
    tiri: valori,
  });
}

export async function getInventario(ctx: Contesto): Promise<Response> {
  const pg = await caricaProprio(ctx, ctx.params.id!);
  return json({ inventario: await repo.inventario(ctx.env.DB, pg.id) });
}

export async function aggiungiOggetto(ctx: Contesto): Promise<Response> {
  const pg = await caricaProprio(ctx, ctx.params.id!);
  const corpo = await leggiBody(ctx.req);
  const itemId = campoStringa(corpo, 'item_id', { obbligatorio: true, max: 64 });

  const oggetti = await repo.listaItems(ctx.env.DB, pg.setting_id);
  const oggetto = oggetti.find((o) => o.id === itemId);
  if (!oggetto) throw nonTrovato("Oggetto per questa ambientazione");

  const quantitaGrezza = corpo.quantita;
  const quantita =
    typeof quantitaGrezza === 'number' && Number.isFinite(quantitaGrezza)
      ? Math.round(quantitaGrezza)
      : 1;
  if (quantita < 1 || quantita > 999) throw richiestaNonValida('quantita fuori range (1-999)');

  await repo.aggiungiAInventario(ctx.env.DB, pg.id, itemId, quantita, corpo.equipaggiato === true);
  return json({ inventario: await repo.inventario(ctx.env.DB, pg.id) });
}

export async function rimuoviOggetto(ctx: Contesto): Promise<Response> {
  const pg = await caricaProprio(ctx, ctx.params.id!);
  await repo.rimuoviDaInventario(ctx.env.DB, pg.id, ctx.params.itemId!);
  return json({ inventario: await repo.inventario(ctx.env.DB, pg.id) });
}

export async function equipaggia(ctx: Contesto): Promise<Response> {
  const pg = await caricaProprio(ctx, ctx.params.id!);
  const corpo = await leggiBody(ctx.req);
  if (typeof corpo.equipaggiato !== 'boolean') {
    throw richiestaNonValida('Campo "equipaggiato" booleano obbligatorio');
  }
  await repo.impostaEquipaggiamento(ctx.env.DB, pg.id, ctx.params.itemId!, corpo.equipaggiato);
  return json({ inventario: await repo.inventario(ctx.env.DB, pg.id) });
}

export { caricaProprio };
