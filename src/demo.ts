import type { Account, Snapshot } from './schema';
import { createPortfolio } from './patterns';
export const demoAccount: Account = {
  cash: '1600000', costs: '12000', unsettled: '-20000',
  positions: [
    { id: 'demo1', code: '7203', name: 'トヨタ自動車', side: 'buy', quantity: 1000, entry: '2500', openedOn: '2026-10-01', confirmedThrough: '2026-10-09' },
    { id: 'demo2', code: '6758', name: 'ソニーグループ', side: 'sell', quantity: 1000, entry: '2500', openedOn: '2026-10-01', confirmedThrough: '2026-10-09' }
  ],
  collaterals: [{ id: 'demo3', code: '8306', name: '三菱UFJ', quantity: 500, haircut: '80', confirmedThrough: '2026-10-09' }]
};
export const demoSnapshot: Snapshot = {
  version: 1, source: '操作確認用の架空価格・実相場ではありません', tradingDate: '2026-10-09', expectedTradingDate: '2026-10-09',
  generatedAt: '2026-10-09T09:00:00.000Z', complete: true, licensedForRedistribution: true, markets: ['TSE'], expectedCount: 3,
  quotes: [
    { code: '7203', name: 'トヨタ自動車', market: 'TSE', date: '2026-10-09', close: '2200', finalQuote: null, status: 'traded', actionDate: null },
    { code: '6758', name: 'ソニーグループ', market: 'TSE', date: '2026-10-09', close: '2400', finalQuote: null, status: 'traded', actionDate: null },
    { code: '8306', name: '三菱UFJ', market: 'TSE', date: '2026-10-09', close: '2000', finalQuote: null, status: 'traded', actionDate: null }
  ]
};
export const demoPortfolio = createPortfolio();
demoPortfolio.patterns[0].account = demoAccount;
demoPortfolio.patterns[1].account = { ...demoAccount, positions: [{ ...demoAccount.positions[0] }], collaterals: demoAccount.collaterals.map(c => ({ ...c })) };
demoPortfolio.patterns[2].account = { ...demoAccount, cash: '1000000', positions: demoAccount.positions.map((p, i) => ({ ...p, quantity: i === 0 ? 2000 : p.quantity })), collaterals: demoAccount.collaterals.map(c => ({ ...c })) };
