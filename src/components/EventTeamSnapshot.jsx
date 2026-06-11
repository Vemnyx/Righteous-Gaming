import { useEffect, useMemo, useState } from "react";
import { PlayerNameButton } from "./PlayerNameButton";

/** @param {{ className?: string, title?: string }} props */
function LeaderCrown({ className = "h-3.5 w-3.5 text-amber-400", title = "Highest ranked on team" }) {
  return (
    <svg
      viewBox="0 0 20 16"
      className={`inline-block shrink-0 ${className}`}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <path
        fill="currentColor"
        d="M10 1.5 12.1 6l4.4-.65-2.65 3.75 1.55 5.05L10 12.1 4.6 14.15l1.55-5.05L3.5 5.35l4.4.65L10 1.5zm-8.25 12.5h16.5v2H1.75v-2z"
      />
    </svg>
  );
}

/** @param {import("../utils/eventTeamSnapshot.js").TeamRankingRow[]} rankings */
function topRankedUserIds(rankings) {
  const active = rankings.filter((r) => !r.dropped && r.rank != null && Number.isFinite(r.rank));
  if (active.length === 0) return new Set();
  const bestRank = Math.min(...active.map((r) => r.rank));
  return new Set(active.filter((r) => r.rank === bestRank).map((r) => r.userId));
}

/**
 * @param {{
 *   chartSeries: { userId?: number, name: string, color: string, points: { round: number, wins: number }[] }[],
 *   chartRounds: number[],
 *   maxWins: number,
 *   isLight: boolean,
 *   leaderUserIds: Set<number>,
 * }} props
 */
