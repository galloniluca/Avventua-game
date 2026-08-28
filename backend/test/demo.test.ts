import { describe, expect, it } from 'vitest';
import { DemoProvider } from '../src/ai/demo';
import { SCHEMA_RISPOSTA_DM, normalizzaRispostaDm } from '../src/prompts/contract';

/** Il DM di prova deve rispettare lo stesso contratto di quello vero. */
async function chiedi(provider: DemoProvider, testo: string) {
  const risposta = await provider.chiamaAI({
    sistema: 'DM',
    messaggi: [{ ruolo: 'utente', testo }],
    schema: SCHEMA_RISPOSTA_DM,
  });
  return normalizzaRispostaDm(risposta.json);
}

describe('DemoProvider', () => {
  it('apre la campagna senza chiedere tiri', async () => {
    const dm = await chiedi(new DemoProvider(), 'Apri la campagna "Prova".');
    expect(dm.narrazione).toContain('Duenpietre');
    expect(dm.richiesta_tiro).toBeNull();
  });

  it('rimanda indietro l\'azione del giocatore', async () => {
    const dm = await chiedi(new DemoProvider(), 'Kaela agisce: apro la porta');
    expect(dm.narrazione).toContain('apro la porta');
  });

  it('chiede un tiro valido ogni tre turni', async () => {
    const provider = new DemoProvider();
    const richieste = [];
    for (let i = 0; i < 6; i++) {
      richieste.push((await chiedi(provider, 'Tizio agisce: proseguo')).richiesta_tiro);
    }
    const conTiro = richieste.filter((r) => r !== null);
    expect(conTiro).toHaveLength(2);
    for (const tiro of conTiro) {
      expect(tiro!.notazione).toBe('1d20');
      expect(tiro!.cd).toBeGreaterThan(0);
      expect(tiro!.motivo).not.toBe('');
    }
  });

  it('narra successi e fallimenti in modo diverso', async () => {
    const provider = new DemoProvider();
    const ok = await chiedi(provider, 'Risultato del tiro: 1d20 [15] = 15 — SUCCESSO (CD 12)');
    const ko = await chiedi(provider, 'Risultato del tiro: 1d20 [4] = 4 — FALLIMENTO (CD 12)');
    const critico = await chiedi(provider, 'Risultato del tiro: 1d20 [20] = 20 — 20 naturale!');

    expect(ok.xp_assegnati).toBeGreaterThan(0);
    expect(ko.danni_subiti).toBeGreaterThan(0);
    expect(critico.xp_assegnati).toBeGreaterThan(ok.xp_assegnati);
    expect(ok.narrazione).not.toBe(ko.narrazione);
  });

  it('produce testo semplice per delta, consolidamento e racconto', async () => {
    const provider = new DemoProvider();
    for (const prompt of ['Scrivi il paragrafo', 'Riscrivi il consolidato', 'Scrivi il racconto']) {
      const r = await provider.chiamaAI({ sistema: 's', messaggi: [{ ruolo: 'utente', testo: prompt }] });
      expect(r.testo.length).toBeGreaterThan(20);
      expect(r.json).toBeUndefined();
    }
  });
});
