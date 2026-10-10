const key = 'shinyo-personal-api-key';
export async function readAccessKey() { return localStorage.getItem(key); }
export async function saveAccessKey(value: string | null) { if(value) localStorage.setItem(key,value); else localStorage.removeItem(key); }
export const keyStorageNote = '保存を選んだ場合、接続キーはこのブラウザ内に保存します。自分専用の端末で使ってください。バックアップには含めません。';
export function consumeSetupKey(): string | null {
  const value = new URLSearchParams(location.hash.slice(1)).get('connect');
  if (!value || !/^[A-Za-z0-9_-]{32,256}$/.test(value)) return null;
  // フラグメントはHTTPやRefererに含まれない。設定後は履歴のURLからも除く。
  history.replaceState(null,'',location.pathname+location.search);
  return value;
}
