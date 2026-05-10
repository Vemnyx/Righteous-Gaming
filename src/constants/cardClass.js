/**
 * Hero / card class enum IDs (smallint). Must match `backend/internal/domain/card_class.go`.
 * @readonly
 */
export const CardClass = Object.freeze({
  NotClassed: 0,
  Generic: 1,
  Adjudicator: 2,
  Assassin: 3,
  Bard: 4,
  Brute: 5,
  Guardian: 6,
  Illusionist: 7,
  Mechanologist: 8,
  Merchant: 9,
  Necromancer: 10,
  Ninja: 11,
  Pirate: 12,
  Ranger: 13,
  Runeblade: 14,
  Shapeshifter: 15,
  Thief: 16,
  Warrior: 17,
  Wizard: 18,
});

/** Ordered names for each ID 0..18 (API / display). */
export const CARD_CLASS_NAMES = Object.freeze([
  "NotClassed",
  "Generic",
  "Adjudicator",
  "Assassin",
  "Bard",
  "Brute",
  "Guardian",
  "Illusionist",
  "Mechanologist",
  "Merchant",
  "Necromancer",
  "Ninja",
  "Pirate",
  "Ranger",
  "Runeblade",
  "Shapeshifter",
  "Thief",
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
