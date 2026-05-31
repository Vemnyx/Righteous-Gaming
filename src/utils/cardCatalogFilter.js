import { cardClassName } from "../constants/cardClass";
import { cardRarityName } from "../constants/cardRarity";
import { cardTypeName } from "../constants/cardType";
import { fuzzyMatchQuery } from "./fuzzyMatch";
import { formatCollectorCode } from "./cardPrintings";

/**
 * @param {{ set_code?: string, printings?: { set_code?: string }[] | null } | null | undefined} card
 * @param {string} setCode
 */
export function cardHasSet(card, setCode) {
  const want = String(setCode ?? "").trim().toLowerCase();
  if (!want) return true;
  if (String(card?.set_code ?? "").trim().toLowerCase() === want) return true;
  const printings = card?.printings;
  if (!Array.isArray(printings)) return false;
  return printings.some((p) => String(p?.set_code ?? "").trim().toLowerCase() === want);
}

/**
 * @typedef {{
 *   type?: string,
 *   rarity?: string,
 *   pitch?: string,
 *   cardClass?: string,
 * }} CatalogAdvancedFilters
 */

/** @type {CatalogAdvancedFilters} */
export const EMPTY_CATALOG_ADVANCED_FILTERS = {
  type: "",
  rarity: "",
  pitch: "",
  cardClass: "",
};

/**
 * @param {CatalogAdvancedFilters} filters
 */
export function countActiveAdvancedFilters(filters) {
  let n = 0;
  if (filters.type !== "") n++;
  if (filters.rarity !== "") n++;
  if (filters.pitch !== "") n++;
  if (filters.cardClass !== "") n++;
  return n;
}

/**
 * @param {{
 *   name?: string,
 *   card_identifier?: string | null,
 *   set_code?: string,
 *   set_num?: number,
 *   set_name?: string,
 *   type?: number,
 *   rarity?: number | null,
 *   pitch?: number | null,
 *   classes?: number[],
 * }} card
 */
export function cardSearchHaystack(card) {
  const parts = [
    card.name,
    card.card_identifier,
    card.set_name,
    card.set_code,
    formatCollectorCode(card.set_code, card.set_num),
    cardTypeName(card.type),
    card.rarity != null ? cardRarityName(card.rarity) : null,
  ];
  if (Array.isArray(card.classes)) {
    for (const id of card.classes) {
      const name = cardClassName(id);
      if (name) parts.push(name);
    }
  }
  return parts.filter(Boolean).join(" ");
}

/**
 * @param {Parameters<typeof cardSearchHaystack>[0]} card
 * @param {string} query
 */
export function cardMatchesSearch(card, query) {
  return fuzzyMatchQuery(cardSearchHaystack(card), query);
}

/**
 * @param {Parameters<typeof cardSearchHaystack>[0]} card
 * @param {CatalogAdvancedFilters} filters
 */
export function cardMatchesAdvancedFilters(card, filters) {
  if (filters.type !== "" && String(card.type) !== filters.type) return false;
  if (filters.rarity !== "") {
    if (card.rarity == null || String(card.rarity) !== filters.rarity) return false;
  }
  if (filters.pitch !== "") {
    if (card.pitch == null || String(card.pitch) !== filters.pitch) return false;
  }
  if (filters.cardClass !== "") {
    const want = Number.parseInt(filters.cardClass, 10);
    if (!Number.isFinite(want)) return false;
    const classes = Array.isArray(card.classes) ? card.classes : [];
    if (!classes.includes(want)) return false;
  }
  return true;
}

/**
 * @param {Parameters<typeof cardSearchHaystack>[0]} card
 * @param {{ query?: string, setCode?: string, advanced?: CatalogAdvancedFilters }} opts
 */
export function filterCatalogCard(card, opts) {
  const query = opts.query ?? "";
  const setCode = opts.setCode ?? "";
  const advanced = opts.advanced ?? EMPTY_CATALOG_ADVANCED_FILTERS;
  if (!cardMatchesSearch(card, query)) return false;
  if (!cardHasSet(card, setCode)) return false;
  if (!cardMatchesAdvancedFilters(card, advanced)) return false;
  return true;
}
