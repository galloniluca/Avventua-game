import { describe, expect, it, vi } from 'vitest';
import { OllamaProvider, schemaOllama } from '../src/ai/ollama';
import { ErroreAi } from '../src/ai/provider';
import { SCHEMA_RISPOSTA_DM } from '../src/prompts/contract';

function rispostaOk(contenuto: string): Response {
  return new Response(
    JSON.stringify({ message: { role: 'assistant', content: contenuto }, done: true }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

function provider(fetchImpl: unknown, over: Record<string, unknown> = {}) {
  return new OllamaProvider({
    baseUrl: 'http://127.0.0.1:11434',
    modello: 'qwen2.5:7b',
    contesto: 8192,
    fetchImpl: fetchImpl as typeof fetch,
    ...over,
  });
}

describe('schemaOllama', () => {
  it('traduce lo schema del DM in JSON Schema', () => {
    const s = schemaOllama(SCHEMA_RISPOSTA_DM);
    expect(s.type).toBe('object');
    const props = s.properties as Record<string, Record<string, unknown>>;
    expect(props.narrazione?.type).toBe('string');
    expect(props.xp_assegnati?.type).toBe('number');
    expect(props.fine_sessione_suggerita?.type).toBe('boolean');
    expect(props.nuove_entita?.type).toBe('array');
    expect(s.required).toContain('narrazione');
  });

  it('marca obbligatorie tutte le proprietà quando non è detto altrimenti', () => {
    const s = schemaOllama({
      tipo: 'oggetto',
      proprieta: { a: { tipo: 'stringa' }, b: { tipo: 'numero' } },
    });
    expect(s.required).toEqual(['a', 'b']);
  });
});

describe('OllamaProvider', () => {
  it('manda system, messaggi, schema e num_ctx', async () => {
    const fetchImpl = vi.fn(async () => rispostaOk('{"narrazione":"ok"}'));
    const risposta = await provider(fetchImpl).chiamaAI({
      sistema: 'sei il DM',
      messaggi: [{ ruolo: 'utente', testo: 'apro la porta' }],
      schema: { tipo: 'oggetto', proprieta: { narrazione: { tipo: 'stringa' } } },
    });

    expect(risposta.json).toEqual({ narrazione: 'ok' });
    expect(risposta.provider).toBe('ollama');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/chat');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen2.5:7b');
    expect(body.stream).toBe(false);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'sei il DM' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'apro la porta' });
    expect(body.format.type).toBe('object');
    // Il default di Ollama è 2048: il prompt del DM non ci sta.
    expect(body.options.num_ctx).toBe(8192);
  });

  it('omette format quando non serve JSON', async () => {
    const fetchImpl = vi.fn(async () => rispostaOk('un paragrafo di riassunto'));
    const risposta = await provider(fetchImpl).chiamaAI({ sistema: 's', messaggi: [] });

    expect(risposta.testo).toBe('un paragrafo di riassunto');
    expect(risposta.json).toBeUndefined();
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.format).toBeUndefined();
  });

  it('non concatena barre di troppo nell\'URL', async () => {
    const fetchImpl = vi.fn(async () => rispostaOk('ok'));
    await provider(fetchImpl, { baseUrl: 'http://127.0.0.1:11434/' }).chiamaAI({
      sistema: 's',
      messaggi: [],
    });
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toBe('http://127.0.0.1:11434/api/chat');
  });

  it('spiega come scaricare un modello mancante', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('model "qwen2.5:7b" not found, try pulling it first', { status: 404 }),
    );
    await expect(provider(fetchImpl).chiamaAI({ sistema: 's', messaggi: [] })).rejects.toThrow(
      /ollama pull qwen2\.5:7b/,
    );
  });

  it('dice che Ollama è spento invece di lasciar passare "fetch failed"', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(provider(fetchImpl).chiamaAI({ sistema: 's', messaggi: [] })).rejects.toThrow(
      /ollama serve/,
    );
  });

  it('riporta un errore applicativo restituito con stato 200', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: 'context canceled' }), { status: 200 }),
    );
    await expect(provider(fetchImpl).chiamaAI({ sistema: 's', messaggi: [] })).rejects.toThrow(
      ErroreAi,
    );
  });

  it('ritenta sui 5xx e poi riesce', async () => {
    let chiamate = 0;
    const fetchImpl = vi.fn(async () => {
      chiamate++;
      return chiamate === 1 ? new Response('boom', { status: 503 }) : rispostaOk('va bene');
    });
    const risposta = await provider(fetchImpl).chiamaAI({ sistema: 's', messaggi: [] });
    expect(risposta.testo).toBe('va bene');
    expect(chiamate).toBe(2);
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
    const p = provider(fetchImpl);
    await p.chiamaAI({ sistema: 's', messaggi: [] });
    expect(thisRicevuto).not.toBe(p);
  });
});
