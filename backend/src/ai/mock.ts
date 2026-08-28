import type { ProviderAi, RichiestaAi, RispostaAi, SchemaJson } from './provider';

/**
 * Provider deterministico per test e sviluppo locale senza chiave API.
 * Produce un JSON conforme allo schema richiesto riempiendolo di segnaposto,
 * così il resto della pipeline può essere esercitato per intero.
 */
export class MockProvider implements ProviderAi {
  readonly nome = 'mock';

  constructor(private readonly risposte: string[] = []) {}

  private indice = 0;

  async chiamaAI(richiesta: RichiestaAi): Promise<RispostaAi> {
    const precotta = this.risposte[this.indice];
    if (precotta !== undefined) {
      this.indice++;
      return {
        testo: precotta,
        json: richiesta.schema ? JSON.parse(precotta) : undefined,
        provider: this.nome,
        modello: 'mock',
      };
    }

    if (richiesta.schema) {
      const valore = segnaposto(richiesta.schema, richiesta);
      const testo = JSON.stringify(valore);
      return { testo, json: valore, provider: this.nome, modello: 'mock' };
    }

    const ultimo = richiesta.messaggi.at(-1)?.testo ?? '';
    return {
      testo: `[mock] ${ultimo.slice(0, 200)}`,
      provider: this.nome,
      modello: 'mock',
    };
  }
}

function segnaposto(schema: SchemaJson, richiesta: RichiestaAi): unknown {
  switch (schema.tipo) {
    case 'stringa':
      return schema.enum?.[0] ?? testoNarrativo(richiesta);
    case 'numero':
      return 0;
    case 'booleano':
      return false;
    case 'array':
      return [];
    case 'oggetto': {
      const out: Record<string, unknown> = {};
      for (const nome of schema.obbligatorie ?? Object.keys(schema.proprieta)) {
        const prop = schema.proprieta[nome];
        if (prop) out[nome] = segnaposto(prop, richiesta);
      }
      return out;
    }
  }
}

function testoNarrativo(richiesta: RichiestaAi): string {
  const azione = richiesta.messaggi.at(-1)?.testo ?? '';
  return `Il mondo reagisce. (mock) ${azione.slice(0, 120)}`;
}
