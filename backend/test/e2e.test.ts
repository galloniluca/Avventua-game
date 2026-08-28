/**
 * Test end-to-end del Worker: stessi handler, stesso router, stesse query,
 * ma con D1 su SQLite in memoria e provider AI deterministico.
 * Copre il giro completo: personaggio -> campagna -> incipit -> azione ->
 * tiro richiesto dal DM -> tiro eseguito -> chiusura sessione con riassunto.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Coda di risposte servite al posto del modello. Dichiarata prima del mock
 * perché vi.mock viene sollevato in cima al file.
 */
const coda: string[] = [];

vi.mock('../src/ai', async (importActual) => {
  const reale = await importActual<typeof import('../src/ai')>();
  const { MockProvider } = await import('../src/ai/mock');
  return {
    ...reale,
    creaProvider: (env: { AI_PROVIDER?: string }) =>
      env.AI_PROVIDER === 'mock-coda' ? new MockProvider(coda.splice(0)) : reale.creaProvider(env as never),
  };
});

import worker from '../src/index';
import type { Env } from '../src/env';
import { FakeD1, comeD1 } from './helpers/d1';

const UTENTE = 'utente-test';

function rispostaDm(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    narrazione: 'La nebbia si apre sulla strada per Duenpietre.',
    richiesta_tiro: {
      serve: false,
      notazione: '',
      caratteristica: 'nessuna',
      competenza: false,
      cd: 0,
      vantaggio: 'nessuno',
      motivo: '',
    },
    aggiornamenti_mondo: [],
    nuove_entita: [],
    xp_assegnati: 0,
    danni_subiti: 0,
    cure_ricevute: 0,
    fine_sessione_suggerita: false,
    campagna_conclusa: false,
    ...over,
  });
}

/** Env di test: il provider pesca dalla coda di risposte precotte. */
function creaEnv(db: FakeD1, risposte: string[]): Env {
  coda.length = 0;
  coda.push(...risposte);
  return {
    DB: comeD1(db),
    AI_PROVIDER: 'mock-coda',
    GEMINI_API_KEY: 'non-usata',
    CONSOLIDA_OGNI_N_SESSIONI: '2',
    CONSOLIDA_SOGLIA_CARATTERI: '100000',
  };
}

