/**
 * Card rarity enum IDs (smallint). Must match `backend/internal/domain/card_rarity.go`.
 * @readonly
 */
export const CardRarity = Object.freeze({
  Basic: 0,
  Token: 1,
  Common: 2,
  Rare: 3,
  SuperRare: 4,
  Majestic: 5,
  Marvel: 6,
  Legendary: 7,
  Fabled: 8,
  Promo: 9,
});

/** Ordered display names for each ID 0..9. */
export const CARD_RARITY_NAMES = Object.freeze([
  "Basic",
  "Token",
  "Common",
  "Rare",
  "Super Rare",
  "Majestic",
  "Marvel",
  "Legendary",
  "Fabled",
  "Promo",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardRarityName(id) {
  return CARD_RARITY_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardRarityId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_RARITY_NAMES.length;
}
