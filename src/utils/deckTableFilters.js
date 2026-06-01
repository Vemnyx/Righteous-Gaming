import { CARD_FORMAT_NAMES, CardFormat, cardFormatName } from "../constants/cardFormat";
import { deckHeroLabel } from "./deckHeroLabel";

/** @typedef {{ id: number, name: string, format: number, hero: number, set_id?: number | null, fabrary_format?: string | null, deck_source_id: number, source: string }} DeckRowLike */

/** @typedef {{ value: string, label: string }} DeckFilterOption */

export const DECK_FILTER_ALL = "";

/**
 * @param {DeckRowLike} row
 * @returns {boolean}
 */
export function isDeckDraft(row) {
  return row.format === CardFormat.Limited && row.fabrary_format === "Draft";
}

/**
 * @param {DeckRowLike} row
 * @param {string} formatFilter
 * @returns {boolean}
 */
export function matchesDeckFormatFilter(row, formatFilter) {
  if (formatFilter === DECK_FILTER_ALL) return true;

  if (formatFilter === "draft") {
    return isDeckDraft(row);
  }

  if (formatFilter.startsWith("set-draft:")) {
    const setId = Number.parseInt(formatFilter.slice("set-draft:".length), 10);
    if (!Number.isFinite(setId)) return false;
    return isDeckDraft(row) && row.set_id === setId;
  }

  if (formatFilter.startsWith("limited:")) {
    const suffix = formatFilter.slice("limited:".length);
    return row.format === CardFormat.Limited && row.fabrary_format === suffix;
  }

  if (formatFilter.startsWith("format:")) {
    const fmt = Number.parseInt(formatFilter.slice("format:".length), 10);
    if (!Number.isFinite(fmt)) return false;
    return row.format === fmt;
  }

  return true;
}

/**
 * @param {DeckRowLike} row
 * @param {string} heroFilter
 * @returns {boolean}
 */
export function matchesDeckHeroFilter(row, heroFilter) {
  if (heroFilter === DECK_FILTER_ALL) return true;
  if (!heroFilter.startsWith("hero:")) return true;
  const hero = Number.parseInt(heroFilter.slice("hero:".length), 10);
  if (!Number.isFinite(hero)) return true;
  return row.hero === hero;
}

/**
 * @param {DeckRowLike} row
 * @param {string} sourceFilter
 * @returns {boolean}
 */
export function matchesDeckSourceFilter(row, sourceFilter) {
  if (sourceFilter === DECK_FILTER_ALL) return true;
  if (!sourceFilter.startsWith("source:")) return true;
  const sourceId = Number.parseInt(sourceFilter.slice("source:".length), 10);
  if (!Number.isFinite(sourceId)) return true;
  return row.deck_source_id === sourceId;
}

/**
 * @param {DeckRowLike} row
 * @param {{ format: string, hero: string, source: string }} filters
 * @returns {boolean}
 */
export function matchesDeckTableFilters(row, filters) {
  return (
    matchesDeckFormatFilter(row, filters.format) &&
    matchesDeckHeroFilter(row, filters.hero) &&
    matchesDeckSourceFilter(row, filters.source)
  );
}

/**
 * @param {DeckRowLike[]} rows
 * @param {Record<number, string>} setNameById
 * @returns {DeckFilterOption[]}
 */
export function buildDeckFormatFilterOptions(rows, setNameById) {
  /** @type {DeckFilterOption[]} */
  const options = [{ value: DECK_FILTER_ALL, label: "All formats" }];

  if (rows.some(isDeckDraft)) {
    options.push({ value: "draft", label: "Draft" });
  }

  /** @type {number[]} */
  const setIdsWithDraft = [];
  const seenSet = new Set();
  for (const row of rows) {
    if (!isDeckDraft(row) || row.set_id == null || seenSet.has(row.set_id)) continue;
    seenSet.add(row.set_id);
    setIdsWithDraft.push(row.set_id);
  }
  setIdsWithDraft.sort((a, b) =>
    (setNameById[a] ?? "").localeCompare(setNameById[b] ?? "", undefined, { sensitivity: "base" }),
  );
  for (const setId of setIdsWithDraft) {
    const setName = setNameById[setId];
    if (!setName) continue;
    options.push({ value: `set-draft:${setId}`, label: `${setName} Draft` });
  }

  for (const suffix of ["Limited", "Sealed"]) {
    if (rows.some((r) => r.format === CardFormat.Limited && r.fabrary_format === suffix)) {
      options.push({ value: `limited:${suffix}`, label: suffix });
    }
  }

  /** @type {Set<number>} */
  const otherFormatIds = new Set();
  for (const row of rows) {
    if (row.format === CardFormat.Limited) continue;
    otherFormatIds.add(row.format);
  }
  const sortedFmt = [...otherFormatIds].sort((a, b) => a - b);
  for (const fmt of sortedFmt) {
    const label = cardFormatName(fmt) ?? `Format ${fmt}`;
    options.push({ value: `format:${fmt}`, label });
  }

  return options;
}

/**
 * @param {DeckRowLike[]} rows
 * @returns {DeckFilterOption[]}
 */
export function buildDeckHeroFilterOptions(rows) {
  /** @type {DeckFilterOption[]} */
  const options = [{ value: DECK_FILTER_ALL, label: "All heroes" }];

  /** @type {Map<number, string>} */
  const byId = new Map();
  for (const row of rows) {
    if (byId.has(row.hero)) continue;
    byId.set(row.hero, deckHeroLabel(row));
  }

  const sorted = [...byId.entries()].sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
  );
  for (const [heroId, label] of sorted) {
    options.push({ value: `hero:${heroId}`, label });
  }
  return options;
}

/**
 * @param {DeckRowLike[]} rows
 * @returns {DeckFilterOption[]}
 */
export function buildDeckSourceFilterOptions(rows) {
  /** @type {DeckFilterOption[]} */
  const options = [{ value: DECK_FILTER_ALL, label: "All sources" }];

  /** @type {Map<number, string>} */
  const byId = new Map();
  for (const row of rows) {
    const label = String(row.source ?? "").trim();
    if (!label || byId.has(row.deck_source_id)) continue;
    byId.set(row.deck_source_id, label);
  }

  const sorted = [...byId.entries()].sort((a, b) =>
    a[1].localeCompare(b[1], undefined, { sensitivity: "base" }),
  );
  for (const [sourceId, label] of sorted) {
    options.push({ value: `source:${sourceId}`, label });
  }
  return options;
}

/**
 * @param {DeckRowLike} row
 * @param {Record<number, string>} setNameById
 * @returns {string}
 */
export function deckFormatColumnLabel(row, setNameById) {
  if (row.format === CardFormat.Limited) {
    const suffix = row.fabrary_format != null ? String(row.fabrary_format).trim() : "";
    if (suffix === "Draft" && row.set_id != null && setNameById[row.set_id]) {
      return `${setNameById[row.set_id]} Draft`;
    }
    if (suffix) return suffix;
    return cardFormatName(row.format) ?? CARD_FORMAT_NAMES[0];
  }
  return cardFormatName(row.format) ?? String(row.format);
}
