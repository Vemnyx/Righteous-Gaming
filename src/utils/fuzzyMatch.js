/** @param {unknown} value */
export function normalizeForSearch(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Simple fuzzy match: substring on normalized text, or query chars appear in order (subsequence).
 * @param {unknown} haystack
 * @param {unknown} needle
 */
export function fuzzyMatch(haystack, needle) {
  const n = normalizeForSearch(needle);
  if (!n) return true;
  const h = normalizeForSearch(haystack);
  if (!h) return false;
  if (h.includes(n)) return true;
  let hi = 0;
  for (let i = 0; i < n.length; i++) {
    const ch = n[i];
    while (hi < h.length && h[hi] !== ch) hi++;
    if (hi >= h.length) return false;
    hi++;
  }
  return true;
}

/**
 * @param {unknown} haystack
 * @param {unknown} query
 */
export function fuzzyMatchQuery(haystack, query) {
  const q = String(query ?? "").trim();
  if (!q) return true;
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => fuzzyMatch(haystack, token));
}

/** Card names use fuzzy matching for the first four normalized characters only. */
export const CARD_NAME_FUZZY_PREFIX_LEN = 4;

/**
 * Match a card name: fuzzy for queries up to four characters,
 * then require an exact case-insensitive phrase (or normalized substring).
 * @param {unknown} name
 * @param {unknown} query
 */
export function cardNameMatchesSearch(name, query) {
  const rawQuery = String(query ?? "").trim();
  if (!rawQuery) return true;
  const rawName = String(name ?? "");
  if (!rawName) return false;

  if (rawQuery.length <= CARD_NAME_FUZZY_PREFIX_LEN) {
    // Short queries must be a real contiguous substring (normalized).
    // Using subsequence matching here is far too permissive (e.g. "fate" matches "Deflate").
    const qNorm = normalizeForSearch(rawQuery);
    if (!qNorm) return true;
    const hNorm = normalizeForSearch(rawName);
    return Boolean(hNorm) && hNorm.includes(qNorm);
  }

  const queryLower = rawQuery.toLowerCase();
  const nameLower = rawName.toLowerCase();
  if (nameLower.includes(queryLower)) return true;

  const qNorm = normalizeForSearch(rawQuery);
  const hNorm = normalizeForSearch(rawName);
  return qNorm.length > 0 && hNorm.includes(qNorm);
}
