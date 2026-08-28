/**
 * Motore dei dadi.
 *
 * Il numero viene SEMPRE generato qui, mai dall'AI: l'AI si limita a chiedere
 * un tiro (notazione + motivo) e a narrare l'esito che le restituiamo. Questo
 * tiene i tiri dentro le regole e, quando arriverà il multiplayer, garantisce
 * che tutti i partecipanti vedano lo stesso risultato.
 */

export type Vantaggio = 'nessuno' | 'vantaggio' | 'svantaggio';

export interface NotazioneDado {
  /** Quanti dadi tirare, es. 2 in "2d6+3". */
  quantita: number;
  /** Facce del dado, es. 6 in "2d6+3". */
  facce: number;
  /** Modificatore fisso, es. +3 in "2d6+3". */
  modificatore: number;
  /** Tieni i migliori N (kh) o i peggiori N (kl); null = tieni tutto. */
  tieni: { modo: 'alti' | 'bassi'; quanti: number } | null;
}

export interface RisultatoTiro {
  notazione: string;
  tirati: number[];
  /** Dadi scartati da una clausola kh/kl o da vantaggio/svantaggio. */
  scartati: number[];
  modificatore: number;
  totale: number;
  vantaggio: Vantaggio;
  /** Solo per il d20 singolo: 20 naturale / 1 naturale. */
  critico: boolean;
  fallimentoCritico: boolean;
  /** Presente solo se il tiro aveva una difficoltà da battere. */
  cd: number | null;
  successo: boolean | null;
}

/** Sorgente di casualità, iniettabile per rendere i test deterministici. */
export type Rng = () => number;

export const rngCrypto: Rng = () => {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  // 2**32 = 4294967296
  return buf[0]! / 4294967296;
};

const RE_NOTAZIONE = /^\s*(\d*)\s*d\s*(\d+)\s*(?:k([hl])\s*(\d+))?\s*([+-]\s*\d+)?\s*$/i;

export class ErroreNotazione extends Error {}

export function parseNotazione(input: string): NotazioneDado {
  const m = RE_NOTAZIONE.exec(input);
  if (!m) throw new ErroreNotazione(`Notazione dado non valida: "${input}"`);

  const quantita = m[1] === '' || m[1] === undefined ? 1 : Number(m[1]);
  const facce = Number(m[2]);
  const modificatore = m[5] ? Number(m[5].replace(/\s+/g, '')) : 0;

  if (quantita < 1 || quantita > 100) {
    throw new ErroreNotazione(`Numero di dadi fuori range (1-100): ${quantita}`);
  }
  if (facce < 2 || facce > 1000) {
    throw new ErroreNotazione(`Numero di facce fuori range (2-1000): ${facce}`);
  }

  let tieni: NotazioneDado['tieni'] = null;
  if (m[3]) {
    const quanti = Number(m[4]);
    if (quanti < 1 || quanti > quantita) {
      throw new ErroreNotazione(`Clausola k${m[3]}${m[4]} incompatibile con ${quantita} dadi`);
    }
    tieni = { modo: m[3].toLowerCase() === 'h' ? 'alti' : 'bassi', quanti };
  }

  return { quantita, facce, modificatore, tieni };
}

function tiraSingolo(facce: number, rng: Rng): number {
  return Math.floor(rng() * facce) + 1;
}

export interface OpzioniTiro {
  vantaggio?: Vantaggio;
  /** Classe difficoltà da battere; il totale deve essere >= cd. */
  cd?: number | null;
  rng?: Rng;
}

export function tira(notazione: string, opzioni: OpzioniTiro = {}): RisultatoTiro {
  const { quantita, facce, modificatore, tieni } = parseNotazione(notazione);
  const rng = opzioni.rng ?? rngCrypto;
  const vantaggio = opzioni.vantaggio ?? 'nessuno';
  const cd = opzioni.cd ?? null;

  // Vantaggio/svantaggio ha senso solo sul singolo d20, come nel ruleset base.
  const applicaVantaggio = vantaggio !== 'nessuno' && quantita === 1 && facce === 20 && !tieni;

  let tirati: number[];
  let scartati: number[] = [];

  if (applicaVantaggio) {
    const a = tiraSingolo(20, rng);
    const b = tiraSingolo(20, rng);
    const scelto = vantaggio === 'vantaggio' ? Math.max(a, b) : Math.min(a, b);
    const altro = scelto === a ? b : a;
    tirati = [scelto];
    scartati = [altro];
  } else {
    const tutti = Array.from({ length: quantita }, () => tiraSingolo(facce, rng));
    if (tieni) {
      const ordinati = [...tutti].sort((x, y) => (tieni.modo === 'alti' ? y - x : x - y));
      tirati = ordinati.slice(0, tieni.quanti);
      scartati = ordinati.slice(tieni.quanti);
    } else {
      tirati = tutti;
    }
  }

  const somma = tirati.reduce((acc, n) => acc + n, 0);
  const totale = somma + modificatore;

  const d20Singolo = facce === 20 && tirati.length === 1;
  const naturale = tirati[0];

  return {
    notazione,
    tirati,
    scartati,
    modificatore,
    totale,
    vantaggio: applicaVantaggio ? vantaggio : 'nessuno',
    critico: d20Singolo && naturale === 20,
    fallimentoCritico: d20Singolo && naturale === 1,
    cd,
    // Un 20 naturale passa sempre, un 1 naturale fallisce sempre.
    successo:
      cd === null
        ? null
        : d20Singolo && naturale === 20
          ? true
          : d20Singolo && naturale === 1
            ? false
            : totale >= cd,
  };
}
