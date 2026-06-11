/**
 * Deck / legality format enum IDs (smallint in `formats` arrays). Must match `backend/internal/domain/card_format.go`.
 * @readonly
 */
export const CardFormat = Object.freeze({
  Limited: 0,
  SilverAge: 1,
  GoldenAge: 2,
  ClassicConstruction: 3,
  LivingLegend: 4,
});

/** Ordered display names for each ID 0..4. */
export const CARD_FORMAT_NAMES = Object.freeze([
  "Limited",
  "Silver Age",
  "Golden Age",
  "Classic Construction",
  "Living Legend",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardFormatName(id) {
  return CARD_FORMAT_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardFormatId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_FORMAT_NAMES.length;
}

/**
 * Competitive formats and which hero age pool they use.
 * Must match `backend/internal/domain/card_format.go` (`formatUsesYoungHeroes`).
 *
 * @type {Readonly<Record<number, boolean>>}
 */
export const FORMAT_USES_YOUNG_HEROES = Object.freeze({
  [CardFormat.Limited]: true,
  [CardFormat.SilverAge]: true,
  [CardFormat.GoldenAge]: false,
  [CardFormat.ClassicConstruction]: false,
  [CardFormat.LivingLegend]: false,
});

/**
 * @param {number | null | undefined} formatId
 * @returns {boolean | undefined} true = young heroes, false = adult; undefined when unknown format
 */
export function formatUsesYoungHeroes(formatId) {
  if (formatId == null || !isValidCardFormatId(formatId)) return undefined;
  return FORMAT_USES_YOUNG_HEROES[formatId];
}
