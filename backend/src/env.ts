export interface Env {
  DB: D1Database;
  AI_PROVIDER?: string;
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
  OLLAMA_URL?: string;
  OLLAMA_MODEL?: string;
  OLLAMA_NUM_CTX?: string;
  CONSOLIDA_OGNI_N_SESSIONI?: string;
  CONSOLIDA_SOGLIA_CARATTERI?: string;
  FINESTRA_EVENTI_RECENTI?: string;
}

export interface Config {
  consolidaOgniNSessioni: number;
  consolidaSogliaCaratteri: number;
  finestraEventiRecenti: number;
}

function intero(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export function leggiConfig(env: Env): Config {
  return {
    consolidaOgniNSessioni: intero(env.CONSOLIDA_OGNI_N_SESSIONI, 5),
    consolidaSogliaCaratteri: intero(env.CONSOLIDA_SOGLIA_CARATTERI, 6000),
    finestraEventiRecenti: intero(env.FINESTRA_EVENTI_RECENTI, 24),
  };
}
