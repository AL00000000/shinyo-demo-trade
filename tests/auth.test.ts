import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorized, validAccessToken } from '../server/auth';
test('本人用APIは認証なし・不正キー・短いサーバーキーを拒否する', () => {
  const token = 'test_only_' + 'a'.repeat(32);
  assert.equal(validAccessToken(token), true);
  assert.equal(validAccessToken('short'), false);
  assert.equal(authorized(undefined, token), false);
  assert.equal(authorized(`Bearer ${token}wrong`, token), false);
  assert.equal(authorized(`Bearer ${'b'.repeat(token.length)}`, token), false);
  assert.equal(authorized(`Basic ${token}`, token), false);
  assert.equal(authorized(`Bearer ${token}`, token), true);
  assert.equal(authorized('Bearer short', 'short'), false);
});
