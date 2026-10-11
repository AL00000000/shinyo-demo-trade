import Decimal from 'decimal.js';
import type { Account } from './schema';
import type { calculate } from './engine';

// Display-only totals: credit margin and profit-tax calculations retain their own formulas.
export function holdingPnl(account: Account, result: ReturnType<typeof calculate>) {
  const sum = (values: (string | null)[]) => values.some(v => v === null) ? null : values.reduce<Decimal>((total, value) => total.plus(value!), new Decimal(0)).toFixed();
  const collaterals = account.collaterals.map((c, i) => {
    const price = result.collaterals[i]?.marketPrice;
    return !c.purchasePrice || price === null || price === undefined ? null : new Decimal(price).minus(c.purchasePrice).mul(c.quantity).toFixed();
  });
  const credit = sum(result.positions.map(p => p.pnl));
  const spot = sum(collaterals);
  return { collaterals, credit, spot, total: sum([credit, spot]) };
}
