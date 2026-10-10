import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { snapshotSchema, type Snapshot } from '../src/schema';
export class Store {
  db: DatabaseSync;
  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, 'prices.db'));
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS snapshots (date TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), attempted TEXT, succeeded TEXT, error TEXT);`);
  }
  latest(): Snapshot | null {
    const row = this.db.prepare('SELECT payload FROM snapshots ORDER BY date DESC LIMIT 1').get() as { payload: string } | undefined;
    return row ? snapshotSchema.parse(JSON.parse(row.payload)) : null;
  }
  put(value: unknown) {
    const snapshot = snapshotSchema.parse(value), previous = this.latest();
    if (previous && snapshot.tradingDate < previous.tradingDate) throw new Error('古い営業日のデータで最新値を巻き戻せません');
    if (previous && snapshot.generatedAt < previous.generatedAt) throw new Error('古い生成時刻のデータは採用しません');
    // 営業日をキーに保存。部分欠落や失敗で過去のデータを消さない。
    this.db.prepare('INSERT INTO snapshots VALUES (?,?) ON CONFLICT(date) DO UPDATE SET payload=excluded.payload')
      .run(snapshot.tradingDate, JSON.stringify(snapshot));
    return snapshot;
  }
  status() { return this.db.prepare('SELECT attempted,succeeded,error FROM state WHERE id=1').get() ?? { attempted: null, succeeded: null, error: null }; }
  attempt(error: string | null) {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO state VALUES (1,?,?,?) ON CONFLICT(id) DO UPDATE SET attempted=excluded.attempted,
      succeeded=CASE WHEN excluded.error IS NULL THEN excluded.succeeded ELSE state.succeeded END,error=excluded.error`)
      .run(now, error ? null : now, error);
  }
  close() { this.db.close(); }
}
