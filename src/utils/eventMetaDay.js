/** @typedef {"day1" | "day2"} MetaDay */
/** @typedef {"cc" | "draft"} MetaSharePhase */

/** @type {2} Nationals event_type from backend domain.EventTypeNationals */
export const EVENT_TYPE_NATIONALS = 2;

export const META_DAY1_MAX_ROUND = 8;
export const META_DAY2_MIN_ROUND = 9;

export const NATIONALS_CC_MAX_ROUND = 5;
export const NATIONALS_DRAFT_DAY1_MIN_ROUND = 6;
export const NATIONALS_DRAFT_DAY2_MIN_ROUND = 9;
export const NATIONALS_DRAFT_DAY2_MAX_ROUND = 11;
export const NATIONALS_CC_DAY2_MIN_ROUND = 12;
export const NATIONALS_CC_DAY2_MAX_ROUND = 15;

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

/** @param {number | undefined | null} eventType */
export function showNationalsFormatSplit(eventType) {
  return Number(eventType) === EVENT_TYPE_NATIONALS;
}

/**
 * @param {MetaDay} metaDay
 * @param {MetaSharePhase} metaSharePhase
 * @param {number | undefined | null} eventType
 * @param {"share" | "round-stats" | "matchups"} metaSubTab
 */
export function metaEffectiveSharePhase(_metaDay, metaSharePhase, eventType, metaSubTab) {
  if (metaSubTab !== "share" || !showNationalsFormatSplit(eventType)) return null;
  return metaSharePhase;
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
export function metaEffectiveThroughRound(metaDay, metaSubTab, metaRound, rounds, eventType, metaSharePhase) {
  if (metaSubTab === "matchups") {
    return metaMaxRoundNumber(rounds) || metaRound;
  }
  const sharePhase = metaEffectiveSharePhase(metaDay, metaSharePhase, eventType, metaSubTab);
  if (sharePhase === "cc") {
    return metaDay === "day2" ? NATIONALS_CC_DAY2_MAX_ROUND : NATIONALS_CC_MAX_ROUND;
  }
  if (sharePhase === "draft" && metaDay === "day1") return META_DAY1_MAX_ROUND;
  if (sharePhase === "draft" && metaDay === "day2") return NATIONALS_DRAFT_DAY2_MAX_ROUND;
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
export function metaEffectiveFromRound(metaDay, metaSubTab, rounds, eventType, metaSharePhase) {
  if (metaSubTab === "matchups") return 1;
  const sharePhase = metaEffectiveSharePhase(metaDay, metaSharePhase, eventType, metaSubTab);
  if (sharePhase === "cc") {
    return metaDay === "day2" ? NATIONALS_CC_DAY2_MIN_ROUND : 1;
  }
  if (sharePhase === "draft" && metaDay === "day1") return NATIONALS_DRAFT_DAY1_MIN_ROUND;
  if (sharePhase === "draft" && metaDay === "day2") return NATIONALS_DRAFT_DAY2_MIN_ROUND;
  if (!showMetaDaySplit(rounds)) return 1;
  return metaDayRoundRange(metaDay, rounds).from;
}

/** @param {number} maxRound */
export function defaultMetaDay(maxRound) {
  return maxRound > META_DAY1_MAX_ROUND ? "day2" : "day1";
}
