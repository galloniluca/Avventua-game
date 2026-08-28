/** Accesso a D1. Tutte le query vivono qui; il resto del codice usa i tipi. */

import { nuovoId } from '../http';
import type { Statistiche, StatoPersonaggio } from '../rules/stats';
import {
  mappaCampaign,
  mappaCharacter,
  mappaEvento,
  mappaItem,
  mappaRigaInventario,
  mappaSession,
  mappaSetting,
  mappaSummary,
  type Campaign,
  type CampaignSummary,
  type Character,
  type Complessita,
  type GameSession,
  type ItemRecord,
  type LunghezzaTarget,
  type RigaInventario,
  type SessionEvent,
  type Setting,
  type TipoEvento,
  type WorldState,
} from './schema';

type Riga = Record<string, unknown>;

async function tutte(db: D1Database, sql: string, ...bind: unknown[]): Promise<Riga[]> {
  const res = await db
    .prepare(sql)
    .bind(...bind)
    .all<Riga>();
  return res.results ?? [];
}

async function una(db: D1Database, sql: string, ...bind: unknown[]): Promise<Riga | null> {
  return (
    (await db
      .prepare(sql)
      .bind(...bind)
      .first<Riga>()) ?? null
  );
}

const ORA = () => new Date().toISOString();

// --- Settings ----------------------------------------------------------------

export async function listaSettings(db: D1Database): Promise<Setting[]> {
  return (await tutte(db, 'SELECT * FROM settings ORDER BY nome')).map(mappaSetting);
}

export async function getSetting(db: D1Database, id: string): Promise<Setting | null> {
  const r = await una(db, 'SELECT * FROM settings WHERE id = ?', id);
  return r ? mappaSetting(r) : null;
}

// --- Characters ---------------------------------------------------------------

export interface NuovoCharacter {
  utente_id: string;
  setting_id: string;
  nome: string;
  razza: string;
  classe: string;
  statistiche: Statistiche;
  stato: StatoPersonaggio;
  biografia: string;
}

