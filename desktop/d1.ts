// Adaptador: expõe a mesma interface do Cloudflare D1 sobre o SQLite embutido do Node (node:sqlite).
// Assim o servidor do app roda igual na nuvem e no Windows, sem duplicar código.

import { DatabaseSync, type StatementSync } from 'node:sqlite';

type V = string | number | bigint | null | Uint8Array;
const norm = (v: unknown): V => (v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as V));
const returnsRows = (sql: string) => /^\s*(select|with|pragma)\b/i.test(sql) || /\breturning\b/i.test(sql);
const plain = <T>(r: unknown) => (r ? { ...(r as object) } as T : null);

class Stmt {
  constructor(private db: DatabaseSync, private sql: string, private args: V[] = []) {}
  private st(): StatementSync { return this.db.prepare(this.sql); }
  bind(...a: unknown[]) { return new Stmt(this.db, this.sql, a.map(norm)); }
  async first<T = Record<string, unknown>>(col?: string): Promise<T | null> {
    const r = plain<Record<string, unknown>>(this.st().get(...this.args));
    if (!r) return null;
    return (col ? r[col] : r) as T;
  }
  async all<T = Record<string, unknown>>() { return { results: this.st().all(...this.args).map(r => ({ ...r })) as T[], success: true, meta: {} }; }
  async run() {
    if (returnsRows(this.sql)) return this.all();
    const r = this.st().run(...this.args);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  /** usado pelo batch: executa de forma síncrona dentro da transação */
  execSync() {
    if (returnsRows(this.sql)) return { results: this.st().all(...this.args).map(r => ({ ...r })), success: true, meta: {} };
    const r = this.st().run(...this.args);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

export class LocalD1 {
  readonly raw: DatabaseSync;
  constructor(file: string) {
    this.raw = new DatabaseSync(file);
    this.raw.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  }
  prepare(sql: string) { return new Stmt(this.raw, sql); }
  async batch(stmts: Stmt[]) {
    this.raw.exec('BEGIN');
    try { const out = stmts.map(s => s.execSync()); this.raw.exec('COMMIT'); return out; }
    catch (e) { this.raw.exec('ROLLBACK'); throw e; }
  }
  async exec(sql: string) { this.raw.exec(sql); return { count: 0, duration: 0 }; }

  /** Migrações versionadas por PRAGMA user_version. */
  migrate(migrations: string[]) {
    const v = Number((this.raw.prepare('PRAGMA user_version').get() as any).user_version);
    for (let i = v; i < migrations.length; i++) {
      this.raw.exec('BEGIN');
      try { this.raw.exec(migrations[i]); this.raw.exec(`PRAGMA user_version = ${i + 1}`); this.raw.exec('COMMIT'); }
      catch (e) { this.raw.exec('ROLLBACK'); throw e; }
    }
  }
}
