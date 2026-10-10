import * as SecureStore from 'expo-secure-store';
const key = 'shinyo-personal-api-key';
export const readAccessKey = () => SecureStore.getItemAsync(key);
export const saveAccessKey = (value: string | null) => value ? SecureStore.setItemAsync(key,value) : SecureStore.deleteItemAsync(key);
export const keyStorageNote = '保存を選んだ場合、接続キーはこの端末の保護領域に保存します。バックアップには含めません。';
export function consumeSetupKey(): string | null { return null; }
