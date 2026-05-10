/**
 * Card type line enum IDs (smallint on cards.type). Must match `backend/internal/domain/card_type.go`.
 * @readonly
 */
export const CardType = Object.freeze({
  NonAttackAction: 0,
  AttackAction: 1,
  AttackReaction: 2,
  DefenseReaction: 3,
  Equipment: 4,
  Hero: 5,
  Instant: 6,
  Mentor: 7,
  Resource: 8,
  Token: 9,
  Weapon: 10,
});

/** Ordered display names for each ID 0..10. */
export const CARD_TYPE_NAMES = Object.freeze([
  "Non-Attack Action",
  "Attack Action",
  "Attack Reaction",
  "Defense Reaction",
  "Equipment",
  "Hero",
  "Instant",
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
