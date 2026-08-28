import {
  ErroreAi,
  estraiJson,
  type MessaggioAi,
  type ProviderAi,
  type RichiestaAi,
  type RispostaAi,
  type SchemaJson,
} from './provider';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/** Traduce il nostro schema nel dialetto OpenAPI accettato da Gemini. */
export function schemaGemini(schema: SchemaJson): Record<string, unknown> {
  switch (schema.tipo) {
    case 'stringa':
      return { type: 'STRING', ...(schema.enum ? { enum: schema.enum } : {}) };
    case 'numero':
      return { type: 'NUMBER' };
    case 'booleano':
      return { type: 'BOOLEAN' };
    case 'array':
      return { type: 'ARRAY', items: schemaGemini(schema.elementi) };
    case 'oggetto': {
      const properties: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.proprieta)) properties[k] = schemaGemini(v);
      return {
        type: 'OBJECT',
        properties,
        ...(schema.obbligatorie?.length ? { required: schema.obbligatorie } : {}),
      };
    }
  }
}

function contenuti(messaggi: MessaggioAi[]) {
  return messaggi.map((m) => ({
    role: m.ruolo === 'utente' ? 'user' : 'model',
    parts: [{ text: m.testo }],
  }));
}

export interface OpzioniGemini {
  apiKey: string;
  modello: string;
  /** Iniettabile nei test. */
  fetchImpl?: typeof fetch;
  tentativi?: number;
}

export class GeminiProvider implements ProviderAi {
  readonly nome = 'gemini';
  private readonly fetchImpl: typeof fetch;
  private readonly tentativi: number;

  constructor(private readonly opzioni: OpzioniGemini) {
    if (!opzioni.apiKey) throw new ErroreAi('GEMINI_API_KEY mancante');
    this.fetchImpl = opzioni.fetchImpl ?? fetch;
    this.tentativi = opzioni.tentativi ?? 3;
  }

  async chiamaAI(richiesta: RichiestaAi): Promise<RispostaAi> {
    const body: Record<string, unknown> = {
      systemInstruction: { parts: [{ text: richiesta.sistema }] },
      contents: contenuti(richiesta.messaggi),
      generationConfig: {
        temperature: richiesta.temperatura ?? 0.9,
        maxOutputTokens: richiesta.maxToken ?? 2048,
        ...(richiesta.schema
          ? {
              responseMimeType: 'application/json',
              responseSchema: schemaGemini(richiesta.schema),
            }
          : {}),
      },
      // Il gioco contiene violenza narrativa: senza allentare i filtri il DM
      // si blocca su scene di combattimento del tutto ordinarie.
      safetySettings: [
        'HARM_CATEGORY_HARASSMENT',
        'HARM_CATEGORY_HATE_SPEECH',
        'HARM_CATEGORY_SEXUALLY_EXPLICIT',
        'HARM_CATEGORY_DANGEROUS_CONTENT',
      ].map((category) => ({ category, threshold: 'BLOCK_ONLY_HIGH' })),
    };

    const url = `${BASE_URL}/${encodeURIComponent(this.opzioni.modello)}:generateContent`;
    let ultimoErrore: ErroreAi | null = null;

    for (let tentativo = 0; tentativo < this.tentativi; tentativo++) {
      if (tentativo > 0) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** (tentativo - 1)));
      }
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-goog-api-key': this.opzioni.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const dettaglio = await res.text().catch(() => '');
          // 429 = quota del free tier, 5xx = problema transitorio.
          const ritentabile = res.status === 429 || res.status >= 500;
          ultimoErrore = new ErroreAi(
            `Gemini ha risposto ${res.status}: ${dettaglio.slice(0, 300)}`,
            res.status,
            ritentabile,
          );
          if (!ritentabile) throw ultimoErrore;
          continue;
        }

        const dati = (await res.json()) as GeminiRisposta;
        const testo = testoDaRisposta(dati);
        return {
          testo,
          json: richiesta.schema ? estraiJson(testo) : undefined,
          provider: this.nome,
          modello: this.opzioni.modello,
        };
      } catch (err) {
        if (err instanceof ErroreAi && !err.ritentabile) throw err;
        ultimoErrore =
          err instanceof ErroreAi
            ? err
            : new ErroreAi(`Chiamata a Gemini fallita: ${(err as Error).message}`, undefined, true);
      }
    }

    throw ultimoErrore ?? new ErroreAi('Chiamata a Gemini fallita');
  }
}

interface GeminiRisposta {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

function testoDaRisposta(dati: GeminiRisposta): string {
  if (dati.promptFeedback?.blockReason) {
    throw new ErroreAi(`Prompt bloccato da Gemini: ${dati.promptFeedback.blockReason}`);
  }
  const candidato = dati.candidates?.[0];
  const testo = candidato?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!testo.trim()) {
    throw new ErroreAi(
      `Risposta vuota dal modello (finishReason: ${candidato?.finishReason ?? 'ignoto'})`,
      undefined,
      candidato?.finishReason === 'MAX_TOKENS' ? false : true,
    );
  }
  return testo;
}
