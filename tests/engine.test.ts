import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/engine';
import { demoAccount, demoSnapshot } from '../src/demo';
import { emptyAccount, accountSchema, snapshotSchema, type Account, type Snapshot } from '../src/schema';
const clone = <T,>(v: T): T => structuredClone(v);
function single(entry = '1000', close = '1000', side: 'buy' | 'sell' = 'buy') {
  const a: Account = { ...clone(emptyAccount), cash: '300000', positions: [{ id: 'x', code: '1234', name: '', side, entry, quantity: 1000, openedOn: '2026-10-01', confirmedThrough: '2026-10-09' }] };
  const s: Snapshot = { ...clone(demoSnapshot), expectedCount: 1, quotes: [{ ...demoSnapshot.quotes[0], code: '1234', close }] };
  return { a, s };
}
test('買建と売建の損益を通算し、損だけ控除する独立した数値例', () => {
  const r = calculate(demoAccount, demoSnapshot);
  assert.equal(r.notional, '5000000'); assert.equal(r.pnl, '-200000');
  assert.equal(r.deduction, '200000'); assert.equal(r.collateralValue, '800000');
  assert.equal(r.effective, '2168000'); assert.equal(r.ratio, '43.36'); assert.equal(r.buffer, '1168000');
});
test('値下がりで分母を時価に変えない', () => {
  const { a, s } = single('1000', '900'); const r = calculate(a, s);
  assert.equal(r.notional, '1000000'); assert.equal(r.pnl, '-100000'); assert.equal(r.ratio, '20.00'); assert.equal(r.below20, false);
});
test('含み益は保証金に加算しない', () => {
  const { a, s } = single('1000', '1200'); const r = calculate(a, s);
  assert.equal(r.pnl, '200000'); assert.equal(r.deduction, '0'); assert.equal(r.ratio, '30.00');
});
test('評価益込み率は益を足すがSBI率と追証判定は変えない', () => {
  const { a, s } = single('1000', '1200'); a.cash = '150000';
  const r = calculate(a, s);
  assert.equal(r.estimatedProfitTax, '40630'); assert.equal(r.afterTaxPnl, '159370');
  assert.equal(r.profitInclusiveMargin, '309370'); assert.equal(r.profitInclusiveRatio, '30.93');
  assert.equal(r.ratio, '15.00'); assert.equal(r.below20, true); assert.equal(r.gap, '50000');
  assert.equal(r.netAssets, '350000'); assert.equal(r.effectiveLeverage, '3.42');
});
test('実質レバは売建を正の時価で合算、現物は掛目前、費用と決済損益を反映', () => {
  const r = calculate(demoAccount, demoSnapshot);
  assert.equal(r.positionMarketValue, '4600000'); assert.equal(r.spotMarketValue, '1000000');
  assert.equal(r.totalExposure, '5600000'); assert.equal(r.netAssets, '2368000'); assert.equal(r.effectiveLeverage, '2.36');
  assert.equal(r.profitInclusiveRatio, r.ratio); // 通算損は二重控除しない
  const a = clone(demoAccount); a.collaterals[0].haircut = '0';
  const zeroHaircut = calculate(a, demoSnapshot); assert.equal(zeroHaircut.collateralValue, '0');
  assert.equal(zeroHaircut.netAssets, r.netAssets); assert.equal(zeroHaircut.effectiveLeverage, r.effectiveLeverage);
});
test('純資産0以下は実質レバ未算出、建玉なしの現物は時価で算出', () => {
  const { a, s } = single('1000', '700');
  assert.equal(calculate(a, s).netAssets, '0'); assert.equal(calculate(a, s).effectiveLeverage, null);
  s.quotes[0].close = '600'; assert.equal(calculate(a, s).effectiveLeverage, null);
  const spot = clone(demoAccount); spot.positions = []; spot.cash = '1000000'; spot.costs = '0'; spot.unsettled = '0';
  const r = calculate(spot, demoSnapshot); assert.equal(r.effectiveLeverage, '0.50'); assert.equal(r.profitInclusiveRatio, null);
});
test('価格欠落は参考指標も保留、株価試算では時価と純資産を再評価', () => {
  const s = clone(demoSnapshot); s.quotes.pop(); const incomplete = calculate(demoAccount, s);
  assert.equal(incomplete.profitInclusiveRatio, null); assert.equal(incomplete.effectiveLeverage, null); assert.equal(incomplete.netAssets, null);
  const r = calculate(demoAccount, demoSnapshot, { changePercent: '-10', cashDelta: '100000' });
  assert.equal(r.positionMarketValue, '4140000'); assert.equal(r.spotMarketValue, '900000');
  assert.equal(r.totalExposure, '5040000'); assert.equal(r.pnl, '-180000'); assert.equal(r.netAssets, '2388000'); assert.equal(r.effectiveLeverage, '2.11');
});
test('気配引けの現物参考時価と代用保証金評価を分ける', () => {
  const s = clone(demoSnapshot); s.quotes[2].finalQuote = '2200'; s.quotes[2].status = 'quote-only';
  const r = calculate(demoAccount, s); assert.equal(r.collateralValue, '800000'); assert.equal(r.spotMarketValue, '1100000');
});
test('売建玉は株価上昇で損失', () => {
  const { a, s } = single('1000', '1100', 'sell'); const r = calculate(a, s);
  assert.equal(r.pnl, '-100000'); assert.equal(r.ratio, '20.00');
});
test('通算が益なら個別の損だけを控除しない', () => {
  const a = clone(demoAccount), s = clone(demoSnapshot); s.quotes[1].close = '2000';
  const r = calculate(a, s); assert.equal(r.pnl, '200000'); assert.equal(r.deduction, '0');
});
test('小数の建値はSBIの小数点第3位以下切捨', () => {
  const { a, s } = single('1000.129', '1000.12'); const r = calculate(a, s);
  assert.equal(r.notional, '1000120'); assert.equal(r.pnl, '0');
});
test('表示率ではなく丸める前の数値で20%未満を判定', () => {
  const { a, s } = single(); a.cash = '199999.999'; const r = calculate(a, s);
  assert.equal(r.below20, true); assert.equal(r.gap, '1');
});
test('受渡前損益の符号と経費を反映', () => {
  const { a, s } = single(); a.unsettled = '-10000'; a.costs = '5000'; assert.equal(calculate(a, s).effective, '285000');
  a.unsettled = '10000'; assert.equal(calculate(a, s).effective, '305000');
});
test('建玉なしではゼロ除算せず未算出', () => { assert.equal(calculate(emptyAccount, null).ratio, null); });
test('欠落銘柄では合計損益も率も算出しない', () => {
  const s = clone(demoSnapshot); s.quotes.pop(); const r = calculate(demoAccount, s);
  assert.equal(r.complete, false); assert.equal(r.ratio, null); assert.equal(r.effective, null);
});
test('価格なしをゼロや前日終値で置換しない', () => {
  const { a, s } = single(); s.quotes[0].close = null; s.quotes[0].status = 'no-price'; assert.equal(calculate(a, s).ratio, null);
});
test('気配引けの代用は最後の約定と気配の安い方', () => {
  const a = clone(demoAccount), s = clone(demoSnapshot); s.quotes[2].finalQuote = '1800'; s.quotes[2].status = 'quote-only';
  assert.equal(calculate(a, s).collateralValue, '720000'); s.quotes[2].finalQuote = '2200'; assert.equal(calculate(a, s).collateralValue, '800000');
});
test('分割・併合の確認前は計算を保留', () => {
  const { a, s } = single(); s.quotes[0].actionDate = '2026-10-09'; a.positions[0].confirmedThrough = '2026-10-08';
  assert.equal(calculate(a, s).ratio, null); a.positions[0].confirmedThrough = '2026-10-09'; assert.equal(calculate(a, s).ratio, '30.00');
});
test('同一銘柄を信用と代用で持つ二重の値下がり', () => {
  const { a, s } = single(); a.collaterals = [{ id: 'c', code: '1234', name: '', quantity: 1000, haircut: '80', confirmedThrough: '2026-10-09' }];
  const r = calculate(a, s, { changePercent: '-10', cashDelta: '0' }); assert.equal(r.deduction, '100000'); assert.equal(r.collateralValue, '720000'); assert.equal(r.ratio, '92.00');
});
test('0%掛目と現金追加のシミュレーション', () => {
  const a = clone(demoAccount); a.collaterals[0].haircut = '0';
  const r = calculate(a, demoSnapshot, { changePercent: '0', cashDelta: '100000' }); assert.equal(r.collateralValue, '0'); assert.equal(r.effective, '1468000');
});
test('負の現金・小数株数・ゼロ建値を拒否', () => {
  const { a } = single(); assert.equal(accountSchema.safeParse({ ...a, cash: '-1' }).success, false);
  a.positions[0].quantity = 1.5; assert.equal(accountSchema.safeParse(a).success, false);
  a.positions[0].quantity = 100; a.positions[0].entry = '0.001'; assert.equal(accountSchema.safeParse(a).success, false);
});
test('不正シナリオを拒否', () => {
  const { a, s } = single(); assert.throws(() => calculate(a, s, { changePercent: '-100', cashDelta: '0' }));
  assert.throws(() => calculate(a, s, { changePercent: '0', cashDelta: '-300001' }));
});
test('英字コードを登録可能', () => {
  const { a, s } = single(); a.positions[0].code = '285A'; s.quotes[0].code = '285A'; assert.equal(calculate(a, s).ratio, '30.00');
});
test('全銘柄件数・日付混在・市場欠落・営業日遅れを拒否', () => {
  const s = clone(demoSnapshot); assert.equal(snapshotSchema.safeParse({ ...s, expectedCount: 4 }).success, false);
  s.quotes[0].date = '2026-10-08'; assert.equal(snapshotSchema.safeParse(s).success, false);
  assert.equal(snapshotSchema.safeParse({ ...demoSnapshot, markets: ['TSE', 'NSE'] }).success, false);
  assert.equal(snapshotSchema.safeParse({ ...demoSnapshot, expectedTradingDate: '2026-10-10' }).success, false);
});
