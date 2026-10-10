import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../server/store';
import { demoSnapshot } from '../src/demo';
test('欠落取得・古い取得・休日で前回の終値を消さず、再起動しても保存', () => {
  const dir = mkdtempSync(join(tmpdir(), 'shinyo-test-')); let store = new Store(dir);
  try {
    store.put(demoSnapshot);
    assert.throws(() => store.put({ ...demoSnapshot, quotes: [] }));
    assert.equal(store.latest()?.quotes.length, 3);
    assert.throws(() => store.put({ ...demoSnapshot, generatedAt: '2026-10-08T09:00:00.000Z' }));
    const holiday = { ...demoSnapshot, generatedAt: '2026-10-10T09:00:00.000Z' };
    store.put(holiday); assert.equal(store.latest()?.tradingDate, '2026-10-09');
    store.attempt(null); store.attempt('取得失敗'); assert.equal((store.status() as any).error, '取得失敗');
    assert.ok((store.status() as any).succeeded);
    store.close(); store = new Store(dir); assert.equal(store.latest()?.generatedAt, holiday.generatedAt);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