export async function creaCharacter(db: D1Database, dati: NuovoCharacter): Promise<Character> {
  const id = nuovoId('chr');
  await db
    .prepare(
      `INSERT INTO characters
         (id, utente_id, setting_id, nome, razza, classe, livello, xp,
          statistiche_json, stato_attuale_json, biografia)
       VALUES (?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
    )
    .bind(
      id,
      dati.utente_id,
      dati.setting_id,
      dati.nome,
      dati.razza,
      dati.classe,
      JSON.stringify(dati.statistiche),
      JSON.stringify(dati.stato),
      dati.biografia,
    )
    .run();
  const creato = await getCharacter(db, id);
  if (!creato) throw new Error('Creazione personaggio fallita');
  return creato;
}

export async function getCharacter(db: D1Database, id: string): Promise<Character | null> {
  const r = await una(db, 'SELECT * FROM characters WHERE id = ?', id);
  return r ? mappaCharacter(r) : null;
}

export async function listaCharacters(db: D1Database, utenteId: string): Promise<Character[]> {
  return (
    await tutte(db, 'SELECT * FROM characters WHERE utente_id = ? ORDER BY creato_il DESC', utenteId)
  ).map(mappaCharacter);
}

export async function aggiornaProgressione(
  db: D1Database,
  id: string,
  xp: number,
  livello: number,
  stato: StatoPersonaggio,
): Promise<void> {
  await db
    .prepare(
      `UPDATE characters
          SET xp = ?, livello = ?, stato_attuale_json = ?, aggiornato_il = ?
        WHERE id = ?`,
    )
    .bind(xp, livello, JSON.stringify(stato), ORA(), id)
    .run();
}

export async function aggiornaStatistiche(
  db: D1Database,
  id: string,
  statistiche: Statistiche,
): Promise<void> {
  await db
    .prepare('UPDATE characters SET statistiche_json = ?, aggiornato_il = ? WHERE id = ?')
    .bind(JSON.stringify(statistiche), ORA(), id)
    .run();
}

// --- Campaigns -----------------------------------------------------------------

export interface NuovaCampaign {
  setting_id: string;
  nome: string;
  lunghezza_target: LunghezzaTarget;
  complessita: Complessita;
  incipit: string;
}

export async function creaCampaign(
  db: D1Database,
  dati: NuovaCampaign,
  characterId: string,
): Promise<Campaign> {
  const id = nuovoId('cmp');
  await db.batch([
    db
      .prepare(
        `INSERT INTO campaigns (id, setting_id, nome, lunghezza_target, complessita, incipit, world_state_json)
         VALUES (?, ?, ?, ?, ?, ?, '{}')`,
      )
      .bind(id, dati.setting_id, dati.nome, dati.lunghezza_target, dati.complessita, dati.incipit),
    db
      .prepare('INSERT INTO campaign_participants (campaign_id, character_id) VALUES (?, ?)')
      .bind(id, characterId),
  ]);
  const creata = await getCampaign(db, id);
  if (!creata) throw new Error('Creazione campagna fallita');
  return creata;
}

export async function getCampaign(db: D1Database, id: string): Promise<Campaign | null> {
  const r = await una(db, 'SELECT * FROM campaigns WHERE id = ?', id);
  return r ? mappaCampaign(r) : null;
}

export async function listaCampaignsPerUtente(
  db: D1Database,
  utenteId: string,
): Promise<Array<Campaign & { character_id: string }>> {
  const righe = await tutte(
    db,
    `SELECT c.*, p.character_id
       FROM campaigns c
       JOIN campaign_participants p ON p.campaign_id = c.id
       JOIN characters ch ON ch.id = p.character_id
      WHERE ch.utente_id = ?
      ORDER BY c.aggiornato_il DESC`,
    utenteId,
  );
  return righe.map((r) => ({ ...mappaCampaign(r), character_id: String(r.character_id) }));
}

/** In v1 c'è sempre un solo partecipante; la firma è già pronta per N. */
export async function partecipanti(db: D1Database, campaignId: string): Promise<Character[]> {
  const righe = await tutte(
    db,
    `SELECT ch.* FROM characters ch
       JOIN campaign_participants p ON p.character_id = ch.id
      WHERE p.campaign_id = ?
      ORDER BY p.unito_il`,
    campaignId,
  );
  return righe.map(mappaCharacter);
}

export async function salvaWorldState(
  db: D1Database,
  campaignId: string,
  world: WorldState,
): Promise<void> {
  await db
    .prepare('UPDATE campaigns SET world_state_json = ?, aggiornato_il = ? WHERE id = ?')
    .bind(JSON.stringify(world), ORA(), campaignId)
    .run();
}

export async function segnaCampagnaConclusa(db: D1Database, campaignId: string): Promise<void> {
  await db
    .prepare("UPDATE campaigns SET stato = 'conclusa', aggiornato_il = ? WHERE id = ?")
    .bind(ORA(), campaignId)
    .run();
}

// --- Sessions ------------------------------------------------------------------

export async function sessioneAperta(
  db: D1Database,
  campaignId: string,
): Promise<GameSession | null> {
  const r = await una(
    db,
    "SELECT * FROM sessions WHERE campaign_id = ? AND stato = 'aperta' ORDER BY numero DESC LIMIT 1",
    campaignId,
  );
  return r ? mappaSession(r) : null;
}

export async function apriSessione(db: D1Database, campaignId: string): Promise<GameSession> {
  const r = await una(
    db,
    'SELECT COALESCE(MAX(numero), 0) AS massimo FROM sessions WHERE campaign_id = ?',
    campaignId,
  );
  const numero = Number(r?.massimo ?? 0) + 1;
  const id = nuovoId('ses');
  await db
    .prepare('INSERT INTO sessions (id, campaign_id, numero) VALUES (?, ?, ?)')
    .bind(id, campaignId, numero)
    .run();
  const creata = await una(db, 'SELECT * FROM sessions WHERE id = ?', id);
  if (!creata) throw new Error('Apertura sessione fallita');
  return mappaSession(creata);
}

export async function chiudiSessione(db: D1Database, sessionId: string): Promise<void> {
  await db
    .prepare("UPDATE sessions SET stato = 'chiusa', chiusa_il = ? WHERE id = ?")
    .bind(ORA(), sessionId)
    .run();
}

export async function listaSessioni(db: D1Database, campaignId: string): Promise<GameSession[]> {
  return (
    await tutte(db, 'SELECT * FROM sessions WHERE campaign_id = ? ORDER BY numero', campaignId)
  ).map(mappaSession);
}

// --- Session events -------------------------------------------------------------

export interface NuovoEvento {
  tipo: TipoEvento;
  attore: string;
  contenuto: string;
  dati?: Record<string, unknown>;
}

/**
 * Append atomico: l'ordine viene calcolato dentro la stessa INSERT, così due
 * turni ravvicinati non possono ottenere lo stesso numero d'ordine (la UNIQUE
 * su (session_id, ordine) farebbe comunque da rete di sicurezza).
 */
export async function aggiungiEventi(
  db: D1Database,
  sessionId: string,
  eventi: NuovoEvento[],
): Promise<SessionEvent[]> {
  if (eventi.length === 0) return [];
  const ids: string[] = [];
  const statements = eventi.map((e) => {
    const id = nuovoId('evt');
    ids.push(id);
    return db
      .prepare(
        `INSERT INTO session_events (id, session_id, ordine, tipo, attore, contenuto, dati_json)
         VALUES (?, ?, (SELECT COALESCE(MAX(ordine), 0) + 1 FROM session_events WHERE session_id = ?), ?, ?, ?, ?)`,
      )
      .bind(
        id,
        sessionId,
        sessionId,
        e.tipo,
        e.attore,
        e.contenuto,
        JSON.stringify(e.dati ?? {}),
      );
  });
  await db.batch(statements);

  const segnaposto = ids.map(() => '?').join(',');
  const righe = await tutte(
    db,
    `SELECT * FROM session_events WHERE id IN (${segnaposto}) ORDER BY ordine`,
    ...ids,
  );
  return righe.map(mappaEvento);
}

export async function eventiSessione(
  db: D1Database,
  sessionId: string,
  limite?: number,
): Promise<SessionEvent[]> {
  if (limite === undefined) {
    return (
      await tutte(db, 'SELECT * FROM session_events WHERE session_id = ? ORDER BY ordine', sessionId)
    ).map(mappaEvento);
  }
  // Ultimi N, riportati in ordine cronologico.
  const righe = await tutte(
    db,
    'SELECT * FROM session_events WHERE session_id = ? ORDER BY ordine DESC LIMIT ?',
    sessionId,
    limite,
  );
  return righe.map(mappaEvento).reverse();
}

// --- Summaries -------------------------------------------------------------------

export async function riassuntiCampagna(
  db: D1Database,
  campaignId: string,
): Promise<CampaignSummary[]> {
  return (
    await tutte(
      db,
      'SELECT * FROM campaign_summaries WHERE campaign_id = ? ORDER BY versione_timestamp, id',
      campaignId,
    )
  ).map(mappaSummary);
}

export async function salvaRiassunto(
  db: D1Database,
  campaignId: string,
  tipo: 'delta' | 'consolidato',
  contenuto: string,
  sessione: number,
  sessioniDaConsolidamento: number,
): Promise<CampaignSummary> {
  const id = nuovoId('sum');
  await db
    .prepare(
      `INSERT INTO campaign_summaries
         (id, campaign_id, tipo, contenuto_md, aggiornato_alla_sessione, sessioni_dal_ultimo_consolidamento)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, campaignId, tipo, contenuto, sessione, sessioniDaConsolidamento)
    .run();
  const r = await una(db, 'SELECT * FROM campaign_summaries WHERE id = ?', id);
  if (!r) throw new Error('Salvataggio riassunto fallito');
  return mappaSummary(r);
}

