import {
  ErroreAi,
  estraiJson,
  type MessaggioAi,
  type ProviderAi,
  type RichiestaAi,
  type RispostaAi,
  type SchemaJson,
} from './provider';

/**
 * Modello locale via Ollama.
 *
 * Utile per sviluppare e provare senza consumare la quota di Gemini e senza
 * mandare niente fuori dal computer. La qualità narrativa di un modello da 7-8
 * miliardi di parametri resta sotto quella di Gemini Flash, soprattutto in
 * italiano: va bene per verificare che la macchina giri, meno per giudicare
 * come scrive il Dungeon Master.
 */

/** Il nostro schema nel dialetto JSON Schema, che è quello che Ollama accetta. */
export function schemaOllama(schema: SchemaJson): Record<string, unknown> {
  switch (schema.tipo) {
    case 'stringa':
      return { type: 'string', ...(schema.enum ? { enum: schema.enum } : {}) };
    case 'numero':
      return { type: 'number' };
    case 'booleano':
      return { type: 'boolean' };
    case 'array':
      return { type: 'array', items: schemaOllama(schema.elementi) };
    case 'oggetto': {
      const properties: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(schema.proprieta)) properties[k] = schemaOllama(v);
      return {
        type: 'object',
        properties,
        // Ollama segue lo schema alla lettera: senza `required` i modelli
        // piccoli omettono volentieri i campi che non sanno riempire.
        required: schema.obbligatorie ?? Object.keys(schema.proprieta),
      };
    }
  }
}

function messaggi(richiesta: RichiestaAi): Array<{ role: string; content: string }> {
  return [
    { role: 'system', content: richiesta.sistema },
    ...richiesta.messaggi.map((m: MessaggioAi) => ({
      role: m.ruolo === 'utente' ? 'user' : 'assistant',
      content: m.testo,
    })),
  ];
}

export interface OpzioniOllama {
  /** Di default 127.0.0.1 e non localhost: su alcuni sistemi localhost va su ::1. */
  baseUrl: string;
  modello: string;
  /**
   * Finestra di contesto. Il default di Ollama è spesso 2048 token, mentre il
   * prompt del DM (ambientazione + riassunto + eventi + scheda) li supera
   * facilmente: senza alzarla il modello perde l'inizio delle istruzioni e
   * comincia a proporre scelte multiple o a dimenticare lo stato del mondo.
   */
  contesto: number;
  fetchImpl?: typeof fetch;
  tentativi?: number;
}

export class OllamaProvider implements ProviderAi {
  readonly nome = 'ollama';
  private readonly fetchImpl: typeof fetch;
  private readonly tentativi: number;

  constructor(private readonly opzioni: OpzioniOllama) {
    // workerd rifiuta fetch invocata con un `this` diverso dal global: chiamare
    // this.fetchImpl(...) le passerebbe l'istanza e fallirebbe con "Illegal
    // invocation". Si lega una volta sola qui, alla costruzione.
    this.fetchImpl = (opzioni.fetchImpl ?? fetch).bind(globalThis);
    this.tentativi = opzioni.tentativi ?? 2;
  }

  async chiamaAI(richiesta: RichiestaAi): Promise<RispostaAi> {
    const body = {
      model: this.opzioni.modello,
      messages: messaggi(richiesta),
      stream: false,
      ...(richiesta.schema ? { format: schemaOllama(richiesta.schema) } : {}),
      options: {
        temperature: richiesta.temperatura ?? 0.9,
        num_predict: richiesta.maxToken ?? 2048,
        num_ctx: this.opzioni.contesto,
      },
      // Tiene il modello in memoria fra un turno e l'altro: senza, ogni
      // chiamata paga di nuovo il caricamento dei pesi.
      keep_alive: '10m',
    };

    const url = `${this.opzioni.baseUrl.replace(/\/+$/, '')}/api/chat`;
    let ultimoErrore: ErroreAi | null = null;

    for (let tentativo = 0; tentativo < this.tentativi; tentativo++) {
      if (tentativo > 0) await new Promise((r) => setTimeout(r, 500));

      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const dettaglio = await res.text().catch(() => '');
          if (res.status === 404 && /model/i.test(dettaglio)) {
            throw new ErroreAi(
              `Ollama non ha il modello "${this.opzioni.modello}". Scaricalo con: ollama pull ${this.opzioni.modello}`,
              404,
            );
          }
          const ritentabile = res.status >= 500;
          ultimoErrore = new ErroreAi(
            `Ollama ha risposto ${res.status}: ${dettaglio.slice(0, 300)}`,
            res.status,
            ritentabile,
          );
          if (!ritentabile) throw ultimoErrore;
          continue;
        }

        const dati = (await res.json()) as OllamaRisposta;
        if (dati.error) throw new ErroreAi(`Ollama: ${dati.error}`);

        const testo = dati.message?.content ?? '';
        if (!testo.trim()) {
          throw new ErroreAi(
            `Risposta vuota da Ollama (done_reason: ${dati.done_reason ?? 'ignoto'})`,
            undefined,
            true,
          );
        }

        return {
          testo,
          json: richiesta.schema ? estraiJson(testo) : undefined,
          provider: this.nome,
          modello: this.opzioni.modello,
        };
      } catch (err) {
        if (err instanceof ErroreAi && !err.ritentabile) throw err;
        const messaggio = (err as Error).message ?? '';
        // Ollama spento: è l'errore di gran lunga più probabile, vale la pena
        // dirlo con parole utili invece di lasciar passare "fetch failed".
        if (/refused|ECONNREFUSED|fetch failed|Failed to fetch/i.test(messaggio)) {
          throw new ErroreAi(
            `Impossibile contattare Ollama su ${this.opzioni.baseUrl}. È in esecuzione? Prova: ollama serve`,
          );
        }
        ultimoErrore =
          err instanceof ErroreAi
            ? err
            : new ErroreAi(`Chiamata a Ollama fallita: ${messaggio}`, undefined, true);
      }
    }

    throw ultimoErrore ?? new ErroreAi('Chiamata a Ollama fallita');
  }
}

interface OllamaRisposta {
  message?: { role?: string; content?: string };
  done?: boolean;
  done_reason?: string;
  error?: string;
}
