-- Ambientazione di default per la v1, più un minimo di contenuti data-driven.
-- L'AI può aggiungerne altri a runtime (origine = 'generato_ai').

INSERT INTO settings (id, nome, descrizione, ruleset, tono_narrativo) VALUES
  ('set_terre_spezzate',
   'Le Terre Spezzate',
   'Un continente frammentato da una catastrofe arcana: rovine sospese, città-stato diffidenti e strade che nessuno percorre di notte.',
   'dnd5e-like',
   'Fantasy classico con venature dark; toni epici ma sporchi, ironia rara e asciutta.');

INSERT INTO bestiary (id, setting_id, nome, descrizione, statistiche_combattimento_json, origine) VALUES
  ('bst_goblin', 'set_terre_spezzate', 'Goblin predone',
   'Piccolo, vigliacco e mai solo. Attacca dalle rocce e scappa quando perde il vantaggio.',
   '{"ca":13,"pf":7,"attacco":{"nome":"Scimitarra","bonus":4,"danni":"1d6+2"},"velocita":9,"sfida":0.25}', 'predefinito'),
  ('bst_lupo_cinereo', 'set_terre_spezzate', 'Lupo cinereo',
   'Predatore delle piane bruciate, pelo grigio di cenere. Caccia in branco.',
   '{"ca":13,"pf":11,"attacco":{"nome":"Morso","bonus":4,"danni":"2d4+2"},"velocita":12,"sfida":0.25}', 'predefinito'),
  ('bst_scheletro', 'set_terre_spezzate', 'Scheletro di sentinella',
   'Resto animato di una guardia che non ha mai ricevuto il cambio.',
   '{"ca":13,"pf":13,"attacco":{"nome":"Spada corta","bonus":4,"danni":"1d6+2"},"velocita":9,"sfida":0.25}', 'predefinito'),
  ('bst_orco', 'set_terre_spezzate', 'Orco saccheggiatore',
   'Grosso, diretto, convinto che la trattativa sia una forma di codardia.',
   '{"ca":13,"pf":15,"attacco":{"nome":"Ascia bipenne","bonus":5,"danni":"1d12+3"},"velocita":9,"sfida":0.5}', 'predefinito');

INSERT INTO npcs (id, setting_id, nome, ruolo_descrizione, stato, origine) VALUES
  ('npc_maestra_vela', 'set_terre_spezzate', 'Maestra Vela',
   'Archivista della torre di Duenpietre. Sa più di quanto dica e contratta ogni informazione.', 'vivo', 'predefinito'),
  ('npc_bram', 'set_terre_spezzate', 'Bram il Sordo',
   'Locandiere del Cane Storto. Non sente le domande scomode, ricorda tutti i debiti.', 'vivo', 'predefinito');

INSERT INTO items (id, setting_id, nome, tipo, effetti_json, origine) VALUES
  ('itm_spada_corta', 'set_terre_spezzate', 'Spada corta', 'arma',
   '{"danni":"1d6","proprieta":["accurata","leggera"],"caratteristica":"destrezza"}', 'predefinito'),
  ('itm_arco_corto', 'set_terre_spezzate', 'Arco corto', 'arma',
   '{"danni":"1d6","gittata":"24/96","proprieta":["a distanza"],"caratteristica":"destrezza"}', 'predefinito'),
  ('itm_ascia', 'set_terre_spezzate', 'Ascia da battaglia', 'arma',
   '{"danni":"1d8","proprieta":["versatile"],"caratteristica":"forza"}', 'predefinito'),
  ('itm_armatura_cuoio', 'set_terre_spezzate', 'Armatura di cuoio', 'armatura',
   '{"ca_base":11,"aggiunge_destrezza":true}', 'predefinito'),
  ('itm_pozione_cura', 'set_terre_spezzate', 'Pozione di cura minore', 'consumabile',
   '{"cura":"2d4+2","consumo":true}', 'predefinito'),
  ('itm_corda', 'set_terre_spezzate', 'Corda di canapa (15 m)', 'vario', '{}', 'predefinito'),
  ('itm_torcia', 'set_terre_spezzate', 'Torcia', 'vario', '{"luce_m":6,"durata_min":60}', 'predefinito');
