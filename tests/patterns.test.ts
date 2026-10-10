import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPortfolio, readPortfolio, restorePortfolio, updatePatternAccount } from '../src/patterns';
import { demoAccount, demoPortfolio, demoSnapshot } from '../src/demo';
import { calculate } from '../src/engine';
test('3つの建玉・保証金が独立し、選択したリストだけを変更する', () => {
  const original = createPortfolio();
  let next = updatePatternAccount(original, demoAccount);
  next = updatePatternAccount({ ...next, activePattern: 1 }, { ...demoAccount, cash: '400000', positions: [] });
  assert.equal(original.patterns[0].account.cash, '0');
  assert.equal(next.patterns[0].account.cash, '1600000');
  assert.equal(next.patterns[0].account.positions.length, 2);
  assert.equal(next.patterns[1].account.cash, '400000');
  assert.equal(next.patterns[1].account.positions.length, 0);
  assert.equal(next.patterns[2].account.cash, '0');
  assert.equal(next.patterns[2].account.positions.length, 0);
});
test('同じ終値で3パターンの維持率を個別計算', () => {
  assert.deepEqual(demoPortfolio.patterns.map(p => calculate(p.account, demoSnapshot).ratio), ['43.36', '82.72', '16.90']);
});
test('旧保存データはパターン1へ移行し、建玉・代用・金額を保持', () => {
  const next = readPortfolio({ version: 1, account: demoAccount, apiUrl: 'https://example.jp' });
  assert.equal(next.version, 2); assert.equal(next.activePattern, 0);
  assert.deepEqual(next.patterns[0].account, demoAccount);
  assert.equal(next.patterns[1].account.cash, '0'); assert.equal(next.patterns[2].account.cash, '0');
});
test('3パターン形式はバックアップと復元で選択状態も保持', () => {
  const current = { ...demoPortfolio, activePattern: 2 };
  assert.deepEqual(readPortfolio(JSON.parse(JSON.stringify(current))), current);
  assert.deepEqual(restorePortfolio(JSON.parse(JSON.stringify(current)), createPortfolio()), current);
});
test('旧バックアップは選択中だけに復元し、他のリストを保持', () => {
  const current = { ...demoPortfolio, activePattern: 2 };
  const next = restorePortfolio({ version: 1, account: { ...demoAccount, cash: '900000' } }, current);
  assert.deepEqual(next.patterns[0], current.patterns[0]); assert.deepEqual(next.patterns[1], current.patterns[1]);
  assert.equal(next.patterns[2].account.cash, '900000'); assert.equal(next.activePattern, 2);
});
test('不正形式やパターン数・選択範囲・ID重複を拒否', () => {
  const p = createPortfolio();
  assert.throws(() => readPortfolio({ ...p, patterns: p.patterns.slice(0, 2) }));
  assert.throws(() => readPortfolio({ ...p, activePattern: 3 }));
  assert.throws(() => readPortfolio({ ...p, patterns: [p.patterns[0], p.patterns[0], p.patterns[2]] }));
  assert.throws(() => readPortfolio({ version: 1, account: { ...demoAccount, cash: '-1' } }));
});
