/**
 * Card talent enum IDs (smallint in `talents` arrays). Must match `backend/internal/domain/card_talent.go`.
 * @readonly
 */
export const CardTalent = Object.freeze({
  Draconic: 0,
  Earth: 1,
  Elemental: 2,
  Ice: 3,
  Light: 4,
  Lightning: 5,
  Royal: 6,
  Shadow: 7,
});

/** Ordered names for each ID 0..7. */
export const CARD_TALENT_NAMES = Object.freeze([
  "Draconic",
  "Earth",
  "Elemental",
  "Ice",
  "Light",
  "Lightning",
  "Royal",
  "Shadow",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardTalentName(id) {
  return CARD_TALENT_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardTalentId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_TALENT_NAMES.length;
}
