import { pathToFileURL } from 'node:url';
import { Store } from './store';
import { fetchLicensedSnapshot } from './provider';
export async function sync(store: Store) {
  try {
    const snapshot = store.put(await fetchLicensedSnapshot());
    store.attempt(null);
    return { date: snapshot.tradingDate, count: snapshot.quotes.length };
  } catch (e) {
    // 接続URL/秘密鍵/配信レスポンスを公開ステータスやログに出さない。
    const message = e instanceof Error && !e.message.includes('://') && !e.message.includes('"') ? e.message : 'データ取得または検証に失敗';
    store.attempt(message);
    throw new Error(message);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = new Store(process.env.DATA_DIR ?? './data');
  sync(store).then(result => console.log(JSON.stringify(result))).catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => store.close());
}