async function chiama(
  env: Env,
  metodo: string,
  percorso: string,
  corpo?: unknown,
): Promise<{ stato: number; dati: any }> {
  const req = new Request(`https://test.local${percorso}`, {
    method: metodo,
    headers: { 'content-type': 'application/json', 'x-utente-id': UTENTE },
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  const res = await worker.fetch(req, env);
  return { stato: res.status, dati: await res.json() };
}

describe('worker end-to-end', () => {
  let db: FakeD1;

  beforeEach(() => {
    db = new FakeD1();
  });

  it('espone health e ambientazioni con i contenuti seed', async () => {
    const env = creaEnv(db, []);
    expect((await chiama(env, 'GET', '/health')).dati.ok).toBe(true);

    const settings = await chiama(env, 'GET', '/settings');
    expect(settings.dati.settings).toHaveLength(1);
    const id = settings.dati.settings[0].id;

    expect((await chiama(env, 'GET', `/settings/${id}/bestiary`)).dati.bestiario).toHaveLength(4);
    expect((await chiama(env, 'GET', `/settings/${id}/items`)).dati.oggetti).toHaveLength(7);
    expect((await chiama(env, 'GET', `/settings/${id}/npcs`)).dati.npc).toHaveLength(2);
  });

  it('richiede l\'identificazione utente sulle rotte private', async () => {
    const env = creaEnv(db, []);
    const res = await worker.fetch(
      new Request('https://test.local/characters', { method: 'GET' }),
      env,
    );
    expect(res.status).toBe(401);
  });

  it('risponde 404 e 405 in modo distinto', async () => {
    const env = creaEnv(db, []);
    expect((await chiama(env, 'GET', '/inesistente')).stato).toBe(404);
    expect((await chiama(env, 'DELETE', '/health')).stato).toBe(405);
  });

  it('gioca un turno completo con tiro di dado e chiude la sessione', async () => {
    const env = creaEnv(db, []);

    // 1. Personaggio
    const pg = await chiama(env, 'POST', '/characters', {
      setting_id: 'set_terre_spezzate',
      nome: 'Kaела',
      razza: 'Mezzelfa',
      classe: 'ranger',
      statistiche: { forza: 12, destrezza: 16, costituzione: 14, intelligenza: 10, saggezza: 13, carisma: 8 },
      biografia: 'Cresciuta tra le rovine sospese.',
    });
    expect(pg.stato).toBe(201);
    const characterId = pg.dati.personaggio.id;
    // ranger -> d10, costituzione 14 (+2) => 12 pf al livello 1
    expect(pg.dati.personaggio.stato.pfMax).toBe(12);
    expect(pg.dati.personaggio.livello).toBe(1);

    // 2. Campagna
    const camp = await chiama(env, 'POST', '/campaigns', {
      character_id: characterId,
      nome: 'La corona spezzata',
      lunghezza_target: 'breve',
      complessita: 'semplice',
    });
    expect(camp.stato).toBe(201);
    const campaignId = camp.dati.campagna.id;

    // 3. Incipit
    coda.push(rispostaDm({ narrazione: 'Duenpietre ti accoglie con la pioggia.' }));
    const avvio = await chiama(env, 'POST', `/campaigns/${campaignId}/start`);
    expect(avvio.stato).toBe(201);
    expect(avvio.dati.turno.narrazione).toContain('Duenpietre');
    expect(avvio.dati.turno.richiestaTiro).toBeNull();

    // Riavviare deve fallire: la sessione ha già eventi.
    coda.push(rispostaDm());
    expect((await chiama(env, 'POST', `/campaigns/${campaignId}/start`)).stato).toBe(409);
    coda.splice(0);

    // 4. Azione libera che porta il DM a chiedere un tiro
    coda.push(
      rispostaDm({
        narrazione: 'Ti aggrappi al cornicione bagnato e cerchi un appiglio.',
        richiesta_tiro: {
          serve: true,
          notazione: '1d20',
          caratteristica: 'destrezza',
          competenza: true,
          cd: 14,
          vantaggio: 'nessuno',
          motivo: 'Scalare il muro della torre',
        },
        aggiornamenti_mondo: [{ percorso: 'luoghi.duenpietre.visitato', valore: 'si' }],
        nuove_entita: [
          { categoria: 'png', nome: 'Sentinella Orla', descrizione: 'Guardia annoiata', dati: '{}' },
        ],
      }),
    );
    const azione = await chiama(env, 'POST', `/campaigns/${campaignId}/action`, {
      azione: 'Scalo il muro della torre approfittando del buio.',
    });
    expect(azione.stato).toBe(200);

    const tiroRichiesto = azione.dati.turno.richiestaTiro;
    expect(tiroRichiesto).not.toBeNull();
    // destrezza 16 (+3) + competenza livello 1 (+2) = +5, calcolato dal backend
    expect(tiroRichiesto.modificatore).toBe(5);
    expect(tiroRichiesto.cd).toBe(14);
    expect(azione.dati.turno.effetti.aggiornamentiMondo).toBe(1);

    // Il PNG introdotto dall'AI è finito nell'ambientazione.
    const npc = await chiama(env, 'GET', '/settings/set_terre_spezzate/npcs');
    expect(npc.dati.npc.map((n: any) => n.nome)).toContain('Sentinella Orla');

    // 5. Tiro: il numero nasce nel backend, il DM ne narra l'esito
    coda.push(
      rispostaDm({
        narrazione: 'Superi il cornicione e ti ritrovi sul tetto.',
        xp_assegnati: 75,
        danni_subiti: 3,
      }),
    );
    const tiro = await chiama(env, 'POST', `/campaigns/${campaignId}/roll`, {
      notazione: tiroRichiesto.notazione,
      caratteristica: tiroRichiesto.caratteristica,
      competenza: tiroRichiesto.competenza,
      cd: tiroRichiesto.cd,
      vantaggio: tiroRichiesto.vantaggio,
      motivo: tiroRichiesto.motivo,
    });
    expect(tiro.stato).toBe(200);
    expect(tiro.dati.turno.tiro.modificatore).toBe(5);
    expect(tiro.dati.turno.tiro.totale).toBeGreaterThanOrEqual(6);
    expect(tiro.dati.turno.tiro.totale).toBeLessThanOrEqual(25);
    expect(typeof tiro.dati.turno.tiro.successo).toBe('boolean');
    expect(tiro.dati.turno.effetti.xpGuadagnati).toBe(75);
    expect(tiro.dati.turno.effetti.pf).toBe(9);
    expect(tiro.dati.turno.personaggio.xp).toBe(75);

    // 6. Il log di sessione contiene tutto, in ordine
    const stato = await chiama(env, 'GET', `/campaigns/${campaignId}`);
    const tipi = stato.dati.eventi.map((e: any) => e.tipo);
    expect(tipi).toEqual([
      'narrazione',
      'azione',
      'narrazione',
      'richiesta_tiro',
      'tiro',
      'narrazione',
    ]);
    expect(stato.dati.campagna.world_state).toEqual({ luoghi: { duenpietre: { visitato: 'si' } } });

    // 7. Chiusura sessione: genera il delta di riassunto
    coda.push('Kaela raggiunse Duenpietre sotto la pioggia e scalò la torre.');
    const chiusura = await chiama(env, 'POST', `/campaigns/${campaignId}/end-session`);
    expect(chiusura.stato).toBe(200);
    expect(chiusura.dati.memoria.delta).toContain('Duenpietre');
    expect(chiusura.dati.memoria.consolidato).toBeNull();

    const riassunto = await chiama(env, 'GET', `/campaigns/${campaignId}/summary`);
    expect(riassunto.dati.riassunto).toContain('Kaela');
  });

  it('consolida il riassunto dopo N sessioni', async () => {
    const env = creaEnv(db, []); // CONSOLIDA_OGNI_N_SESSIONI = 2
    const pg = await chiama(env, 'POST', '/characters', {
      setting_id: 'set_terre_spezzate',
      nome: 'Torv',
      classe: 'guerriero',
    });
    const camp = await chiama(env, 'POST', '/campaigns', {
      character_id: pg.dati.personaggio.id,
      nome: 'Prova memoria',
    });
    const id = camp.dati.campagna.id;

    for (const n of [1, 2]) {
      coda.push(rispostaDm({ narrazione: `Sessione ${n}.` }));
      await chiama(env, 'POST', n === 1 ? `/campaigns/${id}/start` : `/campaigns/${id}/action`, {
        azione: 'Proseguo.',
      });
      coda.push(`Delta della sessione ${n}.`);
      if (n === 2) coda.push('Cronaca consolidata di Torv.');
      const chiusura = await chiama(env, 'POST', `/campaigns/${id}/end-session`);
      expect(chiusura.dati.memoria.consolidato).toBe(n === 2 ? 'Cronaca consolidata di Torv.' : null);
    }

    const riassunto = await chiama(env, 'GET', `/campaigns/${id}/summary`);
    // Dopo il consolidamento resta una sola versione: i delta inglobati spariscono.
    expect(riassunto.dati.versioni).toHaveLength(1);
    expect(riassunto.dati.riassunto).toBe('Cronaca consolidata di Torv.');
  });

  it('isola le storie fra utenti diversi', async () => {
    const env = creaEnv(db, []);
    const pg = await chiama(env, 'POST', '/characters', {
      setting_id: 'set_terre_spezzate',
      nome: 'Mio',
    });

    const altro = await worker.fetch(
      new Request(`https://test.local/characters/${pg.dati.personaggio.id}`, {
        headers: { 'x-utente-id': 'un-altro-utente' },
      }),
      env,
    );
    expect(altro.status).toBe(403);

    const listaAltro = await worker.fetch(
      new Request('https://test.local/characters', {
        headers: { 'x-utente-id': 'un-altro-utente' },
      }),
      env,
    );
    expect((await listaAltro.json() as any).personaggi).toHaveLength(0);
  });

  it('valida gli input delle rotte', async () => {
    const env = creaEnv(db, []);
    expect((await chiama(env, 'POST', '/characters', { nome: 'Senza setting' })).stato).toBe(400);
    expect(
      (await chiama(env, 'POST', '/characters', { setting_id: 'inesistente', nome: 'X' })).stato,
    ).toBe(404);
    expect((await chiama(env, 'POST', '/dice/roll', { notazione: 'boh' })).stato).toBe(400);

    const buono = await chiama(env, 'POST', '/dice/roll', { notazione: '2d6+1' });
    expect(buono.dati.tiro.totale).toBeGreaterThanOrEqual(3);
    expect(buono.dati.tiro.totale).toBeLessThanOrEqual(13);
  });

  it('tira le statistiche con 4d6 scarta il peggiore', async () => {
    const env = creaEnv(db, []);
    const res = await chiama(env, 'POST', '/characters/roll-stats');
    const valori = Object.values(res.dati.statistiche) as number[];
    expect(valori).toHaveLength(6);
    for (const v of valori) {
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(18);
    }
  });
});
