-- Avventua — schema iniziale (Cloudflare D1 / SQLite)
--
-- Convenzioni:
--  * ID testuali (UUID v4) generati lato Worker: niente autoincrement, così lo
--    stesso record può nascere offline/su client diversi senza collisioni.
--  * Le colonne "*_json" contengono JSON serializzato; SQLite non ha un tipo
--    nativo, ma D1 supporta json_extract() se in futuro servissero query mirate.
--  * Timestamp in ISO 8601 UTC (TEXT), ordinabili lessicograficamente.
--  * Tutto ciò che è specifico di un'ambientazione ha setting_id: bestiario,
--    PNG e oggetti sono data-driven per ambientazione ed estendibili a runtime.

PRAGMA foreign_keys = ON;

-- 1. Ambientazioni ------------------------------------------------------------
CREATE TABLE settings (
  id              TEXT PRIMARY KEY,
  nome            TEXT NOT NULL,
  descrizione     TEXT NOT NULL DEFAULT '',
  ruleset         TEXT NOT NULL,             -- es. 'dnd5e-like'
  tono_narrativo  TEXT NOT NULL DEFAULT '',  -- es. 'dark fantasy, ironico'
  creato_il       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- 2. Personaggi ---------------------------------------------------------------
CREATE TABLE characters (
  id              TEXT PRIMARY KEY,
  utente_id       TEXT NOT NULL,
  setting_id      TEXT NOT NULL REFERENCES settings(id) ON DELETE RESTRICT,
  nome            TEXT NOT NULL,
  razza           TEXT NOT NULL DEFAULT '',
  classe          TEXT NOT NULL DEFAULT '',
  livello         INTEGER NOT NULL DEFAULT 1,
  xp              INTEGER NOT NULL DEFAULT 0,
  statistiche_json TEXT NOT NULL DEFAULT '{}',  -- {forza, destrezza, ...}
  stato_attuale_json TEXT NOT NULL DEFAULT '{}', -- {pf, pf_max, condizioni[], ...}
  biografia       TEXT NOT NULL DEFAULT '',
  creato_il       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  aggiornato_il   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_characters_utente ON characters(utente_id);
CREATE INDEX idx_characters_setting ON characters(setting_id);

-- 3. Campagne -----------------------------------------------------------------
CREATE TABLE campaigns (
  id                TEXT PRIMARY KEY,
  setting_id        TEXT NOT NULL REFERENCES settings(id) ON DELETE RESTRICT,
  nome              TEXT NOT NULL,
  lunghezza_target  TEXT NOT NULL DEFAULT 'media',   -- breve | media | lunga
  complessita       TEXT NOT NULL DEFAULT 'media',   -- semplice | media | articolata
  stato             TEXT NOT NULL DEFAULT 'attiva',  -- attiva | conclusa | archiviata
  world_state_json  TEXT NOT NULL DEFAULT '{}',      -- PNG vivi/morti, quest, luoghi, decisioni
  incipit           TEXT NOT NULL DEFAULT '',
  creato_il         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  aggiornato_il     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_campaigns_setting ON campaigns(setting_id);

-- 3b. Partecipanti alla campagna ----------------------------------------------
-- In v1 c'è sempre esattamente una riga per campagna. È una tabella e non una
-- lista JSON dentro campaigns proprio per non dover ristrutturare quando
-- arriverà il multiplayer (join, indici e vincoli sono già al posto giusto).
CREATE TABLE campaign_participants (
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  ruolo         TEXT NOT NULL DEFAULT 'player',  -- player | dm (uso futuro)
  unito_il      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (campaign_id, character_id)
);
CREATE INDEX idx_participants_character ON campaign_participants(character_id);

-- 4. Sessioni di gioco ---------------------------------------------------------
CREATE TABLE sessions (
  id            TEXT PRIMARY KEY,
  campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  numero        INTEGER NOT NULL,               -- progressivo per campagna
  stato         TEXT NOT NULL DEFAULT 'aperta', -- aperta | chiusa
  iniziata_il   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  chiusa_il     TEXT,
  UNIQUE (campaign_id, numero)
);
CREATE INDEX idx_sessions_campaign ON sessions(campaign_id);

-- 4b. Eventi di sessione -------------------------------------------------------
-- Il log ordinato della sessione: narrazione, azioni del giocatore, tiri di
-- dado ed esiti. Righe separate (non un blob JSON su sessions) perché è la
-- struttura su cui si fa append a ogni turno e da cui si legge la finestra
-- degli "eventi recenti" per il prompt.
CREATE TABLE session_events (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ordine        INTEGER NOT NULL,   -- progressivo per sessione
  tipo          TEXT NOT NULL,      -- narrazione | azione | richiesta_tiro | tiro | sistema
  attore        TEXT NOT NULL,      -- 'dm' | character_id
  contenuto     TEXT NOT NULL DEFAULT '',
  dati_json     TEXT NOT NULL DEFAULT '{}',
  creato_il     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (session_id, ordine)
);
CREATE INDEX idx_events_session_ordine ON session_events(session_id, ordine);

-- 5. Bestiario -----------------------------------------------------------------
CREATE TABLE bestiary (
  id                          TEXT PRIMARY KEY,
  setting_id                  TEXT NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
  nome                        TEXT NOT NULL,
  descrizione                 TEXT NOT NULL DEFAULT '',
  statistiche_combattimento_json TEXT NOT NULL DEFAULT '{}',
  origine                     TEXT NOT NULL DEFAULT 'predefinito', -- predefinito | generato_ai
  creato_il                   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (setting_id, nome)
);

-- 6. PNG ------------------------------------------------------------------------
CREATE TABLE npcs (
  id                TEXT PRIMARY KEY,
  setting_id        TEXT NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
  nome              TEXT NOT NULL,
  ruolo_descrizione TEXT NOT NULL DEFAULT '',
  stato             TEXT NOT NULL DEFAULT 'vivo',        -- vivo | morto | scomparso | ...
  origine           TEXT NOT NULL DEFAULT 'predefinito', -- predefinito | generato_ai
  creato_il         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (setting_id, nome)
);

-- 7. Oggetti --------------------------------------------------------------------
CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  setting_id    TEXT NOT NULL REFERENCES settings(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  tipo          TEXT NOT NULL DEFAULT 'vario',       -- arma | armatura | consumabile | vario
  effetti_json  TEXT NOT NULL DEFAULT '{}',
  origine       TEXT NOT NULL DEFAULT 'predefinito', -- predefinito | generato_ai
  creato_il     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (setting_id, nome)
);

-- 8. Inventari (characters <-> items) --------------------------------------------
CREATE TABLE inventories (
  character_id  TEXT NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  item_id       TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantita      INTEGER NOT NULL DEFAULT 1,
  equipaggiato  INTEGER NOT NULL DEFAULT 0,  -- 0/1
  PRIMARY KEY (character_id, item_id)
);
CREATE INDEX idx_inventories_item ON inventories(item_id);

-- 9. Memoria narrativa ------------------------------------------------------------
-- Ogni riga è una versione del riassunto. I delta di fine sessione si accodano
-- come nuove righe 'delta'; il consolidamento periodico produce una riga
-- 'consolidato' che le rimpiazza logicamente (la più recente vince).
CREATE TABLE campaign_summaries (
  id                              TEXT PRIMARY KEY,
  campaign_id                     TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  tipo                            TEXT NOT NULL DEFAULT 'delta', -- delta | consolidato
  contenuto_md                    TEXT NOT NULL,
  versione_timestamp              TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  aggiornato_alla_sessione        INTEGER NOT NULL DEFAULT 0,
  sessioni_dal_ultimo_consolidamento INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_summaries_campaign ON campaign_summaries(campaign_id, versione_timestamp);
