/**
 * Shim di D1 su node:sqlite, sufficiente per i test end-to-end.
 * Copre solo la parte di API che il backend usa davvero: prepare/bind/
 * all/first/run e batch.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// `node:sqlite` è troppo recente perché Vite lo riconosca come builtin e lo
// lasci esterno: lo carichiamo a runtime per aggirare l'analisi statica.
const require = createRequire(import.meta.url);
const { DatabaseSync } = require('node:sqlite') as typeof import('node:sqlite');

const QUI = dirname(fileURLToPath(import.meta.url));
const MIGRAZIONI = join(QUI, '..', '..', 'migrations');

type Database = InstanceType<typeof DatabaseSync>;
type Params = unknown[];

class Statement {
  constructor(
    private readonly db: Database,
    private readonly sql: string,
    private readonly params: Params = [],
  ) {}

  bind(...params: Params): Statement {
    return new Statement(this.db, this.sql, params);
  }

  private normalizza(): Params {
    return this.params.map((p) => (typeof p === 'boolean' ? (p ? 1 : 0) : p));
  }

  async all<T>(): Promise<{ results: T[]; success: true }> {
    const righe = this.db.prepare(this.sql).all(...(this.normalizza() as never[]));
    return { results: righe as T[], success: true };
  }

  async first<T>(): Promise<T | null> {
    const riga = this.db.prepare(this.sql).get(...(this.normalizza() as never[]));
    return (riga as T | undefined) ?? null;
  }

  async run(): Promise<{ success: true }> {
    this.db.prepare(this.sql).run(...(this.normalizza() as never[]));
    return { success: true };
  }
}

export class FakeD1 {
  readonly sqlite: Database;

  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON;');
    for (const file of ['0001_init.sql', '0002_seed_setting.sql']) {
      this.sqlite.exec(readFileSync(join(MIGRAZIONI, file), 'utf8'));
    }
  }

  prepare(sql: string): Statement {
    return new Statement(this.sqlite, sql);
  }

  async batch(statements: Statement[]): Promise<unknown[]> {
    const esiti: unknown[] = [];
    for (const s of statements) esiti.push(await s.run());
    return esiti;
  }
}

/** Il tipo D1Database dei workers-types non combacia: cast controllato. */
export function comeD1(fake: FakeD1): D1Database {
  return fake as unknown as D1Database;
}
