/** @typedef {{
 *   hero_id: number,
 *   name: string,
 *   art_image_url?: string | null,
 *   card_image_url?: string | null,
 * }} MetaHeroRef */

/** @typedef {{
 *   hero_id: number,
 *   name: string,
 *   art_image_url?: string | null,
 *   count: number,
 *   pct: number,
 * }} MetaShareEntry */

/** @typedef {{
 *   total_decks: number,
 *   source_round: number,
 *   source_round_label?: string | null,
 *   heroes: MetaShareEntry[],
 * }} OverallMetaShare */

/** @typedef {{
 *   hero_id: number,
 *   name: string,
 *   art_image_url?: string | null,
 *   wins: number,
 *   losses: number,
 *   games: number,
 *   win_rate: number,
 * }} HeroWinRateRow */

/** @typedef {{
 *   overall: OverallMetaShare,
 *   from_round?: number,
 *   through_round: number,
 *   hero_win_rates: HeroWinRateRow[],
 *   matchup_heroes: MetaHeroRef[],
 *   matchup_matrix: (number | null)[][],
 * }} EventMetaSnapshot */

export function parseEventMetaSnapshot(raw) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const overallRaw = o.overall;
  if (overallRaw == null || typeof overallRaw !== "object" || Array.isArray(overallRaw)) return null;

  const overallObj = /** @type {Record<string, unknown>} */ (overallRaw);
  /** @type {MetaShareEntry[]} */
  const heroes = [];
  if (Array.isArray(overallObj.heroes)) {
    for (const item of overallObj.heroes) {
      if (item == null || typeof item !== "object") continue;
      const h = /** @type {Record<string, unknown>} */ (item);
      heroes.push({
        hero_id: Number(h.hero_id) || 0,
        name: String(h.name ?? ""),
        art_image_url: h.art_image_url != null ? String(h.art_image_url) : null,
        count: Number(h.count) || 0,
        pct: Number(h.pct) || 0,
      });
    }
  }

  /** @type {HeroWinRateRow[]} */
  const winRates = [];
  if (Array.isArray(o.hero_win_rates)) {
    for (const item of o.hero_win_rates) {
      if (item == null || typeof item !== "object") continue;
      const h = /** @type {Record<string, unknown>} */ (item);
      winRates.push({
        hero_id: Number(h.hero_id) || 0,
        name: String(h.name ?? ""),
        art_image_url: h.art_image_url != null ? String(h.art_image_url) : null,
        wins: Number(h.wins) || 0,
        losses: Number(h.losses) || 0,
        games: Number(h.games) || 0,
        win_rate: Number(h.win_rate) || 0,
      });
    }
  }

  /** @type {MetaHeroRef[]} */
  const matchupHeroes = [];
  if (Array.isArray(o.matchup_heroes)) {
    for (const item of o.matchup_heroes) {
      if (item == null || typeof item !== "object") continue;
      const h = /** @type {Record<string, unknown>} */ (item);
      matchupHeroes.push({
        hero_id: Number(h.hero_id) || 0,
        name: String(h.name ?? ""),
        art_image_url: h.art_image_url != null ? String(h.art_image_url) : null,
        card_image_url: h.card_image_url != null ? String(h.card_image_url) : null,
      });
    }
  }

  /** @type {(number | null)[][]} */
  const matrix = [];
  if (Array.isArray(o.matchup_matrix)) {
    for (const row of o.matchup_matrix) {
      if (!Array.isArray(row)) {
        matrix.push([]);
        continue;
      }
      matrix.push(
        row.map((cell) => (cell == null || Number.isNaN(Number(cell)) ? null : Number(cell))),
      );
    }
  }

  return {
    overall: {
      total_decks: Number(overallObj.total_decks) || 0,
      source_round: Number(overallObj.source_round) || 0,
      source_round_label:
        overallObj.source_round_label != null ? String(overallObj.source_round_label) : null,
      heroes,
    },
    through_round: Number(o.through_round) || 0,
    from_round: Number(o.from_round) || 1,
    hero_win_rates: winRates,
    matchup_heroes: matchupHeroes,
    matchup_matrix: matrix,
  };
}
