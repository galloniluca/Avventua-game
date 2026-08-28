import type { Env } from './env';
import { json } from './http';
import { Router } from './router';
import * as campagne from './routes/campaigns';
import * as catalogo from './routes/catalog';
import * as personaggi from './routes/characters';

const router = new Router();

router.get('/health', async () => json({ ok: true, servizio: 'avventua-backend' }));

// Ambientazioni e contenuti data-driven
router.get('/settings', catalogo.getSettings);
router.get('/settings/:settingId/bestiary', catalogo.getBestiario);
router.get('/settings/:settingId/npcs', catalogo.getNpc);
router.get('/settings/:settingId/items', catalogo.getItems);

// Personaggi
router.get('/characters', personaggi.listaCharacters);
router.post('/characters', personaggi.creaCharacter);
router.post('/characters/roll-stats', personaggi.tiraStatistiche);
router.get('/characters/:id', personaggi.getCharacter);
router.get('/characters/:id/inventory', personaggi.getInventario);
router.post('/characters/:id/inventory', personaggi.aggiungiOggetto);
router.patch('/characters/:id/inventory/:itemId', personaggi.equipaggia);
router.delete('/characters/:id/inventory/:itemId', personaggi.rimuoviOggetto);

// Campagne e gioco
router.get('/campaigns', campagne.listaCampagne);
router.post('/campaigns', campagne.creaCampagna);
router.get('/campaigns/:id', campagne.getCampagna);
router.post('/campaigns/:id/start', campagne.avvia);
router.post('/campaigns/:id/action', campagne.azione);
router.post('/campaigns/:id/roll', campagne.tiroDado);
router.post('/campaigns/:id/end-session', campagne.chiudiSessione);
router.get('/campaigns/:id/sessions', campagne.getSessioni);
router.get('/campaigns/:id/sessions/:sessionId', campagne.getEventiSessione);
router.get('/campaigns/:id/summary', campagne.getRiassunto);
router.post('/campaigns/:id/novel', campagne.getRomanzo);

// Dadi fuori dal loop narrativo
router.post('/dice/roll', campagne.tiroLibero);

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return router.gestisci(req, env);
  },
} satisfies ExportedHandler<Env>;
