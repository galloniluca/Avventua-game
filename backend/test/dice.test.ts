import { describe, expect, it } from 'vitest';
import { ErroreNotazione, parseNotazione, tira, type Rng } from '../src/rules/dice';

/** RNG deterministico: restituisce a turno i valori normalizzati indicati. */
function rngDa(valori: number[]): Rng {
  let i = 0;
  return () => valori[i++ % valori.length]!;
}

/** Fa uscire esattamente `faccia` su un dado a `facce` facce. */
const esatto = (faccia: number, facce: number) => (faccia - 1) / facce + 1 / (facce * 2);

describe('parseNotazione', () => {
  it('interpreta le notazioni di base', () => {
    expect(parseNotazione('1d20')).toEqual({ quantita: 1, facce: 20, modificatore: 0, tieni: null });
    expect(parseNotazione('2d6+3')).toEqual({ quantita: 2, facce: 6, modificatore: 3, tieni: null });
    expect(parseNotazione('d8-1')).toEqual({ quantita: 1, facce: 8, modificatore: -1, tieni: null });
    expect(parseNotazione(' 3 d 10 + 2 ')).toEqual({
      quantita: 3,
      facce: 10,
      modificatore: 2,
      tieni: null,
    });
  });

  it('interpreta le clausole tieni-migliori/peggiori', () => {
    expect(parseNotazione('4d6kh3').tieni).toEqual({ modo: 'alti', quanti: 3 });
    expect(parseNotazione('2d20kl1').tieni).toEqual({ modo: 'bassi', quanti: 1 });
  });

  it('rifiuta notazioni non valide', () => {
    for (const cattiva of ['', 'venti', '1d', 'd', '0d6', '101d6', '1d1', '4d6kh5', '1d20++2']) {
      expect(() => parseNotazione(cattiva), cattiva).toThrow(ErroreNotazione);
    }
  });
});

describe('tira', () => {
  it('somma dadi e modificatore', () => {
    const r = tira('2d6+3', { rng: rngDa([esatto(4, 6), esatto(5, 6)]) });
    expect(r.tirati).toEqual([4, 5]);
    expect(r.totale).toBe(12);
  });

  it('confronta con la CD', () => {
    const successo = tira('1d20+2', { cd: 15, rng: rngDa([esatto(13, 20)]) });
    expect(successo.totale).toBe(15);
    expect(successo.successo).toBe(true);

    const fallimento = tira('1d20+2', { cd: 16, rng: rngDa([esatto(13, 20)]) });
    expect(fallimento.successo).toBe(false);
  });

  it('tratta il 20 e l\'1 naturali come critici a prescindere dalla CD', () => {
    const critico = tira('1d20-5', { cd: 30, rng: rngDa([esatto(20, 20)]) });
    expect(critico.critico).toBe(true);
    expect(critico.successo).toBe(true);

    const disastro = tira('1d20+20', { cd: 5, rng: rngDa([esatto(1, 20)]) });
    expect(disastro.fallimentoCritico).toBe(true);
    expect(disastro.successo).toBe(false);
  });

  it('applica vantaggio e svantaggio sul d20', () => {
    const vantaggio = tira('1d20', {
      vantaggio: 'vantaggio',
      rng: rngDa([esatto(7, 20), esatto(15, 20)]),
    });
    expect(vantaggio.tirati).toEqual([15]);
    expect(vantaggio.scartati).toEqual([7]);

    const svantaggio = tira('1d20', {
      vantaggio: 'svantaggio',
      rng: rngDa([esatto(7, 20), esatto(15, 20)]),
    });
    expect(svantaggio.tirati).toEqual([7]);
    expect(svantaggio.scartati).toEqual([15]);
  });

  it('ignora vantaggio/svantaggio fuori dal d20 singolo', () => {
    const r = tira('2d6', { vantaggio: 'vantaggio', rng: rngDa([esatto(3, 6), esatto(4, 6)]) });
    expect(r.vantaggio).toBe('nessuno');
    expect(r.tirati).toEqual([3, 4]);
  });

  it('scarta i dadi peggiori con kh', () => {
    const r = tira('4d6kh3', {
      rng: rngDa([esatto(2, 6), esatto(5, 6), esatto(6, 6), esatto(3, 6)]),
    });
    expect(r.tirati).toEqual([6, 5, 3]);
    expect(r.scartati).toEqual([2]);
    expect(r.totale).toBe(14);
  });

  it('resta nei limiti delle facce su 10.000 tiri reali', () => {
    for (let i = 0; i < 10000; i++) {
      const r = tira('1d20');
      expect(r.totale).toBeGreaterThanOrEqual(1);
      expect(r.totale).toBeLessThanOrEqual(20);
    }
  });
});
