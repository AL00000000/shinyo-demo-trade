import { z } from 'zod';
export const codeSchema = z.string().regex(/^\d[0-9A-Z]{3}$/, '銘柄コードは4桁（英字対応）');
export const dateSchema = z.iso.date();
export const amountSchema = z.string().regex(/^\d+(\.\d{1,6})?$/, '0以上の数値を入力してください');
export const signedAmountSchema = z.string().regex(/^-?\d+(\.\d{1,6})?$/, '数値を入力してください');
const positiveAmount = amountSchema.refine(v => Number(v) > 0, '0より大きい値が必要です');
const quantity = z.number().int().positive().max(1_000_000_000);
export const positionSchema = z.object({
  id: z.string(), code: codeSchema, name: z.string().max(80), side: z.enum(['buy', 'sell']),
  quantity, entry: positiveAmount.refine(v => Number(v) >= .01, '建値は0.01円以上'), openedOn: dateSchema,
  confirmedThrough: dateSchema
});
export const collateralSchema = z.object({
  id: z.string(), code: codeSchema, name: z.string().max(80), quantity,
  haircut: amountSchema.refine(v => Number(v) <= 100, '掛目は0〜100%'), confirmedThrough: dateSchema
});
export const accountSchema = z.object({
  cash: amountSchema, costs: amountSchema, unsettled: signedAmountSchema,
  positions: z.array(positionSchema), collaterals: z.array(collateralSchema)
}).refine(v => new Set([...v.positions, ...v.collaterals].map(p => p.id)).size === v.positions.length + v.collaterals.length, '登録IDが重複しています');
export const quoteSchema = z.object({
  code: codeSchema, market: z.enum(['TSE', 'NSE', 'FSE', 'SSE']), name: z.string().max(80), date: dateSchema,
  close: positiveAmount.nullable(), finalQuote: positiveAmount.nullable(),
  status: z.enum(['traded', 'quote-only', 'no-price']),
  // 分割・併合等で株数/建値を変更すべき直近の日付。調整後終値で代替しない。
  actionDate: dateSchema.nullable(),
  corporateActionsChecked: z.boolean().optional()
}).superRefine((v, ctx) => {
  if (v.status === 'traded' && v.close === null) ctx.addIssue({ code: 'custom', message: '約定ありなら終値必須' });
  if (v.status === 'quote-only' && v.finalQuote === null) ctx.addIssue({ code: 'custom', message: '気配引けなら最終気配値必須' });
  if (v.status === 'no-price' && (v.close !== null || v.finalQuote !== null)) ctx.addIssue({ code: 'custom', message: '価格なしと価格が矛盾' });
  if (v.actionDate && v.actionDate > v.date) ctx.addIssue({ code: 'custom', message: '将来の権利処理日は不可' });
});
export const snapshotSchema = z.object({
  version: z.literal(1), source: z.string().min(1).max(200), tradingDate: dateSchema,
  expectedTradingDate: dateSchema, generatedAt: z.iso.datetime(),
  complete: z.boolean(), licensedForRedistribution: z.boolean(),
  usage: z.enum(['licensed', 'personal']).optional(),
  coverageNote: z.string().max(500).optional(),
  markets: z.array(z.enum(['TSE', 'NSE', 'FSE', 'SSE'])).min(1),
  expectedCount: z.number().int().positive(), quotes: z.array(quoteSchema).min(1)
}).superRefine((v, ctx) => {
  if (v.usage !== 'personal' && (!v.complete || !v.licensedForRedistribution)) ctx.addIssue({ code: 'custom', message: '一般配信には全件完了と配信許諾が必要です' });
  if (v.tradingDate !== v.expectedTradingDate) ctx.addIssue({ code: 'custom', message: '対象営業日のデータ未到着' });
  if (v.quotes.length !== v.expectedCount) ctx.addIssue({ code: 'custom', message: '全銘柄件数不一致' });
  const keys = v.quotes.map(q => `${q.market}:${q.code}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: '同一市場の銘柄重複' });
  if (v.quotes.some(q => q.date !== v.tradingDate || !v.markets.includes(q.market))) ctx.addIssue({ code: 'custom', message: '銘柄日付/市場不一致' });
  if (v.markets.some(m => !v.quotes.some(q => q.market === m))) ctx.addIssue({ code: 'custom', message: '市場の銘柄が欠落' });
});
export type Account = z.infer<typeof accountSchema>;
export type Position = z.infer<typeof positionSchema>;
export type Collateral = z.infer<typeof collateralSchema>;
export type Quote = z.infer<typeof quoteSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export const emptyAccount: Account = { cash: '0', costs: '0', unsettled: '0', positions: [], collaterals: [] };
