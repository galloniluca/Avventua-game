/** Router minimale: pattern con segmenti `:nome`, nessuna dipendenza esterna. */

import type { Env } from './env';
import { ErroreHttp, rispostaErrore, rispostaPreflight } from './http';

export interface Contesto {
  req: Request;
  env: Env;
  params: Record<string, string>;
  url: URL;
}

export type Handler = (ctx: Contesto) => Promise<Response>;

interface Rotta {
  metodo: string;
  segmenti: string[];
  handler: Handler;
}

export class Router {
  private rotte: Rotta[] = [];

  aggiungi(metodo: string, pattern: string, handler: Handler): this {
    this.rotte.push({
      metodo,
      segmenti: pattern.split('/').filter((s) => s !== ''),
      handler,
    });
    return this;
  }

  get = (p: string, h: Handler) => this.aggiungi('GET', p, h);
  post = (p: string, h: Handler) => this.aggiungi('POST', p, h);
  patch = (p: string, h: Handler) => this.aggiungi('PATCH', p, h);
  delete = (p: string, h: Handler) => this.aggiungi('DELETE', p, h);

  async gestisci(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') return rispostaPreflight();

    const url = new URL(req.url);
    const parti = url.pathname.split('/').filter((s) => s !== '');
    let percorsoEsiste = false;

    for (const rotta of this.rotte) {
      if (rotta.segmenti.length !== parti.length) continue;

      const params: Record<string, string> = {};
      let combacia = true;
      for (let i = 0; i < rotta.segmenti.length; i++) {
        const atteso = rotta.segmenti[i]!;
        const trovato = parti[i]!;
        if (atteso.startsWith(':')) params[atteso.slice(1)] = decodeURIComponent(trovato);
        else if (atteso !== trovato) {
          combacia = false;
          break;
        }
      }
      if (!combacia) continue;

      percorsoEsiste = true;
      if (rotta.metodo !== req.method) continue;

      try {
        return await rotta.handler({ req, env, params, url });
      } catch (err) {
        return rispostaErrore(err);
      }
    }

    return rispostaErrore(
      percorsoEsiste
        ? new ErroreHttp(405, `Metodo ${req.method} non ammesso su ${url.pathname}`)
        : new ErroreHttp(404, `Rotta non trovata: ${url.pathname}`),
    );
  }
}
