import { describe, expect, it, vi } from 'vitest';
import { GeminiProvider, schemaGemini } from '../src/ai/gemini';
import { MockProvider } from '../src/ai/mock';
import { ErroreAi, estraiJson } from '../src/ai/provider';
import { SCHEMA_RISPOSTA_DM } from '../src/prompts/contract';

function rispostaOk(testo: string): Response {
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: testo }] } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('schemaGemini', () => {
  it('traduce lo schema del DM nel dialetto OpenAPI', () => {
    const s = schemaGemini(SCHEMA_RISPOSTA_DM) as Record<string, unknown>;
    expect(s.type).toBe('OBJECT');
    const props = s.properties as Record<string, Record<string, unknown>>;
    expect(props.narrazione?.type).toBe('STRING');
    expect(props.xp_assegnati?.type).toBe('NUMBER');
    expect(props.nuove_entita?.type).toBe('ARRAY');
    expect(s.required).toContain('narrazione');
  });

  it('propaga gli enum', () => {
    const s = schemaGemini({ tipo: 'stringa', enum: ['a', 'b'] }) as Record<string, unknown>;
    expect(s.enum).toEqual(['a', 'b']);
  });
});

describe('estraiJson', () => {
  it('legge JSON nudo', () => {
    expect(estraiJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('sopravvive ai blocchi markdown', () => {
    expect(estraiJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('recupera l\'oggetto da testo con contorno', () => {
    expect(estraiJson('Ecco a te: {"a":1} spero vada bene')).toEqual({ a: 1 });
  });

  it('fallisce su testo senza JSON', () => {
    expect(() => estraiJson('nessun json qui')).toThrow(ErroreAi);
  });
});

describe('GeminiProvider', () => {
  it('invia systemInstruction, contenuti e responseSchema', async () => {
    const fetchImpl = vi.fn(async () => rispostaOk('{"narrazione":"ok"}'));
    const provider = new GeminiProvider({
      apiKey: 'k',
      modello: 'gemini-2.0-flash',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const risposta = await provider.chiamaAI({
      sistema: 'sei il DM',
      messaggi: [{ ruolo: 'utente', testo: 'apro la porta' }],
      schema: { tipo: 'oggetto', proprieta: { narrazione: { tipo: 'stringa' } }, obbligatorie: ['narrazione'] },
    });

    expect(risposta.json).toEqual({ narrazione: 'ok' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('gemini-2.0-flash:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('sei il DM');
    expect(body.contents[0].role).toBe('user');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('ritenta sui 429 del free tier e poi riesce', async () => {
    let chiamate = 0;
    const fetchImpl = vi.fn(async () => {
      chiamate++;
      return chiamate === 1 ? new Response('quota', { status: 429 }) : rispostaOk('va bene');
    });
    const provider = new GeminiProvider({
      apiKey: 'k',
      modello: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const risposta = await provider.chiamaAI({ sistema: 's', messaggi: [] });
    expect(risposta.testo).toBe('va bene');
    expect(chiamate).toBe(2);
  });

  it('non ritenta sugli errori definitivi', async () => {
    const fetchImpl = vi.fn(async () => new Response('chiave errata', { status: 401 }));
    const provider = new GeminiProvider({
      apiKey: 'k',
      modello: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(provider.chiamaAI({ sistema: 's', messaggi: [] })).rejects.toThrow(ErroreAi);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('segnala un prompt bloccato dai filtri', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }), { status: 200 }),
    );
    const provider = new GeminiProvider({
      apiKey: 'k',
      modello: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      tentativi: 1,
    });

    await expect(provider.chiamaAI({ sistema: 's', messaggi: [] })).rejects.toThrow(/SAFETY/);
  });

  it('rifiuta la costruzione senza chiave API', () => {
    expect(() => new GeminiProvider({ apiKey: '', modello: 'm' })).toThrow(ErroreAi);
  });
});

  it('non invoca fetch con l\'istanza come `this` (workerd la rifiuta)', async () => {
    // Regressione: this.fetchImpl(...) passava il provider come `this` e in
    // produzione falliva con "Illegal invocation". I mock di vitest sono
    // tolleranti, quindi qui si controlla direttamente il `this` ricevuto.
    let thisRicevuto: unknown = 'mai chiamata';
    const fetchImpl = function (this: unknown) {
      thisRicevuto = this;
      return Promise.resolve(rispostaOk('ok'));
    };
    const p = new GeminiProvider({
      apiKey: 'k',
      modello: 'm',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await p.chiamaAI({ sistema: 's', messaggi: [] });
    expect(thisRicevuto).not.toBe(p);
  });

describe('MockProvider', () => {
  it('genera un JSON conforme allo schema del DM', async () => {
    const risposta = await new MockProvider().chiamaAI({
      sistema: 's',
      messaggi: [{ ruolo: 'utente', testo: 'esploro' }],
      schema: SCHEMA_RISPOSTA_DM,
    });
    const json = risposta.json as Record<string, unknown>;
    expect(typeof json.narrazione).toBe('string');
    expect(json.aggiornamenti_mondo).toEqual([]);
    expect(json.xp_assegnati).toBe(0);
  });

  it('restituisce le risposte precotte in ordine', async () => {
    const provider = new MockProvider(['{"a":1}', '{"a":2}']);
    const uno = await provider.chiamaAI({ sistema: '', messaggi: [], schema: { tipo: 'numero' } });
    const due = await provider.chiamaAI({ sistema: '', messaggi: [], schema: { tipo: 'numero' } });
    expect(uno.json).toEqual({ a: 1 });
    expect(due.json).toEqual({ a: 2 });
  });
});
