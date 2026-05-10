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
