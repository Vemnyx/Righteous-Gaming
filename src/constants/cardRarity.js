/**
 * Card rarity enum IDs (smallint). Must match `backend/internal/domain/card_rarity.go`.
 * @readonly
 */
export const CardRarity = Object.freeze({
  Token: 0,
  Common: 1,
  Rare: 2,
  SuperRare: 3,
  Majestic: 4,
  Legendary: 5,
  Fabled: 6,
  Promo: 7,
});

/** Ordered display names for each ID 0..7. */
export const CARD_RARITY_NAMES = Object.freeze([
  "Token",
  "Common",
  "Rare",
  "Super Rare",
  "Majestic",
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
