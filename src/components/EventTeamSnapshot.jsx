/**
 * @param {{
 *   chartSeries: { name: string, color: string, points: { round: number, wins: number }[] }[],
 *   chartRounds: number[],
 *   maxWins: number,
 *   isLight: boolean,
 * }} props
 */
function TeamWinsLineChart({ chartSeries, chartRounds, maxWins, isLight }) {
  const width = 640;
  const height = 220;
  const pad = { top: 18, right: 20, bottom: 32, left: 36 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const roundMin = chartRounds[0] ?? 1;
  const roundMax = chartRounds[chartRounds.length - 1] ?? roundMin;
  const roundSpan = Math.max(1, roundMax - roundMin);

  const xAt = (round) => pad.left + ((round - roundMin) / roundSpan) * plotW;
  const yAt = (wins) => pad.top + plotH - (wins / maxWins) * plotH;

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
        {[0, maxWins].map((w) => (
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
        {chartSeries.map((series) => {
          if (series.points.length === 0) return null;
          const d = series.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xAt(p.round)} ${yAt(p.wins)}`)
            .join(" ");
          return (
            <g key={series.name}>
              <path d={d} fill="none" stroke={series.color} strokeWidth={2.25} strokeLinejoin="round" />
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
      <ul className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {chartSeries.map((s) => (
          <li key={s.name} className="flex items-center gap-1.5 text-[0.75rem] text-[#f4f0fa]/75">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * @param {{
 *   rankings: import("../utils/eventTeamSnapshot.js").TeamRankingRow[],
 *   isLight: boolean,
 *   rowChrome: string,
 * }} props
 */
function TeamRankingsTable({ rankings, isLight, rowChrome }) {
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
              <td className="px-3 py-2.5 font-semibold text-[#f4f0fa]">{row.name}</td>
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
 *   chartSeries: { name: string, color: string, points: { round: number, wins: number }[] }[],
 *   chartRounds: number[],
 *   rankings: import("../utils/eventTeamSnapshot.js").TeamRankingRow[],
 *   maxWins: number,
 *   isLight: boolean,
 *   rowChrome: string,
 *   currentRound: number,
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
}) {
  const sectionTitle = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";

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
          />
        )}
      </section>

      <section>
        <h3 className={`m-0 mb-3 ${sectionTitle}`}>Team standings (R{currentRound})</h3>
        {rankings.length === 0 ? (
          <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">No team members to display.</p>
        ) : (
          <TeamRankingsTable rankings={rankings} isLight={isLight} rowChrome={rowChrome} />
        )}
      </section>
    </div>
  );
}
