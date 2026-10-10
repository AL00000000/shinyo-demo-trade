import { snapshotSchema, type Snapshot } from '../src/schema';
export async function fetchLicensedSnapshot(): Promise<Snapshot> {
  if (process.env.DATA_LICENSE_CONFIRMED !== 'true') throw new Error('株価データのアプリ配信契約が未設定です');
  const rawUrl = process.env.LICENSED_FEED_URL;
  if (!rawUrl || new URL(rawUrl).protocol !== 'https:') throw new Error('契約済み配信元のHTTPS URLが必要です');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.LICENSED_FEED_TOKEN) headers.Authorization = `Bearer ${process.env.LICENSED_FEED_TOKEN}`;
  const response = await fetch(rawUrl, { headers, signal: AbortSignal.timeout(120_000), redirect: 'error' });
  if (!response.ok) throw new Error(`データ配信元HTTP ${response.status}`);
  const text = await response.text();
  if (text.length > 15_000_000) throw new Error('配信サイズ上限を超えました');
  const snapshot = snapshotSchema.parse(JSON.parse(text));
  const age = Date.now() - Date.parse(snapshot.generatedAt);
  if (age < -300_000 || age > 30 * 3600_000) throw new Error('配信元の営業日カレンダー/生成時刻が古いか不正です');
  const jstDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  if (snapshot.tradingDate > jstDate) throw new Error('未来の取引日は不可');
  const markets = (process.env.REQUIRED_MARKETS ?? 'TSE,NSE,FSE,SSE').split(',');
  if (markets.some(m => !snapshot.markets.includes(m as Snapshot['markets'][number]))) throw new Error('対象市場が欠落しています');
  return snapshot;
}
