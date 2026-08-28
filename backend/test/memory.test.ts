import { describe, expect, it } from 'vitest';
import { componiRiassunto, serveConsolidamento } from '../src/domain/memory';
import type { CampaignSummary } from '../src/db/schema';
import type { Config } from '../src/env';

const config: Config = {
  consolidaOgniNSessioni: 3,
  consolidaSogliaCaratteri: 500,
  finestraEventiRecenti: 24,
};

function riassunto(
  id: string,
  tipo: 'delta' | 'consolidato',
  contenuto: string,
  ts: string,
): CampaignSummary {
  return {
    id,
    campaign_id: 'cmp_1',
    tipo,
    contenuto_md: contenuto,
    versione_timestamp: ts,
    aggiornato_alla_sessione: 0,
    sessioni_dal_ultimo_consolidamento: 0,
  };
}

describe('componiRiassunto', () => {
  it('restituisce stringa vuota senza riassunti', () => {
    expect(componiRiassunto([])).toBe('');
  });

  it('accoda i delta dopo il consolidato', () => {
    const testo = componiRiassunto([
      riassunto('a', 'delta', 'vecchio', '2026-01-01T00:00:00Z'),
      riassunto('b', 'consolidato', 'CONSOLIDATO', '2026-01-02T00:00:00Z'),
      riassunto('c', 'delta', 'nuovo', '2026-01-03T00:00:00Z'),
    ]);
    expect(testo).toBe('CONSOLIDATO\n\nnuovo');
  });

  it('usa solo i delta quando non c\'è ancora un consolidato', () => {
    const testo = componiRiassunto([
      riassunto('a', 'delta', 'uno', '2026-01-01T00:00:00Z'),
      riassunto('b', 'delta', 'due', '2026-01-02T00:00:00Z'),
    ]);
    expect(testo).toBe('uno\n\ndue');
  });
});

describe('serveConsolidamento', () => {
  it('è falso senza delta', () => {
    expect(serveConsolidamento([], config)).toBe(false);
    expect(
      serveConsolidamento([riassunto('a', 'consolidato', 'x', '2026-01-01T00:00:00Z')], config),
    ).toBe(false);
  });

  it('scatta al raggiungimento del numero di sessioni', () => {
    const delta = ['a', 'b'].map((id, i) =>
      riassunto(id, 'delta', 'corto', `2026-01-0${i + 1}T00:00:00Z`),
    );
    expect(serveConsolidamento(delta, config)).toBe(false);
    delta.push(riassunto('c', 'delta', 'corto', '2026-01-03T00:00:00Z'));
    expect(serveConsolidamento(delta, config)).toBe(true);
  });

  it('scatta anche per lunghezza totale', () => {
    const lungo = riassunto('a', 'delta', 'x'.repeat(600), '2026-01-01T00:00:00Z');
    expect(serveConsolidamento([lungo], config)).toBe(true);
  });

  it('ignora i delta già inglobati in un consolidato successivo', () => {
    const righe = [
      riassunto('a', 'delta', 'x', '2026-01-01T00:00:00Z'),
      riassunto('b', 'delta', 'x', '2026-01-02T00:00:00Z'),
      riassunto('c', 'delta', 'x', '2026-01-03T00:00:00Z'),
      riassunto('d', 'consolidato', 'C', '2026-01-04T00:00:00Z'),
    ];
    expect(serveConsolidamento(righe, config)).toBe(false);
  });
});
