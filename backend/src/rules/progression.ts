/** Progressione a punti esperienza: XP -> livello -> statistiche. */

/** Soglie XP cumulative per livello (indice 0 = livello 1). */
export const SOGLIE_XP: readonly number[] = [
  0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000, 85000, 100000, 120000, 140000,
  165000, 195000, 225000, 265000, 305000, 355000,
];

export const LIVELLO_MASSIMO = SOGLIE_XP.length;

export function livelloPerXp(xp: number): number {
  let livello = 1;
  for (let i = 0; i < SOGLIE_XP.length; i++) {
    if (xp >= SOGLIE_XP[i]!) livello = i + 1;
    else break;
  }
  return livello;
}

export function xpProssimoLivello(xp: number): number | null {
  const livello = livelloPerXp(xp);
  if (livello >= LIVELLO_MASSIMO) return null;
  return SOGLIE_XP[livello]!;
}

/** Frazione 0..1 di avanzamento verso il livello successivo (1 se al massimo). */
export function progressoLivello(xp: number): number {
  const livello = livelloPerXp(xp);
  if (livello >= LIVELLO_MASSIMO) return 1;
  const base = SOGLIE_XP[livello - 1]!;
  const prossimo = SOGLIE_XP[livello]!;
  return Math.min(1, Math.max(0, (xp - base) / (prossimo - base)));
}

export interface EsitoXp {
  xpPrima: number;
  xpDopo: number;
  livelloPrima: number;
  livelloDopo: number;
  saliDiLivello: boolean;
  /** Livelli a cui si ottiene un incremento di caratteristica. */
  incrementiCaratteristica: number[];
}

const LIVELLI_ASI = new Set([4, 8, 12, 16, 19]);

/** XP assegnabili in un colpo solo: cap difensivo contro un'AI troppo generosa. */
export const XP_MAX_PER_EVENTO = 1000;

export function assegnaXp(xpAttuali: number, guadagno: number): EsitoXp {
  const delta = Math.max(0, Math.min(XP_MAX_PER_EVENTO, Math.round(guadagno)));
  const xpDopo = xpAttuali + delta;
  const livelloPrima = livelloPerXp(xpAttuali);
  const livelloDopo = livelloPerXp(xpDopo);

  const incrementiCaratteristica: number[] = [];
  for (let l = livelloPrima + 1; l <= livelloDopo; l++) {
    if (LIVELLI_ASI.has(l)) incrementiCaratteristica.push(l);
  }

  return {
    xpPrima: xpAttuali,
    xpDopo,
    livelloPrima,
    livelloDopo,
    saliDiLivello: livelloDopo > livelloPrima,
    incrementiCaratteristica,
  };
}
