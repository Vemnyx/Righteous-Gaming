/**
 * Card type line enum IDs (smallint on cards.type). Must match `backend/internal/domain/card_type.go`.
 * @readonly
 */
export const CardType = Object.freeze({
  Action: 0,
  AttackReaction: 1,
  Block: 2,
  Companion: 3,
  DefenseReaction: 4,
  DemiHero: 5,
  Equipment: 6,
  Hero: 7,
  Instant: 8,
  Macro: 9,
  Mentor: 10,
  Resource: 11,
  Token: 12,
  Weapon: 13,
});

/** Ordered display names for each ID 0..13. */
export const CARD_TYPE_NAMES = Object.freeze([
  "Non-Attack Action",
  "Attack Reaction",
  "Block",
  "Companion",
  "Defense Reaction",
  "Demi-Hero",
  "Equipment",
  "Hero",
  "Instant",
  "Macro",
  "Mentor",
  "Resource",
  "Token",
  "Weapon",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardTypeName(id) {
  return CARD_TYPE_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardTypeId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_TYPE_NAMES.length;
}
