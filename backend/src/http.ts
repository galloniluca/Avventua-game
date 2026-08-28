/** Helper HTTP: risposte JSON, errori tipizzati, CORS, validazione input. */

export class ErroreHttp extends Error {
  constructor(
    readonly stato: number,
    message: string,
    readonly dettagli?: unknown,
  ) {
    super(message);
    this.name = 'ErroreHttp';
  }
}

export const nonTrovato = (cosa: string) => new ErroreHttp(404, `${cosa} non trovato`);
export const richiestaNonValida = (msg: string, dettagli?: unknown) =>
  new ErroreHttp(400, msg, dettagli);

const HEADER_CORS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'access-control-allow-headers': 'content-type,x-utente-id',
  'access-control-max-age': '86400',
};

export function json(dati: unknown, stato = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(dati), {
    status: stato,
    headers: { 'content-type': 'application/json; charset=utf-8', ...HEADER_CORS, ...headers },
  });
}

export function rispostaErrore(err: unknown): Response {
  if (err instanceof ErroreHttp) {
    return json({ errore: err.message, dettagli: err.dettagli ?? null }, err.stato);
  }
  const messaggio = err instanceof Error ? err.message : 'Errore sconosciuto';
  console.error('Errore non gestito:', err);
  return json({ errore: messaggio }, 500);
}

export function rispostaPreflight(): Response {
  return new Response(null, { status: 204, headers: HEADER_CORS });
}

export async function leggiBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    throw richiestaNonValida('Corpo della richiesta non è JSON valido');
  }
  if (!corpo || typeof corpo !== 'object' || Array.isArray(corpo)) {
    throw richiestaNonValida('Il corpo deve essere un oggetto JSON');
  }
  return corpo as T;
}

export function campoStringa(
  corpo: Record<string, unknown>,
  nome: string,
  opzioni: { obbligatorio?: boolean; max?: number; default?: string } = {},
): string {
  const v = corpo[nome];
  if (v === undefined || v === null || v === '') {
    if (opzioni.obbligatorio) throw richiestaNonValida(`Campo "${nome}" obbligatorio`);
    return opzioni.default ?? '';
  }
  if (typeof v !== 'string') throw richiestaNonValida(`Campo "${nome}" deve essere una stringa`);
  const max = opzioni.max ?? 4000;
  if (v.length > max) throw richiestaNonValida(`Campo "${nome}" supera ${max} caratteri`);
  return v;
}

export function campoEnum<T extends string>(
  corpo: Record<string, unknown>,
  nome: string,
  ammessi: readonly T[],
  def: T,
): T {
  const v = corpo[nome];
  if (v === undefined || v === null || v === '') return def;
  if (typeof v !== 'string' || !ammessi.includes(v as T)) {
    throw richiestaNonValida(`Campo "${nome}" deve essere uno di: ${ammessi.join(', ')}`);
  }
  return v as T;
}

/** Identificazione utente: in v1 è un header, non c'è ancora autenticazione. */
export function utenteDaRichiesta(req: Request): string {
  const id = req.headers.get('x-utente-id')?.trim();
  if (!id) throw new ErroreHttp(401, 'Header x-utente-id mancante');
  if (id.length > 128) throw richiestaNonValida('x-utente-id troppo lungo');
  return id;
}

export function nuovoId(prefisso: string): string {
  return `${prefisso}_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`;
}
