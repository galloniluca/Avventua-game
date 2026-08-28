import { describe, expect, it } from 'vitest';
import { normalizzaRispostaDm } from '../src/prompts/contract';
import { applicaAggiornamenti, percorsoValido } from '../src/domain/worldstate';

describe('normalizzaRispostaDm', () => {
  const minima = {
    narrazione: 'La porta cigola.',
    richiesta_tiro: { serve: false },
    aggiornamenti_mondo: [],
    nuove_entita: [],
    xp_assegnati: 0,
    danni_subiti: 0,
    cure_ricevute: 0,
    fine_sessione_suggerita: false,
    campagna_conclusa: false,
  };

  it('accetta una risposta ben formata', () => {
    const r = normalizzaRispostaDm(minima);
    expect(r.narrazione).toBe('La porta cigola.');
    expect(r.richiesta_tiro).toBeNull();
  });

  it('sopravvive a una risposta completamente vuota', () => {
    const r = normalizzaRispostaDm({});
    expect(r.narrazione).toBe('');
    expect(r.richiesta_tiro).toBeNull();
    expect(r.aggiornamenti_mondo).toEqual([]);
    expect(r.xp_assegnati).toBe(0);
  });

  it('ignora una richiesta di tiro senza notazione', () => {
    const r = normalizzaRispostaDm({ ...minima, richiesta_tiro: { serve: true, notazione: '' } });
    expect(r.richiesta_tiro).toBeNull();
  });

  it('normalizza caratteristica e vantaggio fuori dominio', () => {
    const r = normalizzaRispostaDm({
      ...minima,
      richiesta_tiro: {
        serve: true,
        notazione: '1d20',
        caratteristica: 'Destrezza',
        vantaggio: 'super',
        cd: 999,
        competenza: 'si',
        motivo: 'saltare',
      },
    });
    expect(r.richiesta_tiro?.caratteristica).toBe('destrezza');
    expect(r.richiesta_tiro?.vantaggio).toBe('nessuno');
    expect(r.richiesta_tiro?.cd).toBe(40);
    expect(r.richiesta_tiro?.competenza).toBe(false);
  });

  it('rifiuta valori meccanici negativi e li limita in numero', () => {
    const r = normalizzaRispostaDm({
      ...minima,
      xp_assegnati: -50,
      danni_subiti: 3.7,
      aggiornamenti_mondo: Array.from({ length: 50 }, (_, i) => ({
        percorso: `png.tizio${i}.stato`,
        valore: 'vivo',
      })),
      nuove_entita: Array.from({ length: 30 }, () => ({
        categoria: 'mostro',
        nome: 'Ratto',
        descrizione: '',
        dati: '{}',
      })),
    });
    expect(r.xp_assegnati).toBe(0);
    expect(r.danni_subiti).toBe(4);
    expect(r.aggiornamenti_mondo).toHaveLength(20);
    expect(r.nuove_entita).toHaveLength(10);
  });

  it('scarta gli aggiornamenti senza percorso e le entità senza nome', () => {
    const r = normalizzaRispostaDm({
      ...minima,
      aggiornamenti_mondo: [{ percorso: '', valore: 'x' }, { percorso: 'a.b', valore: 'y' }],
      nuove_entita: [{ categoria: 'png', nome: '', descrizione: '', dati: '{}' }],
    });
    expect(r.aggiornamenti_mondo).toHaveLength(1);
    expect(r.nuove_entita).toHaveLength(0);
  });
});

describe('stato del mondo', () => {
  it('accetta percorsi puntati ragionevoli', () => {
    expect(percorsoValido('png.bram.stato')).toBe(true);
    expect(percorsoValido('luoghi.duenpietre.visitato')).toBe(true);
  });

  it('rifiuta percorsi pericolosi o malformati', () => {
    for (const cattivo of ['__proto__.x', 'a.constructor.b', 'a..b', '', 'a.b.c.d.e.f', 'a b.c']) {
      expect(percorsoValido(cattivo), cattivo).toBe(false);
    }
  });

  it('crea i rami mancanti e non muta l\'originale', () => {
    const world = { png: { bram: { stato: 'vivo' } } };
    const esito = applicaAggiornamenti(world, [
      { percorso: 'png.bram.stato', valore: 'morto' },
      { percorso: 'quest.corona.stato', valore: 'aperta' },
    ]);
    expect(esito.applicati).toHaveLength(2);
    expect(esito.world).toEqual({
      png: { bram: { stato: 'morto' } },
      quest: { corona: { stato: 'aperta' } },
    });
    expect(world.png.bram.stato).toBe('vivo');
  });

  it('scarta gli aggiornamenti con percorso non valido', () => {
    const esito = applicaAggiornamenti({}, [{ percorso: '__proto__.polluted', valore: 'si' }]);
    expect(esito.applicati).toHaveLength(0);
    expect(esito.scartati[0]?.motivo).toBe('percorso non valido');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('promuove uno scalare a oggetto invece di perdere il dato', () => {
    const esito = applicaAggiornamenti({ png: 'nessuno' }, [
      { percorso: 'png.bram.stato', valore: 'vivo' },
    ]);
    expect(esito.world).toEqual({ png: { _valore: 'nessuno', bram: { stato: 'vivo' } } });
  });
});
