/**
 * Card keyword enum IDs (smallint in `keywords` arrays). Must match `backend/internal/domain/card_keyword.go`.
 * @readonly
 */
export const CardKeyword = Object.freeze({
  ArcaneBarrier: 0,
  Battleworn: 1,
  BladeBreak: 2,
  BloodDebt: 3,
  Boost: 4,
  Channel: 5,
  Charge: 6,
  Combo: 7,
  Crush: 8,
  Dominate: 9,
  Essence: 10,
  Freeze: 11,
  Fusion: 12,
  GoAgain: 13,
  Heave: 14,
  Intimidate: 15,
  Legendary: 16,
  Mentor: 17,
  Negate: 18,
  Opt: 19,
  Phantasm: 20,
  Reload: 21,
  Reprise: 22,
  Specialization: 23,
  Spectra: 24,
  Spellvoid: 25,
  Temper: 26,
  Thaw: 27,
  Unfreeze: 28,
});

/** Ordered display names for each ID 0..28. */
export const CARD_KEYWORD_NAMES = Object.freeze([
  "Arcane Barrier",
  "Battleworn",
  "Blade Break",
  "Blood Debt",
  "Boost",
  "Channel",
  "Charge",
  "Combo",
  "Crush",
  "Dominate",
  "Essence",
  "Freeze",
  "Fusion",
  "Go Again",
  "Heave",
  "Intimidate",
  "Legendary",
  "Mentor",
  "Negate",
  "Opt",
  "Phantasm",
  "Reload",
  "Reprise",
  "Specialization",
  "Spectra",
  "Spellvoid",
  "Temper",
  "Thaw",
  "Unfreeze",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardKeywordName(id) {
  return CARD_KEYWORD_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardKeywordId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_KEYWORD_NAMES.length;
}
