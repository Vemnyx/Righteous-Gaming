/**
 * Hero / card class enum IDs (smallint). Must match `backend/internal/domain/card_class.go`.
 * @readonly
 */
export const CardClass = Object.freeze({
  NotClassed: 0,
  Generic: 1,
  Adjudicator: 2,
  Bard: 3,
  Brute: 4,
  Guardian: 5,
  Illusionist: 6,
  Mechanologist: 7,
  Merchant: 8,
  Ninja: 9,
  Ranger: 10,
  Runeblade: 11,
  Shapeshifter: 12,
  Warrior: 13,
  Wizard: 14,
});

/** Ordered names for each ID 0..14 (API / display). */
export const CARD_CLASS_NAMES = Object.freeze([
  "NotClassed",
  "Generic",
  "Adjudicator",
  "Bard",
  "Brute",
  "Guardian",
  "Illusionist",
  "Mechanologist",
  "Merchant",
  "Ninja",
  "Ranger",
  "Runeblade",
  "Shapeshifter",
  "Warrior",
  "Wizard",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardClassName(id) {
  return CARD_CLASS_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardClassId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_CLASS_NAMES.length;
}
