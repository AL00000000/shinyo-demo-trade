import { createServer } from 'node:http';
import { Store } from './store';
import { sync } from './sync';
import { authorized, validAccessToken } from './auth';
const accessToken = process.env.API_ACCESS_TOKEN;
if (!validAccessToken(accessToken)) throw new Error('API_ACCESS_TOKENに32〜256文字の英数字・ハイフン・アンダースコアを設定してください');
const store = new Store(process.env.DATA_DIR ?? './data');
let running = false;
async function update() {
  if (running) return;
  running = true;
  try { console.log('日次取得:', await sync(store)); }
  catch (e) { console.error('日次取得:', (e as Error).message); }
  finally { running = false; }
}
const server = createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (!authorized(req.headers.authorization, accessToken)) { res.writeHead(401); return res.end(JSON.stringify({ error: '本人用の接続キーが必要です' })); }
  if (req.method !== 'GET') { res.writeHead(405); return res.end('{}'); }
  const path = new URL(req.url ?? '/', 'http://localhost').pathname;
  if (path === '/health') return res.end(JSON.stringify({ ok: true, configured: process.env.PRICE_PROVIDER === 'public-personal' || process.env.DATA_LICENSE_CONFIRMED === 'true', ...store.status() }));
  if (path === '/v1/snapshot') {
    const snapshot = store.latest();
    if (!snapshot) { res.writeHead(503); return res.end(JSON.stringify({ error: '終値データ未取得', ...store.status() })); }
    return res.end(JSON.stringify({ snapshot, ...store.status() }));
  }
  res.writeHead(404); res.end('{}');
});
server.listen(Number(process.env.PORT ?? 8787), process.env.HOST ?? '127.0.0.1', () => {
  console.log('終値API起動。ポート', process.env.PORT ?? 8787); void update();
});
// 端末のバックグラウンド起動に頼らずサーバー側で取得。18〜23時JSTに15分間隔で再試行。
const timer = setInterval(() => {
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
  if (hour >= 18) void update();
}, 15 * 60_000);
function shutdown() { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
