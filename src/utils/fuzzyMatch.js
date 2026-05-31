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