/** Il consolidamento sostituisce i delta che ha inglobato. */
export async function eliminaRiassunti(db: D1Database, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const segnaposto = ids.map(() => '?').join(',');
  await db
    .prepare(`DELETE FROM campaign_summaries WHERE id IN (${segnaposto})`)
    .bind(...ids)
    .run();
}

// --- Bestiario / PNG / oggetti ------------------------------------------------------

export async function listaBestiario(db: D1Database, settingId: string): Promise<Riga[]> {
  return tutte(db, 'SELECT * FROM bestiary WHERE setting_id = ? ORDER BY nome', settingId);
}

export async function listaNpc(db: D1Database, settingId: string): Promise<Riga[]> {
  return tutte(db, 'SELECT * FROM npcs WHERE setting_id = ? ORDER BY nome', settingId);
}

export async function listaItems(db: D1Database, settingId: string): Promise<ItemRecord[]> {
  return (await tutte(db, 'SELECT * FROM items WHERE setting_id = ? ORDER BY nome', settingId)).map(
    mappaItem,
  );
}

/** Upsert idempotente: l'AI ripropone spesso entità già introdotte. */
export async function salvaEntitaGenerata(
  db: D1Database,
  settingId: string,
  categoria: 'png' | 'mostro' | 'oggetto',
  nome: string,
  descrizione: string,
  dati: Record<string, unknown>,
): Promise<void> {
  const datiJson = JSON.stringify(dati);
  if (categoria === 'png') {
    await db
      .prepare(
        `INSERT INTO npcs (id, setting_id, nome, ruolo_descrizione, stato, origine)
         VALUES (?, ?, ?, ?, 'vivo', 'generato_ai')
         ON CONFLICT (setting_id, nome) DO NOTHING`,
      )
      .bind(nuovoId('npc'), settingId, nome, descrizione)
      .run();
  } else if (categoria === 'mostro') {
    await db
      .prepare(
        `INSERT INTO bestiary (id, setting_id, nome, descrizione, statistiche_combattimento_json, origine)
         VALUES (?, ?, ?, ?, ?, 'generato_ai')
         ON CONFLICT (setting_id, nome) DO NOTHING`,
      )
      .bind(nuovoId('bst'), settingId, nome, descrizione, datiJson)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO items (id, setting_id, nome, tipo, effetti_json, origine)
         VALUES (?, ?, ?, 'vario', ?, 'generato_ai')
         ON CONFLICT (setting_id, nome) DO NOTHING`,
      )
      .bind(nuovoId('itm'), settingId, nome, datiJson)
      .run();
  }
}

// --- Inventari ---------------------------------------------------------------------

export async function inventario(db: D1Database, characterId: string): Promise<RigaInventario[]> {
  const righe = await tutte(
    db,
    `SELECT i.*, inv.quantita, inv.equipaggiato
       FROM inventories inv
       JOIN items i ON i.id = inv.item_id
      WHERE inv.character_id = ?
      ORDER BY inv.equipaggiato DESC, i.nome`,
    characterId,
  );
  return righe.map(mappaRigaInventario);
}

export async function aggiungiAInventario(
  db: D1Database,
  characterId: string,
  itemId: string,
  quantita = 1,
  equipaggiato = false,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO inventories (character_id, item_id, quantita, equipaggiato)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (character_id, item_id)
       DO UPDATE SET quantita = quantita + excluded.quantita`,
    )
    .bind(characterId, itemId, quantita, equipaggiato ? 1 : 0)
    .run();
}

export async function rimuoviDaInventario(
  db: D1Database,
  characterId: string,
  itemId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM inventories WHERE character_id = ? AND item_id = ?')
    .bind(characterId, itemId)
    .run();
}

export async function impostaEquipaggiamento(
  db: D1Database,
  characterId: string,
  itemId: string,
  equipaggiato: boolean,
): Promise<void> {
  await db
    .prepare('UPDATE inventories SET equipaggiato = ? WHERE character_id = ? AND item_id = ?')
    .bind(equipaggiato ? 1 : 0, characterId, itemId)
    .run();
}
