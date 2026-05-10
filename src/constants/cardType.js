/**
 * Card type line enum IDs (smallint on cards.type). Must match `backend/internal/domain/card_type.go`.
 * @readonly
 */
export const CardType = Object.freeze({
  NonAttackAction: 0,
  AttackAction: 1,
  AttackReaction: 2,
  Block: 3,
  Companion: 4,
  DefenseReaction: 5,
  DemiHero: 6,
  Equipment: 7,
  Hero: 8,
  Instant: 9,
  Macro: 10,
  Mentor: 11,
  Resource: 12,
  Token: 13,
  Weapon: 14,
});

/** Ordered display names for each ID 0..14. */
export const CARD_TYPE_NAMES = Object.freeze([
  "Non-Attack Action",
  "Attack Action",
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
