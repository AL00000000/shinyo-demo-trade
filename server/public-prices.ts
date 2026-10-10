import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readSheet } from 'read-excel-file/node';
import { codeSchema, snapshotSchema, type Quote, type Snapshot } from '../src/schema';

type Security = { code: string; name: string };
const jstDate = (d: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(d);
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function get(url: string) {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`公開データ取得 HTTP ${r.status}`);
  return r;
}
export function expectedDate(now: Date, holidays: Set<string>): string {
  const local = new Date(now.getTime() + 9 * 3600_000);
  if (local.getUTCHours() < 18) local.setUTCDate(local.getUTCDate() - 1);
  for (let i = 0; i < 14; i++) {
    const date = local.toISOString().slice(0, 10), md = date.slice(5);
    if (![0, 6].includes(local.getUTCDay()) && !holidays.has(date) && !['01-01','01-02','01-03','12-31'].includes(md)) return date;
    local.setUTCDate(local.getUTCDate() - 1);
  }
  throw new Error('営業日カレンダーを確認できません');
}
async function calendar() {
  const r = await get('https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv');
  const text = new TextDecoder('shift_jis').decode(await r.arrayBuffer());
  const dates = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2}),/);
    if (m) dates.add(`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`);
  }
  if (![...dates].some(d => d.startsWith(jstDate(new Date()).slice(0,4)))) throw new Error('今年の祝日カレンダーが未収録です');
  return dates;
}
async function securities(dir: string): Promise<Security[]> {
  const path = join(dir, 'tse-master.json');
  try {
    const cache = JSON.parse(await readFile(path, 'utf8'));
    if (Date.now() - cache.at < 24 * 3600_000 && cache.rows?.length > 3000) return cache.rows;
  } catch { /* 初回は公式銘柄一覧を取得 */ }
  const pageUrl = 'https://www.jpx.co.jp/markets/statistics-equities/misc/01.html';
  const html = await (await get(pageUrl)).text();
  const href = html.match(/href="([^"]+data_j\.xlsx)"/)?.[1];
  if (!href) throw new Error('東証銘柄一覧のファイルを確認できません');
  const rows = await readSheet(Buffer.from(await (await get(new URL(href, pageUrl).href)).arrayBuffer()));
  const unique = new Map<string, Security>();
  for (const row of rows.slice(1)) {
    const code = String(row[1] ?? '').trim(), name = String(row[2] ?? '').trim();
    if (codeSchema.safeParse(code).success && name) unique.set(code, {code, name});
  }
  if (unique.size < 3000) throw new Error('東証銘柄一覧の件数が不正です');
  const result = [...unique.values()];
  await writeFile(path, JSON.stringify({at: Date.now(), rows: result}));
  return result;
}
export function parseChart(payload: any, security: Security, target: string): Quote {
  const result = payload?.chart?.result?.[0];
  if (!result || payload?.chart?.error) throw new Error('価格レスポンスなし');
  const timestamps: number[] = result.timestamp ?? [], prices = result.indicators?.quote?.[0]?.close ?? [], volumes = result.indicators?.quote?.[0]?.volume ?? [];
  let close: string | null = null;
  for (let i = 0; i < timestamps.length; i++) {
    if (jstDate(new Date(timestamps[i] * 1000)) === target && Number.isFinite(prices[i]) && prices[i] > 0 && volumes[i] > 0) close = String(Number(Number(prices[i]).toFixed(6)));
  }
  // 別日の価格やregularMarketPriceを終値へ流用しない。
  if (close === null) throw new Error('対象営業日の終値なし');
  const splitDates = Object.values(result.events?.splits ?? {}).map((v: any) => jstDate(new Date(v.date * 1000))).filter(d => d <= target).sort();
  return { ...security, market: 'TSE', date: target, close, finalQuote: null, status: 'traded', actionDate: splitDates.at(-1) ?? null, corporateActionsChecked:true };
}
export async function fetchPublicSnapshot(dir: string, onProgress?: (count: number, total: number) => void, onPartial?: (snapshot: Snapshot) => void): Promise<Snapshot> {
  await mkdir(dir, {recursive: true});
  const target = expectedDate(new Date(), await calendar());
  let master = await securities(dir);
  const priority = ['7203','9984','8306','6758','6501','7011','6857','6146','8035','5803','285A'];
  master.sort((a,b) => (priority.indexOf(a.code) < 0 ? 9999 : priority.indexOf(a.code)) - (priority.indexOf(b.code) < 0 ? 9999 : priority.indexOf(b.code)));
  // 接続確認用。通常運用では設定しない。
  if (process.env.PUBLIC_PRICE_CODES) {
    const codes = new Set(process.env.PUBLIC_PRICE_CODES.split(','));
    master = master.filter(s => codes.has(s.code));
  }
  if (!master.length) throw new Error('取得対象銘柄なし');
  const cachePath = join(dir, `public-${target}.json`);
  let cache: Record<string, Quote> = {};
  try { cache = JSON.parse(await readFile(cachePath, 'utf8')); } catch { /* 初回 */ }
  if (process.env.PERSONAL_EXISTING_CACHE) {
    try {
      const raw = JSON.parse(await readFile(process.env.PERSONAL_EXISTING_CACHE,'utf8'));
      for (const security of master) {
        const row = raw[security.code];
        if (!cache[security.code] && row?.[0] === target && Number.isFinite(row[1]) && row[1] > 0) {
          cache[security.code] = {...security,market:'TSE',date:target,close:String(row[1]),finalQuote:null,status:'traded',actionDate:null,corporateActionsChecked:false};
        }
      }
    } catch { /* 既存キャッシュがなければ直接取得 */ }
  }
  let cursor = 0, done = 0, blocked = false;
  const quotes: (Quote | undefined)[] = master.map(s => cache[s.code]?.date === target && cache[s.code]?.close ? cache[s.code] : undefined);
  function buildSnapshot() {
    const rows = master.map((security, i) => quotes[i] ?? {...security, market:'TSE', date:target, close:null, finalQuote:null, status:'no-price', actionDate:null});
    const obtained = rows.filter(q => q.close !== null).length;
    return snapshotSchema.parse({version:1, source:'Yahoo Finance（本人用・非公式取得）', tradingDate:target, expectedTradingDate:target,
      generatedAt:new Date().toISOString(), complete:obtained === master.length, licensedForRedistribution:false, usage:'personal',
      coverageNote:`東証の月末銘柄一覧 ${master.length}件中 ${obtained}件の終値取得（処理 ${done}件）。地方単独上場・月中の新規上場・最終気配値は未対応。取得できない銘柄は算出保留。`,
      markets:['TSE'], expectedCount:master.length, quotes:rows});
  }
  if (quotes.some(q => q?.close)) onPartial?.(buildSnapshot());
  async function worker() {
    while (cursor < master.length) {
      const i = cursor++, security = master[i];
      const cached = cache[security.code];
      if (cached?.date === target && cached.close) quotes[i] = cached;
      else {
        try {
          if (blocked) throw new Error('取得元が制限中');
          const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${security.code}.T?range=1y&interval=1d&events=splits`, {signal: AbortSignal.timeout(20_000)});
          if ([403,429].includes(response.status)) { blocked = true; throw new Error('取得元が制限中'); }
          if (!response.ok) throw new Error('取得失敗');
          quotes[i] = parseChart(await response.json(), security, target);
          cache[security.code] = quotes[i];
        } catch {
          quotes[i] = {...security, market:'TSE', date:target, close:null, finalQuote:null, status:'no-price', actionDate:null};
        }
        if (!blocked) await wait(800);
      }
      done++; onProgress?.(done, master.length);
      if (done % 100 === 0) { await writeFile(cachePath, JSON.stringify(cache)); if (quotes.some(q => q?.close)) onPartial?.(buildSnapshot()); }
    }
  }
  await Promise.all([worker(),worker()]);
  await writeFile(cachePath, JSON.stringify(cache));
  const obtained = quotes.filter(q => q?.close).length;
  if (obtained === 0) throw new Error('対象営業日の終値を取得できませんでした');
  return buildSnapshot();
}
