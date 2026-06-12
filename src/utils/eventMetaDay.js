/** @typedef {"day1" | "day2"} MetaDay */

export const META_DAY1_MAX_ROUND = 8;
export const META_DAY2_MIN_ROUND = 9;

/** @param {{ round_number?: number }[]} rounds */
export function metaMaxRoundNumber(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) return 0;
  return rounds.reduce((max, r) => {
    const n = Number(r.round_number);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0);
}

/** @param {{ round_number?: number }[]} rounds */
export function showMetaDaySplit(rounds) {
  return metaMaxRoundNumber(rounds) > META_DAY1_MAX_ROUND;
}

/**
 * @param {MetaDay} metaDay
 * @param {{ round_number?: number }[]} rounds
 */
export function metaDayRoundRange(metaDay, rounds) {
  const maxRound = metaMaxRoundNumber(rounds);
  if (metaDay === "day1") {
    return { from: 1, through: META_DAY1_MAX_ROUND, maxInDay: Math.min(META_DAY1_MAX_ROUND, maxRound) };
  }
  return { from: META_DAY2_MIN_ROUND, through: maxRound, maxInDay: maxRound };
}

/**
 * @param {MetaDay} metaDay
 * @param {{ round_number?: number }[]} rounds
 */
export function metaDayRounds(metaDay, rounds) {
  if (!showMetaDaySplit(rounds)) return rounds;
  if (metaDay === "day1") {
    return rounds.filter((r) => Number(r.round_number) <= META_DAY1_MAX_ROUND);
  }
  return rounds.filter((r) => Number(r.round_number) >= META_DAY2_MIN_ROUND);
}

/**
 * @param {MetaDay} metaDay
 * @param {"share" | "round-stats" | "matchups"} metaSubTab
 * @param {number} metaRound
 * @param {{ round_number?: number }[]} rounds
 */
export function metaEffectiveThroughRound(metaDay, metaSubTab, metaRound, rounds) {
  if (metaSubTab === "matchups") {
    return metaMaxRoundNumber(rounds) || metaRound;
  }
  if (!showMetaDaySplit(rounds)) return metaRound;
  const range = metaDayRoundRange(metaDay, rounds);
  if (metaSubTab === "share") return range.maxInDay;
  return metaRound;
}

/**
 * @param {MetaDay} metaDay
 * @param {"share" | "round-stats" | "matchups"} metaSubTab
 * @param {{ round_number?: number }[]} rounds
 */
export function metaEffectiveFromRound(metaDay, metaSubTab, rounds) {
  if (metaSubTab === "matchups") return 1;
  if (!showMetaDaySplit(rounds)) return 1;
  return metaDayRoundRange(metaDay, rounds).from;
}

/** @param {number} maxRound */
export function defaultMetaDay(maxRound) {
  return maxRound > META_DAY1_MAX_ROUND ? "day2" : "day1";
}
