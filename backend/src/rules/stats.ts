/** Caratteristiche e derivate del ruleset D&D-like. */

export const CARATTERISTICHE = [
  'forza',
  'destrezza',
  'costituzione',
  'intelligenza',
  'saggezza',
  'carisma',
] as const;

export type Caratteristica = (typeof CARATTERISTICHE)[number];

export type Statistiche = Record<Caratteristica, number>;

export interface StatoPersonaggio {
  pf: number;
  pfMax: number;
  condizioni: string[];
}

/** Modificatore classico: (valore - 10) / 2 arrotondato verso il basso. */
export function modificatore(valore: number): number {
  return Math.floor((valore - 10) / 2);
}

/** Bonus di competenza per livello (1-20). */
export function bonusCompetenza(livello: number): number {
  const l = Math.min(20, Math.max(1, livello));
  return 2 + Math.floor((l - 1) / 4);
}

export function statisticheDefault(): Statistiche {
  return {
    forza: 10,
    destrezza: 10,
    costituzione: 10,
    intelligenza: 10,
    saggezza: 10,
    carisma: 10,
  };
}

/** Normalizza un JSON arbitrario in statistiche valide (8-20 per caratteristica). */
export function normalizzaStatistiche(raw: unknown): Statistiche {
  const base = statisticheDefault();
  if (raw && typeof raw === 'object') {
    const src = raw as Record<string, unknown>;
    for (const c of CARATTERISTICHE) {
      const v = src[c];
      if (typeof v === 'number' && Number.isFinite(v)) {
        base[c] = Math.min(20, Math.max(1, Math.round(v)));
      }
    }
  }
  return base;
}

/** Punti ferita massimi: dado vita medio per livello + modificatore costituzione. */
export function pfMassimi(livello: number, dadoVita: number, cost: number): number {
  const mod = modificatore(cost);
  const primoLivello = dadoVita + mod;
  const perLivello = Math.floor(dadoVita / 2) + 1 + mod;
  return Math.max(1, primoLivello + Math.max(0, livello - 1) * perLivello);
}

/** Dado vita per classe; sconosciute -> d8. */
export function dadoVitaPerClasse(classe: string): number {
  const c = classe.trim().toLowerCase();
  if (['mago', 'stregone', 'wizard', 'sorcerer'].includes(c)) return 6;
  if (['barbaro', 'barbarian'].includes(c)) return 12;
  if (
    ['guerriero', 'paladino', 'ranger', 'fighter', 'paladin'].includes(c)
  ) {
    return 10;
  }
  return 8;
}

/** Bonus a un tiro di caratteristica, con competenza opzionale. */
export function bonusTiro(
  stats: Statistiche,
  caratteristica: Caratteristica,
  livello: number,
  competente = false,
): number {
  return modificatore(stats[caratteristica]) + (competente ? bonusCompetenza(livello) : 0);
}
