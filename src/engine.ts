import Decimal from 'decimal.js';
import { accountSchema, type Account, type Quote, type Snapshot } from './schema';
Decimal.set({ precision: 40, rounding: Decimal.ROUND_DOWN });
const d = (v: Decimal.Value) => new Decimal(v);
const sum = (a: string[]) => a.reduce((v, x) => v.plus(x), d(0));
const f = (v: Decimal) => v.toFixed();
export function yen(value: string | number) {
  const n = Number(value), a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}億円`;
  if (a >= 10_000) return `${sign}${(a / 10_000).toLocaleString('ja-JP', { maximumFractionDigits: 2 })}万円`;
  return `${sign}${a.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}円`;
}
export function todayJst() { return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()); }
export function findQuote(snapshot: Snapshot, code: string): Quote | undefined {
  // SBIの優先市場評価に近づけるため、市場順序を固定。契約先でSBI優先市場との照合が必要。
  return ['TSE', 'NSE', 'FSE', 'SSE'].map(m => snapshot.quotes.find(q => q.code === code && q.market === m)).find(Boolean);
}
export type Scenario = { changePercent: string; cashDelta: string };
export function calculate(input: Account, snapshot: Snapshot | null, scenario: Scenario = { changePercent: '0', cashDelta: '0' }) {
  const account = accountSchema.parse(input);
  const change = d(scenario.changePercent);
  if (!change.isFinite() || change.lte(-100) || change.gt(1000)) throw new Error('価格変化は−100%超〜1000%');
  const cashDelta = d(scenario.cashDelta);
  if (!cashDelta.isFinite()) throw new Error('入出金額が不正');
  const multiplier = change.div(100).plus(1);
  const issues: string[] = [];
  function get(code: string, confirmedThrough: string, collateral: boolean) {
    const q = snapshot && findQuote(snapshot, code);
    if (!q) { issues.push(`${code}: 終値未取得`); return null; }
    if (q.actionDate && q.actionDate > confirmedThrough) { issues.push(`${code}: ${q.actionDate}の権利処理後の株数・建値を確認してください`); return null; }
    if (q.status === 'no-price' || (q.close === null && q.finalQuote === null)) { issues.push(`${code}: 価格なし`); return null; }
    // SBI: 代用が気配引けの場合、最終約定値と最終気配値の低い方。
    const value = collateral && q.finalQuote !== null && q.close !== null
      ? Decimal.min(q.close, q.finalQuote)
      : d(q.finalQuote !== null ? q.finalQuote : q.close!);
    return value.mul(multiplier);
  }
  const positions = account.positions.map(p => {
    // SBI公表の建単価: 小数点第3位以下切捨。損益にも同じ建単価を使用。
    const entry = d(p.entry).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    const price = get(p.code, p.confirmedThrough, false);
    const pnl = price === null ? null : price.minus(entry).mul(p.quantity).mul(p.side === 'buy' ? 1 : -1);
    return { ...p, entryUsed: f(entry), price: price === null ? null : f(price), marketValue: price === null ? null : f(price.mul(p.quantity)), notional: f(entry.mul(p.quantity)), pnl: pnl === null ? null : f(pnl) };
  });
  const collaterals = account.collaterals.map(c => {
    const price = get(c.code, c.confirmedThrough, true);
    const marketPrice = get(c.code, c.confirmedThrough, false);
    const value = price === null ? null : price.mul(c.quantity).mul(c.haircut).div(100);
    return { ...c, price: price === null ? null : f(price), marketPrice: marketPrice === null ? null : f(marketPrice), marketValue: marketPrice === null ? null : f(marketPrice.mul(c.quantity)), value: value === null ? null : f(value) };
  });
  const notional = sum(positions.map(p => p.notional));
  const complete = issues.length === 0;
  const pnl = complete ? sum(positions.map(p => p.pnl!)) : null;
  const collateralValue = complete ? sum(collaterals.map(c => c.value!)) : null;
  const deduction = pnl === null ? null : Decimal.max(0, pnl.negated());
  const cash = d(account.cash).plus(cashDelta);
  if (cash.lt(0)) throw new Error('出金後の保証金現金がマイナス');
  const effective = collateralValue === null || deduction === null ? null : cash.plus(collateralValue).minus(account.costs).minus(deduction).plus(account.unsettled);
  const ratio = notional.isZero() || effective === null ? null : effective.div(notional).mul(100);
  // 表示用参考指標。追証判定には既存のratioだけを使う。
  const estimatedProfitTax = pnl === null ? null : Decimal.max(0, pnl).mul('0.20315');
  const afterTaxPnl = pnl === null || estimatedProfitTax === null ? null : pnl.minus(estimatedProfitTax);
  const profitInclusiveMargin = collateralValue === null || afterTaxPnl === null ? null : cash.plus(collateralValue).minus(account.costs).plus(account.unsettled).plus(afterTaxPnl);
  const profitInclusiveRatio = notional.isZero() || profitInclusiveMargin === null ? null : profitInclusiveMargin.div(notional).mul(100);
  const positionMarketValue = complete ? sum(positions.map(p => p.marketValue!)) : null;
  const spotMarketValue = complete ? sum(collaterals.map(c => c.marketValue!)) : null;
  const totalExposure = positionMarketValue === null || spotMarketValue === null ? null : positionMarketValue.plus(spotMarketValue);
  const netAssets = spotMarketValue === null || pnl === null ? null : cash.plus(spotMarketValue).minus(account.costs).plus(account.unsettled).plus(pnl);
  const effectiveLeverage = totalExposure === null || netAssets === null || netAssets.lte(0) ? null : totalExposure.div(netAssets);
  const buffer = notional.isZero() || effective === null ? null : effective.minus(notional.mul('0.2'));
  const gap = buffer === null ? null : Decimal.max(0, buffer.negated()).ceil();
  return {
    complete, issues: [...new Set(issues)], positions, collaterals, date: snapshot?.tradingDate ?? null,
    cash: f(cash), costs: account.costs, unsettled: account.unsettled,
    notional: f(notional), pnl: pnl === null ? null : f(pnl),
    collateralValue: collateralValue === null ? null : f(collateralValue),
    deduction: deduction === null ? null : f(deduction), effective: effective === null ? null : f(effective),
    ratio: ratio === null ? null : ratio.toFixed(2, Decimal.ROUND_DOWN),
    profitInclusiveMargin: profitInclusiveMargin === null ? null : f(profitInclusiveMargin),
    estimatedProfitTax: estimatedProfitTax === null ? null : f(estimatedProfitTax), afterTaxPnl: afterTaxPnl === null ? null : f(afterTaxPnl),
    profitInclusiveRatio: profitInclusiveRatio === null ? null : profitInclusiveRatio.toFixed(2, Decimal.ROUND_DOWN),
    positionMarketValue: positionMarketValue === null ? null : f(positionMarketValue), spotMarketValue: spotMarketValue === null ? null : f(spotMarketValue),
    totalExposure: totalExposure === null ? null : f(totalExposure), netAssets: netAssets === null ? null : f(netAssets),
    effectiveLeverage: effectiveLeverage === null ? null : effectiveLeverage.toFixed(2, Decimal.ROUND_DOWN),
    buffer: buffer === null ? null : f(buffer), gap: gap === null ? null : f(gap),
    // 判定は表示用に丸めた率を使わない。
    below20: ratio !== null && ratio.lt(20), below30: ratio !== null && ratio.lt(30),
    depositBelowMinimum: cash.plus(collateralValue ?? 0).lt(300000)
  };
}
