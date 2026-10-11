import test from 'node:test';
import assert from 'node:assert/strict';
import { holdingPnl } from '../src/holding-pnl';
import { calculate } from '../src/engine';
import { demoAccount, demoSnapshot } from '../src/demo';
import { emptyAccount } from '../src/schema';
test('credit long and short gains combine with full cash-stock gains without haircut', () => {
  const r = calculate(demoAccount, demoSnapshot), p = holdingPnl(demoAccount, r);
  assert.equal(r.positions[0].pnl, '-300000'); assert.equal(r.positions[1].pnl, '100000');
  assert.deepEqual(p, {collaterals:['100000'],credit:'-200000',spot:'100000',total:'-100000'});
  assert.equal(r.ratio, '43.36'); // Display total does not add spot P&L to the margin twice.
});
test('missing cost blocks spot and combined total without blocking credit or margin', () => {
  const a = structuredClone(demoAccount); delete a.collaterals[0].purchasePrice;
  const r = calculate(a,demoSnapshot), p = holdingPnl(a,r);
  assert.equal(p.credit,'-200000'); assert.equal(p.spot,null); assert.equal(p.total,null); assert.equal(r.ratio,'43.36');
});
test('missing prices and unconfirmed stock splits do not produce a false zero or total', () => {
  const s = structuredClone(demoSnapshot); s.quotes[2].actionDate='2026-10-09';
  const a=structuredClone(demoAccount); a.collaterals[0].confirmedThrough='2026-10-08';
  assert.equal(holdingPnl(a,calculate(a,s)).spot,null);
  assert.equal(holdingPnl(a,calculate(a,null)).total,null);
  assert.deepEqual(holdingPnl(emptyAccount,calculate(emptyAccount,null)),{collaterals:[],credit:'0',spot:'0',total:'0'});
});
