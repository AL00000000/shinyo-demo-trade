import bundled from './securities.json';

type Security = { code: string; name: string };
type IndexedSecurity = Security & { normalizedName: string; normalizedCode: string };

export function normalizeSearch(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s+/g, '');
}

// The bundled JPX list makes name lookup independent of the price API connection.
export function buildSecurityIndex(extra: readonly Security[] = []): IndexedSecurity[] {
  const byCode = new Map<string, Security>(bundled.map(row => [row.code, row]));
  for (const row of extra) if (row.name.trim()) byCode.set(row.code, row);
  return [...byCode.values()].map(row => ({ code: row.code, name: row.name, normalizedName: normalizeSearch(row.name), normalizedCode: normalizeSearch(row.code) }));
}

export function searchSecurities(index: readonly IndexedSecurity[], query: string, limit = 8): Security[] {
  const needle = normalizeSearch(query);
  if (!needle) return [];
  const rank = (row: IndexedSecurity) => row.normalizedCode === needle || row.normalizedName === needle ? 0 : row.normalizedName.startsWith(needle) || row.normalizedCode.startsWith(needle) ? 1 : 2;
  return index.filter(row => row.normalizedName.includes(needle) || row.normalizedCode.includes(needle))
    .sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code))
    .slice(0, limit).map(({ code, name }) => ({ code, name }));
}
