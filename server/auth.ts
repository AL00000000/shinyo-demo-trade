import { timingSafeEqual } from 'node:crypto';
export function validAccessToken(token: string | undefined): token is string {
  return !!token && /^[A-Za-z0-9_-]{32,256}$/.test(token);
}
export function authorized(header: string | undefined, token: string): boolean {
  if (!validAccessToken(token) || !header?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7)), expected = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
