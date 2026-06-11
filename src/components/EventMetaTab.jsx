/**
 * @param {{
 *   snapshot: import("../utils/eventMeta.js").EventMetaSnapshot | null,
 *   rounds: { round_number: number, round_label?: string }[],
 *   metaRound: number,
 *   onMetaRoundChange: (round: number) => void,
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
  loading,
  isLight,
  rowChrome,
}) {
  const sectionTitle = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;
  const heroArtFade =
    "[mask-image:linear-gradient(to_right,black_0%,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_70%,transparent_100%)]";

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
    <div className="flex flex-col gap-8">
      <section>
        <h3 className={`m-0 mb-1 ${sectionTitle}`}>Field meta share</h3>
        <p className="m-0 mb-4 text-[0.82rem] text-[#f4f0fa]/60">
          {overall.total_decks} decks total
          {overall.source_round > 0
            ? ` · Round ${overall.source_round}${overall.source_round_label ? ` (${overall.source_round_label})` : ""} standings`
            : ""}
        </p>
        {overall.heroes.length === 0 ? (
          <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No standings data yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {overall.heroes.map((hero) => {
              const barWidth = maxBarPct > 0 ? (hero.pct / maxBarPct) * 100 : 0;
              return (
                <li key={`${hero.hero_id}-${hero.name}`} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <span
                    className="m-0 min-w-0 truncate text-[0.8125rem] font-semibold text-[#f4f0fa] sm:w-[9.5rem] sm:shrink-0"
                    title={hero.name}
                  >
                    {hero.name}
                  </span>
                  <div className="relative min-h-[2.25rem] flex-1 overflow-hidden rounded-lg border border-white/[0.08] bg-black/20">
                    <div
                      className="absolute inset-y-0 left-0 overflow-hidden"
                      style={{ width: `${Math.max(barWidth, hero.pct > 0 ? 8 : 0)}%` }}
                      aria-hidden
                    >
                      {hero.art_image_url ? (
                        <img
                          src={hero.art_image_url}
                          alt=""
                          className={`h-full w-full scale-110 object-cover object-left ${heroArtFade}`}
                          draggable={false}
                        />
                      ) : (
                        <div
                          className={`h-full w-full bg-gradient-to-r from-purple-900/40 via-purple-800/20 to-transparent ${heroArtFade}`}
                        />
                      )}
                      <div className="absolute inset-0 bg-black/25" />
                    </div>
                    <div className="relative z-[1] flex h-full min-h-[2.25rem] items-center justify-between gap-2 px-2.5 py-1 text-[0.75rem]">
                      <span className="font-medium tabular-nums text-[#f4f0fa]/85">
                        {hero.count} {hero.count === 1 ? "deck" : "decks"}
                      </span>
                      <span className="font-semibold tabular-nums text-[#f4f0fa]">{hero.pct.toFixed(1)}%</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className={`m-0 ${sectionTitle}`}>Round stats</h3>
          <label className="flex items-center gap-2 text-[0.8125rem] text-[#f4f0fa]/70">
            Through round
            <select
              className="rg-select rounded-md border border-white/15 bg-black/25 py-1.5 pl-2.5 text-[0.8125rem] text-[#f4f0fa] outline-none focus:border-purple-400/45"
              value={metaRound}
              onChange={(e) => onMetaRoundChange(Number(e.target.value))}
            >
              {rounds.map((r) => (
                <option key={r.round_number} value={r.round_number}>
                  {r.round_label || `Round ${r.round_number}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <h4 className="m-0 mb-2 text-[0.78rem] font-semibold text-[#f4f0fa]/75">Hero win rate</h4>
        {snapshot.hero_win_rates.length === 0 ? (
          <p className="m-0 mb-6 text-[0.85rem] text-[#f4f0fa]/60">No results through this round yet.</p>
        ) : (
          <div className={`mb-6 overflow-x-auto rounded-xl border ${border}`}>
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

        <h4 className="m-0 mb-2 text-[0.78rem] font-semibold text-[#f4f0fa]/75">Matchup grid</h4>
        <p className="m-0 mb-3 text-[0.75rem] text-[#f4f0fa]/50">
          Row hero win rate vs column hero (through R{snapshot.through_round})
        </p>
        {snapshot.matchup_heroes.length === 0 ? (
          <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No head-to-head data through this round.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-white/[0.1] bg-black/15 p-2">
            <table className="border-collapse text-[0.68rem]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-[2] bg-[#120a1c]/95 p-1.5 text-left font-semibold text-[#f4f0fa]/45" />
                  {snapshot.matchup_heroes.map((h) => (
                    <th
                      key={`col-${h.hero_id}-${h.name}`}
                      className="max-w-[4.5rem] truncate p-1.5 text-center font-semibold text-[#f4f0fa]/70"
                      title={h.name}
                    >
                      {shortHeroName(h.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.matchup_heroes.map((rowHero, i) => (
                  <tr key={`row-${rowHero.hero_id}-${rowHero.name}`}>
                    <th
                      className="sticky left-0 z-[1] max-w-[5.5rem] truncate bg-[#120a1c]/95 p-1.5 text-left font-semibold text-[#f4f0fa]/70"
                      title={rowHero.name}
                    >
                      {shortHeroName(rowHero.name)}
                    </th>
                    {snapshot.matchup_matrix[i]?.map((cell, j) => (
                      <td
                        key={`cell-${i}-${j}`}
                        className={`min-w-[2.75rem] p-1.5 text-center tabular-nums ${matchupCellClass(cell, i === j)}`}
                        title={
                          i === j
                            ? ""
                            : cell != null
                              ? `${rowHero.name} vs ${snapshot.matchup_heroes[j].name}: ${cell.toFixed(1)}%`
                              : "No games"
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
    </div>
  );
}

/** @param {string} name */
function shortHeroName(name) {
  const comma = name.indexOf(",");
  if (comma > 0) return name.slice(0, comma).trim();
  if (name.length > 10) return `${name.slice(0, 9)}…`;
  return name;
}

/** @param {number | null | undefined} rate @param {boolean} diagonal */
function matchupCellClass(rate, diagonal) {
  if (diagonal) return "text-[#f4f0fa]/25";
  if (rate == null) return "text-[#f4f0fa]/25";
  if (rate >= 60) return "bg-emerald-500/20 text-emerald-200";
  if (rate <= 40) return "bg-red-500/15 text-red-200/90";
  return "bg-white/[0.04] text-[#f4f0fa]/80";
}
