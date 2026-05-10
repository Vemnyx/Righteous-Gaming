/**
 * Card talent enum IDs (smallint in `talents` arrays). Must match `backend/internal/domain/card_talent.go`.
 * @readonly
 */
export const CardTalent = Object.freeze({
  Chaos: 0,
  Draconic: 1,
  Earth: 2,
  Elemental: 3,
  Ice: 4,
  Light: 5,
  Lightning: 6,
  Mystic: 7,
  Revered: 8,
  Reviled: 9,
  Royal: 10,
  Shadow: 11,
});

/** Ordered names for each ID 0..n. */
export const CARD_TALENT_NAMES = Object.freeze([
  "Chaos",
  "Draconic",
  "Earth",
  "Elemental",
  "Ice",
  "Light",
  "Lightning",
  "Mystic",
  "Revered",
  "Reviled",
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
