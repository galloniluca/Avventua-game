import type { Env } from '../env';
import { DemoProvider } from './demo';
import { GeminiProvider } from './gemini';
import { MockProvider } from './mock';
import type { ProviderAi } from './provider';

export * from './provider';

/** Unico punto in cui si decide quale motore AI sta dietro al DM. */
export function creaProvider(env: Env): ProviderAi {
  const scelta = (env.AI_PROVIDER ?? 'gemini').toLowerCase();
  switch (scelta) {
    case 'mock':
      return new MockProvider();
    case 'demo':
      // Gioco completo senza chiave API: narrazione precotta, meccaniche vere.
      return new DemoProvider();
    case 'gemini':
      return new GeminiProvider({
        apiKey: env.GEMINI_API_KEY,
        modello: env.GEMINI_MODEL ?? 'gemini-2.0-flash',
      });
    default:
      throw new Error(`AI_PROVIDER sconosciuto: ${scelta}`);
  }
}
