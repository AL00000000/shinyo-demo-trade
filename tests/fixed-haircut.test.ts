import test from 'node:test';
import assert from 'node:assert/strict';
import { demoPortfolio } from '../src/demo';
import { readPortfolio, restorePortfolio, createPortfolio } from '../src/patterns';
import { collateralSchema } from '../src/schema';

test('all patterns normalize old saved and imported collateral ratios to 80%', () => {
  const old = structuredClone(demoPortfolio);
  for (const pattern of old.patterns) pattern.account.collaterals[0].haircut = '50';
  assert.deepEqual(readPortfolio(old).patterns.map(p => p.account.collaterals[0].haircut), ['80','80','80']);
  assert.deepEqual(restorePortfolio(old, createPortfolio()).patterns.map(p => p.account.collaterals[0].haircut), ['80','80','80']);
});
test('collateral can be entered without a ratio', () => {
  const { haircut, ...item } = demoPortfolio.patterns[0].account.collaterals[0];
  assert.equal(collateralSchema.parse(item).haircut, '80');
});
