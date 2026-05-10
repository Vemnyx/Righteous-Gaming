/**
 * Fusion enum IDs (smallint in `fusions` arrays). Must match `backend/internal/domain/card_fusion.go`.
 * @readonly
 */
export const CardFusion = Object.freeze({
  Earth: 0,
  Ice: 1,
  Lightning: 2,
});

/** Ordered names for each ID 0..2. */
export const CARD_FUSION_NAMES = Object.freeze(["Earth", "Ice", "Lightning"]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardFusionName(id) {
  return CARD_FUSION_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardFusionId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_FUSION_NAMES.length;
}
