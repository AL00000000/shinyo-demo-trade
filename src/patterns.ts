import { z } from 'zod';
import { accountSchema, emptyAccount, type Account } from './schema';
export const patternSchema = z.object({ id: z.string().min(1), name: z.string().trim().min(1).max(30), account: accountSchema });
export const portfolioSchema = z.object({
  version: z.literal(2), patterns: z.array(patternSchema).length(3), activePattern: z.number().int().min(0).max(2)
}).refine(v => new Set(v.patterns.map(p => p.id)).size === 3, 'パターンIDが重複しています');
export type Portfolio = z.infer<typeof portfolioSchema>;
export function createPortfolio(): Portfolio {
  return { version: 2, activePattern: 0, patterns: [0, 1, 2].map(i => ({
    id: `pattern-${i + 1}`, name: `パターン${i + 1}`, account: { ...emptyAccount, positions: [], collaterals: [] }
  })) };
}
export function readPortfolio(value: unknown): Portfolio {
  const legacy = z.object({ version: z.literal(1), account: accountSchema }).safeParse(value);
  if (legacy.success) {
    const result = createPortfolio(); result.patterns[0].account = legacy.data.account;
    return result;
  }
  return portfolioSchema.parse(value);
}
export function updatePatternAccount(portfolio: Portfolio, account: Account): Portfolio {
  return portfolioSchema.parse({ ...portfolio, patterns: portfolio.patterns.map((p, i) => i === portfolio.activePattern ? { ...p, account } : p) });
}
export function restorePortfolio(value: unknown, current: Portfolio): Portfolio {
  const legacy = z.object({ version: z.literal(1), account: accountSchema }).safeParse(value);
  // 旧形式の単一口座バックアップは選択中のリストだけに復元。他の2つを消さない。
  return legacy.success ? updatePatternAccount(current, legacy.data.account) : portfolioSchema.parse(value);
}
