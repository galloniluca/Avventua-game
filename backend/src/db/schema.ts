/** Tipi di dominio e mappatura dalle righe D1 (colonne *_json -> oggetti). */

import { normalizzaStatistiche, type Statistiche, type StatoPersonaggio } from '../rules/stats';

export interface Setting {
  id: string;
  nome: string;
  descrizione: string;
  ruleset: string;
  tono_narrativo: string;
}

export interface Character {
  id: string;
  utente_id: string;
  setting_id: string;
  nome: string;
  razza: string;
  classe: string;
  livello: number;
  xp: number;
  statistiche: Statistiche;
  stato: StatoPersonaggio;
  biografia: string;
}

export type LunghezzaTarget = 'breve' | 'media' | 'lunga';
export type Complessita = 'semplice' | 'media' | 'articolata';

export interface WorldState {
  [chiave: string]: unknown;
}

export interface Campaign {
  id: string;
  setting_id: string;
  nome: string;
  lunghezza_target: LunghezzaTarget;
  complessita: Complessita;
  stato: 'attiva' | 'conclusa' | 'archiviata';
  world_state: WorldState;
  incipit: string;
}

export type TipoEvento = 'narrazione' | 'azione' | 'richiesta_tiro' | 'tiro' | 'sistema';

export interface SessionEvent {
  id: string;
  session_id: string;
  ordine: number;
  tipo: TipoEvento;
  attore: string;
  contenuto: string;
  dati: Record<string, unknown>;
  creato_il: string;
}

export interface GameSession {
  id: string;
  campaign_id: string;
  numero: number;
  stato: 'aperta' | 'chiusa';
  iniziata_il: string;
  chiusa_il: string | null;
}

export interface CampaignSummary {
  id: string;
  campaign_id: string;
  tipo: 'delta' | 'consolidato';
  contenuto_md: string;
  versione_timestamp: string;
  aggiornato_alla_sessione: number;
  sessioni_dal_ultimo_consolidamento: number;
}

export interface ItemRecord {
  id: string;
  setting_id: string;
  nome: string;
  tipo: string;
  effetti: Record<string, unknown>;
  origine: string;
}

export interface RigaInventario extends ItemRecord {
  quantita: number;
  equipaggiato: boolean;
}

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  try {
    const v = JSON.parse(raw);
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

type Riga = Record<string, unknown>;

export function mappaCharacter(r: Riga): Character {
  const statoGrezzo = parseJson<Partial<StatoPersonaggio>>(r.stato_attuale_json, {});
  return {
    id: String(r.id),
    utente_id: String(r.utente_id),
    setting_id: String(r.setting_id),
    nome: String(r.nome),
    razza: String(r.razza ?? ''),
    classe: String(r.classe ?? ''),
    livello: Number(r.livello ?? 1),
    xp: Number(r.xp ?? 0),
    statistiche: normalizzaStatistiche(parseJson<unknown>(r.statistiche_json, {})),
    stato: {
      pf: Number(statoGrezzo.pf ?? 0),
      pfMax: Number(statoGrezzo.pfMax ?? 0),
      condizioni: Array.isArray(statoGrezzo.condizioni) ? statoGrezzo.condizioni.map(String) : [],
    },
    biografia: String(r.biografia ?? ''),
  };
}

export function mappaCampaign(r: Riga): Campaign {
  return {
    id: String(r.id),
    setting_id: String(r.setting_id),
    nome: String(r.nome),
    lunghezza_target: String(r.lunghezza_target ?? 'media') as LunghezzaTarget,
    complessita: String(r.complessita ?? 'media') as Complessita,
    stato: String(r.stato ?? 'attiva') as Campaign['stato'],
    world_state: parseJson<WorldState>(r.world_state_json, {}),
    incipit: String(r.incipit ?? ''),
  };
}

export function mappaSetting(r: Riga): Setting {
  return {
    id: String(r.id),
    nome: String(r.nome),
    descrizione: String(r.descrizione ?? ''),
    ruleset: String(r.ruleset),
    tono_narrativo: String(r.tono_narrativo ?? ''),
  };
}

export function mappaSession(r: Riga): GameSession {
  return {
    id: String(r.id),
    campaign_id: String(r.campaign_id),
    numero: Number(r.numero),
    stato: String(r.stato ?? 'aperta') as GameSession['stato'],
    iniziata_il: String(r.iniziata_il),
    chiusa_il: r.chiusa_il == null ? null : String(r.chiusa_il),
  };
}

export function mappaEvento(r: Riga): SessionEvent {
  return {
    id: String(r.id),
    session_id: String(r.session_id),
    ordine: Number(r.ordine),
    tipo: String(r.tipo) as TipoEvento,
    attore: String(r.attore),
    contenuto: String(r.contenuto ?? ''),
    dati: parseJson<Record<string, unknown>>(r.dati_json, {}),
    creato_il: String(r.creato_il),
  };
}

export function mappaSummary(r: Riga): CampaignSummary {
  return {
    id: String(r.id),
    campaign_id: String(r.campaign_id),
    tipo: String(r.tipo ?? 'delta') as CampaignSummary['tipo'],
    contenuto_md: String(r.contenuto_md ?? ''),
    versione_timestamp: String(r.versione_timestamp),
    aggiornato_alla_sessione: Number(r.aggiornato_alla_sessione ?? 0),
    sessioni_dal_ultimo_consolidamento: Number(r.sessioni_dal_ultimo_consolidamento ?? 0),
  };
}

export function mappaItem(r: Riga): ItemRecord {
  return {
    id: String(r.id),
    setting_id: String(r.setting_id),
    nome: String(r.nome),
    tipo: String(r.tipo ?? 'vario'),
    effetti: parseJson<Record<string, unknown>>(r.effetti_json, {}),
    origine: String(r.origine ?? 'predefinito'),
  };
}

export function mappaRigaInventario(r: Riga): RigaInventario {
  return {
    ...mappaItem(r),
    quantita: Number(r.quantita ?? 1),
    equipaggiato: Number(r.equipaggiato ?? 0) === 1,
  };
}
