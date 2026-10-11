import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSecurityIndex, searchSecurities } from '../src/security-search';

const index = buildSecurityIndex();
test('price connection is unnecessary for Japanese name and partial name lookup', () => {
  assert.ok(searchSecurities(index, 'トヨタ').some(s => s.code === '7203'));
  assert.ok(searchSecurities(index, 'ソニー').some(s => s.code === '6758'));
  assert.deepEqual(searchSecurities(index, ''), []);
  assert.deepEqual(searchSecurities(index, '存在しない架空の銘柄名'), []);
});
test('hiragana, halfwidth kana, fullwidth code, and Latin letter case normalize', () => {
  assert.ok(searchSecurities(index, 'とよた').some(s => s.code === '7203'));
  assert.ok(searchSecurities(index, 'ﾄﾖﾀ').some(s => s.code === '7203'));
  assert.equal(searchSecurities(index, '７２０３')[0].code, '7203');
  assert.ok(searchSecurities(index, 'sbi').some(s => s.code === '8473'));
  assert.equal(searchSecurities(index, '２８５ａ')[0].code, '285A');
});
test('snapshot adds new names and markets do not duplicate a code', () => {
  const updated = buildSecurityIndex([{code:'7203',name:'トヨタ更新名'},{code:'7203',name:'トヨタ更新名'},{code:'999A',name:'追加テスト社'}]);
  assert.deepEqual(searchSecurities(updated, 'トヨタ更新名'), [{code:'7203',name:'トヨタ更新名'}]);
  assert.deepEqual(searchSecurities(updated, '追加テスト'), [{code:'999A',name:'追加テスト社'}]);
  assert.equal(searchSecurities(updated, '株').length, 8);
});
