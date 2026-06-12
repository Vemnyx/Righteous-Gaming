import { useEffect, useMemo, useState } from "react";

/** @typedef {"share" | "round-stats" | "matchups"} MetaSubTab */
/** @typedef {import("../utils/eventMetaDay.js").MetaDay} MetaDay */

/**
 * @param {{
 *   snapshot: import("../utils/eventMeta.js").EventMetaSnapshot | null,
 *   rounds: { round_number: number, round_label?: string }[],
 *   metaRound: number,
 *   onMetaRoundChange: (round: number) => void,
 *   metaSubTab: MetaSubTab,
 *   onMetaSubTabChange: (tab: MetaSubTab) => void,
 *   showMetaDaySplit?: boolean,
 *   metaDay?: MetaDay,
 *   onMetaDayChange?: (day: MetaDay) => void,
 *   maxRound?: number,
 *   loading: boolean,
 *   isLight: boolean,
 *   rowChrome: string,
 * }} props
 */
export function EventMetaTab({
  snapshot,
  rounds,
  metaRound,
  onMetaRoundChange,
  metaSubTab,
  onMetaSubTabChange,
  showMetaDaySplit = false,
  metaDay = "day1",
  onMetaDayChange,
  maxRound = 0,
  loading,
  isLight,
  rowChrome,
}) {
  const [focusedMatchupHeroId, setFocusedMatchupHeroId] = useState(/** @type {number | null} */ (null));
  const sectionTitle = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;
  const heroArtFade =
    "[mask-image:linear-gradient(to_right,black_0%,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_70%,transparent_100%)]";
  const metaShareArtWidth = "w-[6.5rem] sm:w-[7.5rem]";
  const metaShareBarHeight = "h-[3.25rem]";
  const metaSharePurpleFill =
    "bg-gradient-to-r from-purple-600/90 via-purple-500/75 to-purple-400/45";

  const subTabBtn = (id, label) => {
    const on = metaSubTab === id;
    return (
      <button
        type="button"
        className={`rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition ${
          on ? "bg-white/10 text-[#f4f0fa]" : "text-[#f4f0fa]/55 hover:bg-white/[0.06] hover:text-[#f4f0fa]/85"
        }`}
        onClick={() => onMetaSubTabChange(id)}
      >
        {label}
      </button>
    );
  };

  const matchupHeroes = snapshot?.matchup_heroes ?? [];
  const throughRound = snapshot?.through_round ?? 0;

  useEffect(() => {
    setFocusedMatchupHeroId(null);
  }, [metaSubTab, metaRound, throughRound, metaDay]);

  const dayLabel = metaDay === "day2" ? "Day 2" : "Day 1";
  const roundScopeLabel =
    metaSubTab === "matchups" && snapshot
      ? `all rounds through R${snapshot.through_round}`
      : showMetaDaySplit && snapshot
        ? metaSubTab === "share"
          ? metaDay === "day1"
            ? "R1–R8"
            : `R9–R${snapshot.through_round || maxRound}`
          : snapshot.from_round && snapshot.from_round > 1
            ? `R${snapshot.from_round}–R${snapshot.through_round}`
            : `through R${snapshot.through_round}`
        : snapshot
          ? `through R${snapshot.through_round}`
          : "";

  const roundSelect =
    metaSubTab === "round-stats" && rounds.length > 0 ? (
      <select
        className="rg-select shrink-0 rounded-md border border-white/15 bg-black/25 py-1.5 pl-2.5 text-[0.8125rem] text-[#f4f0fa] outline-none focus:border-purple-400/45"
        value={metaRound}
        aria-label="Round"
        onChange={(e) => onMetaRoundChange(Number(e.target.value))}
      >
        {rounds.map((r) => (
          <option key={r.round_number} value={r.round_number}>
            {r.round_label || `Round ${r.round_number}`}
          </option>
        ))}
      </select>
    ) : null;

  const daySelect = showMetaDaySplit && metaSubTab !== "matchups" ? (
    <select
      className="rg-select shrink-0 rounded-md border border-white/15 bg-black/25 py-1.5 pl-2.5 text-[0.8125rem] text-[#f4f0fa] outline-none focus:border-purple-400/45"
      value={metaDay}
      aria-label="Day"
      onChange={(e) => onMetaDayChange?.(/** @type {MetaDay} */ (e.target.value))}
    >
      <option value="day1">Day 1</option>
      <option value="day2">Day 2</option>
    </select>
  ) : null;

  const focusedMatchupIndex = useMemo(() => {
    if (focusedMatchupHeroId == null) return -1;
    return matchupHeroes.findIndex((h) => h.hero_id === focusedMatchupHeroId);
  }, [focusedMatchupHeroId, matchupHeroes]);

  const matchupDisplayRows = useMemo(() => {
    if (focusedMatchupIndex >= 0) {
      return [{ hero: matchupHeroes[focusedMatchupIndex], index: focusedMatchupIndex }];
    }
    return matchupHeroes.map((hero, index) => ({ hero, index }));
  }, [focusedMatchupIndex, matchupHeroes]);

  const toggleMatchupHero = (heroId) => {
    setFocusedMatchupHeroId((prev) => (prev === heroId ? null : heroId));
  };

  const focusedMatchupHero = focusedMatchupIndex >= 0 ? matchupHeroes[focusedMatchupIndex] : null;

  if (loading) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center" aria-busy="true">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-purple-300/90" />
      </div>
    );
  }

  if (!snapshot) {
    return <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No meta data for this segment yet.</p>;
  }

  const overall = snapshot.overall;
  const maxBarPct = overall.heroes[0]?.pct ?? 100;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-black/15 p-0.5" role="tablist">
            {subTabBtn("share", "Meta Share")}
            {subTabBtn("round-stats", "Round Stats")}
            {subTabBtn("matchups", "Matchups")}
          </div>
          {daySelect}
        </div>
        {roundSelect}
      </div>

      {metaSubTab === "share" ? (
        <section>
          <h3 className={`m-0 mb-1 ${sectionTitle}`}>Field meta share</h3>
          <p className="m-0 mb-4 text-[0.82rem] text-[#f4f0fa]/60">
            {overall.total_decks} decks{showMetaDaySplit ? ` on ${dayLabel}` : " across the full event"}
            {overall.source_round > 0
              ? ` · each player counted once (latest standing ${roundScopeLabel})`
              : ""}
          </p>
          {overall.heroes.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No standings data yet.</p>
          ) : (
            <ul className="m-0 flex w-full max-w-[min(100%,44rem)] list-none flex-col gap-3.5 p-0">
              {overall.heroes.map((hero) => {
                const barWidth =
                  maxBarPct > 0 && hero.pct > 0 ? Math.min(100, (hero.pct / maxBarPct) * 100) : 0;
                return (
                  <li key={`${hero.hero_id}-${hero.name}`} className="flex flex-col gap-1.5">
                    <span
                      className="m-0 min-w-0 truncate text-[0.8125rem] font-semibold text-[#f4f0fa]"
                      title={hero.name}
                    >
                      {hero.name}
                    </span>
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div
                        className={`relative shrink-0 overflow-hidden rounded-md ${metaShareArtWidth} ${metaShareBarHeight}`}
                        aria-hidden
                      >
                        {hero.art_image_url ? (
                          <img
                            src={hero.art_image_url}
                            alt=""
                            className={`h-full w-full object-cover object-left ${heroArtFade}`}
                            draggable={false}
                          />
                        ) : (
                          <div className={`h-full w-full ${metaSharePurpleFill}`} />
                        )}
                      </div>
                      <div className={`relative min-w-0 flex-1 ${metaShareBarHeight}`}>
                        {barWidth > 0 ? (
                          <div
                            className={`${metaShareBarHeight} overflow-hidden rounded-md ${metaSharePurpleFill}`}
                            style={{ width: `${barWidth}%` }}
                            aria-hidden
                          />
                        ) : null}
                      </div>
                      <div className="w-[4.75rem] shrink-0 text-right text-[0.78rem] leading-tight tabular-nums text-[#f4f0fa]/85 sm:w-[5rem]">
                        <span className="block whitespace-nowrap">
                          {hero.count} {hero.count === 1 ? "deck" : "decks"}
                        </span>
                        <span className="block whitespace-nowrap font-semibold text-[#f4f0fa]">
                          {hero.pct.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {metaSubTab === "round-stats" ? (
        <section>
          <h3 className={`m-0 mb-3 ${sectionTitle}`}>
            Hero win rate{showMetaDaySplit ? ` (${dayLabel}, ${roundScopeLabel})` : ` (${roundScopeLabel})`}
          </h3>
          {snapshot.hero_win_rates.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No results through this round yet.</p>
          ) : (
            <div className={`overflow-x-auto rounded-xl border ${border}`}>
              <table className="w-full min-w-[20rem] border-collapse text-left text-[0.8125rem]">
                <thead>
                  <tr className="border-b border-white/[0.08] text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/45">
                    <th className="px-3 py-2.5 font-semibold">Hero</th>
                    <th className="px-3 py-2.5 font-semibold">Record</th>
                    <th className="px-3 py-2.5 font-semibold">Win rate</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot.hero_win_rates.map((row) => (
                    <tr key={`${row.hero_id}-${row.name}`} className="border-b border-white/[0.06] last:border-b-0">
                      <td className="px-3 py-2.5 font-semibold text-[#f4f0fa]">{row.name}</td>
                      <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/85">
                        {row.wins}-{row.losses}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/90">{row.win_rate.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {metaSubTab === "matchups" ? (
        <section>
          <h3 className={`m-0 mb-1 ${sectionTitle}`}>Matchup grid</h3>
          <p className="m-0 mb-3 text-[0.75rem] text-[#f4f0fa]/50">
            {focusedMatchupHero
              ? `Matchups for ${focusedMatchupHero.name} (${roundScopeLabel}) · click their card again to show all heroes`
              : `Row hero win rate vs column hero (${roundScopeLabel}) · click a hero card to focus`}
          </p>
          {snapshot.matchup_heroes.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No head-to-head data through this round.</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-white/[0.1] bg-black/15 p-2">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-[2] bg-[#120a1c]/95 p-1.5" />
                    {snapshot.matchup_heroes.map((h) => (
                      <th key={`col-${h.hero_id}-${h.name}`} className="p-1.5">
                        <MatchupHeroArt
                          hero={h}
                          selected={focusedMatchupHeroId === h.hero_id}
                          onClick={() => toggleMatchupHero(h.hero_id)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matchupDisplayRows.map(({ hero: rowHero, index: i }) => (
                    <tr key={`row-${rowHero.hero_id}-${rowHero.name}`}>
                      <th className="sticky left-0 z-[1] bg-[#120a1c]/95 p-1.5">
                        <MatchupHeroArt
                          hero={rowHero}
                          selected={focusedMatchupHeroId === rowHero.hero_id}
                          onClick={() => toggleMatchupHero(rowHero.hero_id)}
                        />
                      </th>
                      {snapshot.matchup_matrix[i]?.map((cell, j) => (
                        <td
                          key={`cell-${i}-${j}`}
                          className={`min-w-[3.25rem] p-1.5 text-center text-[0.68rem] tabular-nums ${matchupCellClass(cell, i === j)}`}
                          title={
                            i === j
                              ? rowHero.name
                              : cell != null
                                ? `${rowHero.name} vs ${snapshot.matchup_heroes[j].name}: ${cell.toFixed(1)}%`
                                : `${rowHero.name} vs ${snapshot.matchup_heroes[j].name}: no games`
                          }
                        >
                          {i === j ? "—" : cell != null ? `${cell.toFixed(0)}%` : "·"}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

/**
 * @param {{
 *   hero: { name: string, card_image_url?: string | null, art_image_url?: string | null },
 *   selected?: boolean,
 *   onClick?: () => void,
 * }} props
 */
function MatchupHeroArt({ hero, selected = false, onClick }) {
  const imageUrl = hero.card_image_url || hero.art_image_url;
  const title = selected
    ? `${hero.name} — click to show all matchups`
    : `${hero.name} — click to show their matchups`;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`mx-auto block h-14 w-11 overflow-hidden rounded-md border bg-black/25 transition sm:h-[3.75rem] sm:w-12 ${
        selected
          ? "border-purple-400/80 ring-2 ring-purple-400/45"
          : "border-white/[0.08] hover:border-purple-400/45 hover:bg-black/35"
      }`}
      title={title}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=""
          className="h-full w-full object-cover object-top"
          draggable={false}
        />
      ) : (
        <div className="h-full w-full bg-gradient-to-b from-purple-900/40 to-black/20" />
      )}
    </button>
  );
}

/** @param {number | null | undefined} rate @param {boolean} diagonal */
function matchupCellClass(rate, diagonal) {
  if (diagonal) return "text-[#f4f0fa]/25";
  if (rate == null) return "text-[#f4f0fa]/25";
  if (rate >= 60) return "bg-emerald-500/20 text-emerald-200";
  if (rate <= 40) return "bg-red-500/15 text-red-200/90";
  return "bg-white/[0.04] text-[#f4f0fa]/80";
}
