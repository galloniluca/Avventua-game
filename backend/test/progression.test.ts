import { describe, expect, it } from 'vitest';
import {
  LIVELLO_MASSIMO,
  XP_MAX_PER_EVENTO,
  assegnaXp,
  livelloPerXp,
  progressoLivello,
  xpProssimoLivello,
} from '../src/rules/progression';
import { bonusCompetenza, modificatore, normalizzaStatistiche, pfMassimi } from '../src/rules/stats';

describe('livelli e XP', () => {
  it('mappa gli XP sul livello corretto', () => {
    expect(livelloPerXp(0)).toBe(1);
    expect(livelloPerXp(299)).toBe(1);
    expect(livelloPerXp(300)).toBe(2);
    expect(livelloPerXp(2700)).toBe(4);
    expect(livelloPerXp(999_999)).toBe(LIVELLO_MASSIMO);
  });

  it('indica la soglia successiva', () => {
    expect(xpProssimoLivello(0)).toBe(300);
    expect(xpProssimoLivello(300)).toBe(900);
    expect(xpProssimoLivello(999_999)).toBeNull();
  });

  it('calcola il progresso verso il livello successivo', () => {
    expect(progressoLivello(0)).toBe(0);
    expect(progressoLivello(150)).toBeCloseTo(0.5);
    expect(progressoLivello(999_999)).toBe(1);
  });

  it('assegna XP e rileva il passaggio di livello', () => {
    const esito = assegnaXp(250, 100);
    expect(esito.xpDopo).toBe(350);
    expect(esito.saliDiLivello).toBe(true);
    expect(esito.livelloDopo).toBe(2);
  });

  it('segnala i livelli con incremento di caratteristica', () => {
    const esito = assegnaXp(2600, 1000);
    expect(esito.livelloDopo).toBe(4);
    expect(esito.incrementiCaratteristica).toEqual([4]);
  });

  it('non permette XP negativi e limita i guadagni per evento', () => {
    expect(assegnaXp(100, -500).xpDopo).toBe(100);
    expect(assegnaXp(0, 999_999).xpDopo).toBe(XP_MAX_PER_EVENTO);
  });
});

describe('statistiche', () => {
  it('calcola i modificatori', () => {
    expect(modificatore(10)).toBe(0);
    expect(modificatore(11)).toBe(0);
    expect(modificatore(8)).toBe(-1);
    expect(modificatore(18)).toBe(4);
  });

  it('calcola il bonus di competenza', () => {
    expect(bonusCompetenza(1)).toBe(2);
    expect(bonusCompetenza(4)).toBe(2);
    expect(bonusCompetenza(5)).toBe(3);
    expect(bonusCompetenza(20)).toBe(6);
  });

  it('normalizza statistiche sporche o parziali', () => {
    const s = normalizzaStatistiche({ forza: 18, destrezza: 'no', carisma: 99 });
    expect(s.forza).toBe(18);
    expect(s.destrezza).toBe(10);
    expect(s.carisma).toBe(20);
    expect(s.saggezza).toBe(10);
  });

  it('calcola i punti ferita massimi', () => {
    expect(pfMassimi(1, 10, 14)).toBe(12);
    expect(pfMassimi(3, 10, 14)).toBe(12 + 2 * 8);
    expect(pfMassimi(5, 6, 6)).toBeGreaterThanOrEqual(1);
  });
});
