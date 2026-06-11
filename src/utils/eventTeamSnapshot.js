/** @typedef {{ user_id: number, first_name?: string, last_name?: string }} TeamMember */

/** @typedef {{ user_id: number, round?: number, kind?: string, payload?: unknown, first_name?: string, last_name?: string, hero_name?: string | null }} TeamMatchRow */

const CHART_COLORS = [
  "#c4b5fd",
  "#fbbf24",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#fb923c",
  "#a78bfa",
  "#2dd4bf",
];

/** @param {unknown} raw */
export function parseTeamMatchPayload(raw) {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed != null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return /** @type {Record<string, unknown>} */ (parsed);
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

/** @param {TeamMember} m */
export function teamMemberLabel(m) {
  const name = `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim();
  return name || `Player ${m.user_id}`;
}

/**
 * @param {TeamMatchRow[]} matches
 * @param {number} userId
 * @param {number} throughRound
 */
function recordThroughRound(matches, userId, throughRound) {
  let wins = 0;
  let losses = 0;
  for (const m of matches) {
    if (m.user_id !== userId || m.kind !== "result") continue;
    const round = Number(m.round);
    if (!Number.isFinite(round) || round > throughRound) continue;
    const outcome = String(parseTeamMatchPayload(m.payload).outcome ?? "").toLowerCase();
    if (outcome === "win") wins += 1;
    else if (outcome === "loss") losses += 1;
  }
  return { wins, losses };
}

/**
 * @param {TeamMatchRow[]} segmentMatches
 * @param {TeamMember[]} teamMembers
 * @param {number} currentRound
 */
export function buildTeamSnapshot(segmentMatches, teamMembers, currentRound) {
  const roundCap = Math.max(1, Number(currentRound) || 1);

  /** @type {Map<number, Map<number, { rank: number, wins: number, hero: string }>>} */
  const standingsByUser = new Map();

  for (const m of segmentMatches) {
    if (m.kind !== "standing") continue;
    const round = Number(m.round);
    if (!Number.isFinite(round) || round > roundCap) continue;
    const p = parseTeamMatchPayload(m.payload);
    const rank = Number(p.rank);
    const wins = Number(p.wins);
    if (!Number.isFinite(rank)) continue;
    if (!standingsByUser.has(m.user_id)) standingsByUser.set(m.user_id, new Map());
    standingsByUser.get(m.user_id)?.set(round, {
      rank,
      wins: Number.isFinite(wins) ? wins : 0,
      hero: String(p.hero ?? m.hero_name ?? "").trim(),
    });
  }

  const chartRounds = [];
  for (let r = 1; r <= roundCap; r += 1) chartRounds.push(r);

  /** @type {{ userId: number, name: string, color: string, points: { round: number, wins: number }[] }[]} */
  const chartSeries = teamMembers.map((member, idx) => {
    const byRound = standingsByUser.get(member.user_id);
    /** @type {{ round: number, wins: number }[]} */
    const points = [];
    if (byRound) {
      for (const r of chartRounds) {
        const row = byRound.get(r);
        if (row) points.push({ round: r, wins: row.wins });
      }
    }
    if (points.length === 0) {
      let cumulative = 0;
      for (const r of chartRounds) {
        const { wins } = recordThroughRound(segmentMatches, member.user_id, r);
        cumulative = wins;
        points.push({ round: r, wins: cumulative });
      }
    }
    return {
      userId: member.user_id,
      name: teamMemberLabel(member),
      color: CHART_COLORS[idx % CHART_COLORS.length],
      points,
    };
  });

  /** @type {import("./eventTeamSnapshot.js").TeamRankingRow[]} */
  const rankings = teamMembers.map((member) => {
    const byRound = standingsByUser.get(member.user_id);
    const currentStanding = byRound?.get(roundCap) ?? null;
    let lastStandingRound = 0;
    let lastStanding = null;
    if (byRound) {
      for (const [r, row] of byRound.entries()) {
        if (r > lastStandingRound) {
          lastStandingRound = r;
          lastStanding = row;
        }
      }
    }

    const hadEarlier = lastStandingRound > 0 && lastStandingRound < roundCap;
    const dropped = hadEarlier && !currentStanding;
    const recordRound = dropped ? lastStandingRound : roundCap;
    const { wins, losses } = recordThroughRound(segmentMatches, member.user_id, recordRound);

    return {
      userId: member.user_id,
      name: teamMemberLabel(member),
      rank: currentStanding?.rank ?? null,
      hero: currentStanding?.hero ?? lastStanding?.hero ?? "",
      wins,
      losses,
      dropped,
      droppedAfterRound: dropped ? lastStandingRound : null,
      sortRank: currentStanding?.rank ?? (dropped ? lastStanding?.rank ?? 9999 : 9999),
    };
  });

  rankings.sort((a, b) => {
    if (a.dropped !== b.dropped) return a.dropped ? 1 : -1;
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });

  const maxWins = Math.max(
    1,
    ...chartSeries.flatMap((s) => s.points.map((p) => p.wins)),
  );

  return { chartSeries, chartRounds, rankings, maxWins };
}

/** @typedef {{
 *   userId: number,
 *   name: string,
 *   rank: number | null,
 *   hero: string,
 *   wins: number,
 *   losses: number,
 *   dropped: boolean,
 *   droppedAfterRound: number | null,
 *   sortRank: number,
 * }} TeamRankingRow */