function TeamWinsLineChart({ chartSeries, chartRounds, maxWins, isLight, leaderUserIds }) {
  const [focusedKey, setFocusedKey] = useState(/** @type {number | string | null} */ (null));

  useEffect(() => {
    setFocusedKey(null);
  }, [chartSeries, chartRounds]);

  /** @param {{ userId?: number, name: string }} series */
  const seriesKey = (series) => series.userId ?? series.name;

  const visibleSeries = useMemo(() => {
    if (focusedKey == null) return chartSeries;
    return chartSeries.filter((s) => seriesKey(s) === focusedKey);
  }, [chartSeries, focusedKey]);

  const visibleMaxWins = useMemo(() => {
    const wins = visibleSeries.flatMap((s) => s.points.map((p) => p.wins));
    if (wins.length > 0) return Math.max(1, ...wins);
    return maxWins;
  }, [visibleSeries, maxWins]);

  const toggleSeriesFocus = (key) => {
    setFocusedKey((prev) => (prev === key ? null : key));
  };

  const width = 640;
  const height = 220;
  const pad = { top: 18, right: 20, bottom: 32, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const roundMin = chartRounds[0] ?? 1;
  const roundMax = chartRounds[chartRounds.length - 1] ?? roundMin;
  const roundSpan = Math.max(1, roundMax - roundMin);

  const xAt = (round) => pad.left + ((round - roundMin) / roundSpan) * plotW;
  const yAt = (wins) => pad.top + plotH - (wins / visibleMaxWins) * plotH;

  const gridLines = [];
  for (let w = 0; w <= maxWins; w += 1) {
    const y = yAt(w);
    gridLines.push(
      <line
        key={`grid-${w}`}
        x1={pad.left}
        y1={y}
        x2={width - pad.right}
        y2={y}
        stroke="currentColor"
        strokeOpacity={0.08}
      />,
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="mx-auto block h-auto w-full max-w-3xl text-[#f4f0fa]/35"
        role="img"
        aria-label="Team wins by round"
      >
        {gridLines}
        <line
          x1={pad.left}
          y1={pad.top + plotH}
          x2={width - pad.right}
          y2={pad.top + plotH}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        <line
          x1={pad.left}
          y1={pad.top}
          x2={pad.left}
          y2={pad.top + plotH}
          stroke="currentColor"
          strokeOpacity={0.2}
        />
        {chartRounds.map((r) => (
          <text
            key={`rx-${r}`}
            x={xAt(r)}
            y={height - 10}
            textAnchor="middle"
            className="fill-[#f4f0fa]/50 text-[10px] font-medium"
          >
            R{r}
          </text>
        ))}
        {[0, visibleMaxWins].map((w) => (
          <text
            key={`ly-${w}`}
            x={pad.left - 8}
            y={yAt(w) + 3}
            textAnchor="end"
            className="fill-[#f4f0fa]/50 text-[10px] font-medium"
          >
            {w}
          </text>
        ))}
        {visibleSeries.map((series) => {
          if (series.points.length === 0) return null;
          const d = series.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.round)} ${yAt(p.wins)}`)
            .join(" ");
          return (
            <g key={series.name}>
              <path
                d={d}
                fill="none"
                stroke={series.color}
                strokeWidth={focusedKey != null ? 2.75 : 2.25}
                strokeLinejoin="round"
              />
              {series.points.map((p) => (
                <circle
                  key={`${series.name}-${p.round}`}
                  cx={xAt(p.round)}
                  cy={yAt(p.wins)}
                  r={3.5}
                  fill={series.color}
                  stroke={isLight ? "#1a1520" : "#0c0616"}
                  strokeWidth={1.5}
                />
              ))}
            </g>
          );
        })}
      </svg>
      <ul className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1.5">
        {chartSeries.map((s) => {
          const key = seriesKey(s);
          const isFocused = focusedKey === key;
          const isDimmed = focusedKey != null && !isFocused;
          return (
            <li key={s.name}>
              <button
                type="button"
                onClick={() => toggleSeriesFocus(key)}
                aria-pressed={isFocused}
                title={isFocused ? "Show all players" : `Show only ${s.name}`}
                className={`flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[0.75rem] transition ${
                  isFocused
                    ? "bg-white/10 font-semibold text-[#f4f0fa]"
                    : isDimmed
                      ? "text-[#f4f0fa]/38 hover:text-[#f4f0fa]/62"
                      : "text-[#f4f0fa]/75 hover:bg-white/[0.06] hover:text-[#f4f0fa]"
                }`}
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: s.color, opacity: isDimmed ? 0.45 : 1 }}
                  aria-hidden
                />
                {s.name}
                {s.userId != null && leaderUserIds.has(s.userId) ? (
                  <LeaderCrown className="h-3 w-3 text-amber-400" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * @param {{
 *   rankings: import("../utils/eventTeamSnapshot.js").TeamRankingRow[],
 *   isLight: boolean,
 *   rowChrome: string,
 *   leaderUserIds: Set<number>,
 *   onPlayerClick?: (name: string) => void,
 * }} props
 */
function TeamRankingsTable({ rankings, isLight, rowChrome, leaderUserIds, onPlayerClick }) {
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;

  return (
    <div className={`overflow-x-auto rounded-xl border ${border}`}>
      <table className="w-full min-w-[28rem] border-collapse text-left text-[0.8125rem]">
        <thead>
          <tr className="border-b border-white/[0.08] text-[0.68rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/45">
            <th className="px-3 py-2.5 font-semibold">Player</th>
            <th className="px-3 py-2.5 font-semibold">Rank</th>
            <th className="px-3 py-2.5 font-semibold">Hero</th>
            <th className="px-3 py-2.5 font-semibold">Record</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((row) => (
            <tr key={row.userId} className="border-b border-white/[0.06] last:border-b-0">
              <td className="px-3 py-2.5 font-semibold text-[#f4f0fa]">
                <span className="inline-flex items-center gap-1.5">
                  <PlayerNameButton name={row.name} onPlayerClick={onPlayerClick} className="text-[#f4f0fa]" />
                  {leaderUserIds.has(row.userId) ? <LeaderCrown /> : null}
                </span>
              </td>
              <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/80">
                {row.dropped ? "—" : row.rank != null ? `#${row.rank}` : "—"}
              </td>
              <td className="max-w-[10rem] truncate px-3 py-2.5 text-[#f4f0fa]/72">{row.hero || "—"}</td>
              <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/85">
                {row.wins}-{row.losses}
              </td>
              <td className="px-3 py-2.5">
                {row.dropped ? (
                  <span className="text-[0.75rem] text-amber-200/85">
                    Dropped
                    {row.droppedAfterRound != null ? ` (after R${row.droppedAfterRound})` : ""}
                  </span>
                ) : (
                  <span className="text-[0.75rem] text-emerald-300/80">Active</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * @param {{
 *   chartSeries: { userId?: number, name: string, color: string, points: { round: number, wins: number }[] }[],
 *   chartRounds: number[],
 *   rankings: import("../utils/eventTeamSnapshot.js").TeamRankingRow[],
 *   maxWins: number,
 *   isLight: boolean,
 *   rowChrome: string,
 *   currentRound: number,
 *   onPlayerClick?: (name: string) => void,
 * }} props
 */
export function EventTeamSnapshot({
  chartSeries,
  chartRounds,
  rankings,
  maxWins,
  isLight,
  rowChrome,
  currentRound,
  onPlayerClick,
}) {
  const sectionTitle = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";
  const leaderUserIds = useMemo(() => topRankedUserIds(rankings), [rankings]);

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className={`m-0 mb-3 ${sectionTitle}`}>Wins by round (through R{currentRound})</h3>
        {chartSeries.length === 0 ? (
          <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No team data for this segment yet.</p>
        ) : (
          <TeamWinsLineChart
            chartSeries={chartSeries}
            chartRounds={chartRounds}
            maxWins={maxWins}
            isLight={isLight}
            leaderUserIds={leaderUserIds}
          />
        )}
      </section>

      <section>
        <h3 className={`m-0 mb-3 ${sectionTitle}`}>Team standings (R{currentRound})</h3>
        {rankings.length === 0 ? (
          <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No team members to display.</p>
        ) : (
          <TeamRankingsTable
            rankings={rankings}
            isLight={isLight}
            rowChrome={rowChrome}
            leaderUserIds={leaderUserIds}
            onPlayerClick={onPlayerClick}
          />
        )}
      </section>
    </div>
  );
}
