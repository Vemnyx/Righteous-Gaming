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

/** @param {Record<string, unknown>} p */
function isDecidedResultPayload(p) {
  const winnerName = String(p.winner_name ?? "").trim();
  if (winnerName) return true;
  const side = String(p.winner_side ?? "").toLowerCase();
  return side.includes("player 1") || side.includes("player 2");
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
    const payload = parseTeamMatchPayload(m.payload);
    if (!isDecidedResultPayload(payload)) continue;
    const outcome = String(payload.outcome ?? "").toLowerCase();
    if (outcome === "win") wins += 1;
    else if (outcome === "loss") losses += 1;
  }
  return { wins, losses };
}

/**
 * @param {TeamMatchRow[]} matches
 * @param {number} userId
 * @returns {Set<number>}
 */
function pairingRoundsForUser(matches, userId) {
  /** @type {Set<number>} */
  const rounds = new Set();
  for (const m of matches) {
    if (m.user_id !== userId || m.kind !== "pairing") continue;
    const round = Number(m.round);
    if (Number.isFinite(round) && round > 0) rounds.add(round);
  }
  return rounds;
}

/** @param {Set<number>} rounds */
function maxRoundNumber(rounds) {
  let max = 0;
  for (const r of rounds) {
    if (r > max) max = r;
  }
  return max;
}

/** @param {TeamMatchRow[]} matches @param {number} round */
function roundHasAnyPairings(matches, round) {
  return matches.some((m) => m.kind === "pairing" && Number(m.round) === round);
}

/** @param {TeamMatchRow[]} matches @param {number} round */
function roundHasAnyStandings(matches, round) {
  return matches.some((m) => m.kind === "standing" && Number(m.round) === round);
}

/** @param {TeamMatchRow[]} matches @param {number} round */
function roundHasAnyResults(matches, round) {
  return matches.some((m) => {
    if (m.kind !== "result" || Number(m.round) !== round) return false;
    return isDecidedResultPayload(parseTeamMatchPayload(m.payload));
  });
}

/** Round has enough coverage to plot on the wins chart. */
function roundHasChartData(matches, round) {
  return roundHasAnyStandings(matches, round) || roundHasAnyResults(matches, round);
}

/**
 * Wins for chart/table at round r: official standings when published, else match results.
 * @param {TeamMatchRow[]} matches
 * @param {number} userId
 * @param {number} round
 * @param {Map<number, { rank: number, wins: number, hero: string }> | undefined} standingsByRound
 */
function winsAtRound(matches, userId, round, standingsByRound) {
  const standingRow = standingsByRound?.get(round);
  if (standingRow && roundHasAnyStandings(matches, round)) {
    return standingRow.wins;
  }
  if (roundHasAnyResults(matches, round)) {
    return recordThroughRound(matches, userId, round).wins;
  }
  return null;
}

/**
 * @param {TeamMatchRow[]} matches
 * @param {number} userId
 * @param {number} round
 */
function heroFromPairingRound(matches, userId, round) {
  for (const m of matches) {
    if (m.user_id !== userId || m.kind !== "pairing" || Number(m.round) !== round) continue;
    const p = parseTeamMatchPayload(m.payload);
    const h = String(p.hero ?? m.hero_name ?? "").trim();
    if (h) return h;
  }
  return "";
}

/**
 * @param {TeamMatchRow[]} segmentMatches
 * @param {TeamMember[]} teamMembers
 * @param {number} currentRound
 */
export function buildTeamSnapshot(segmentMatches, teamMembers, currentRound) {
  const roundCap = Math.max(1, Number(currentRound) || 1);
  const capPairingsPublished = roundHasAnyPairings(segmentMatches, roundCap);

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
  for (let r = 1; r <= roundCap; r += 1) {
    if (roundHasChartData(segmentMatches, r)) chartRounds.push(r);
  }
  const latestChartRound = chartRounds.length > 0 ? chartRounds[chartRounds.length - 1] : roundCap;

  /** @type {{ userId: number, name: string, color: string, points: { round: number, wins: number }[] }[]} */
  const chartSeries = teamMembers.map((member, idx) => {
    const byRound = standingsByUser.get(member.user_id);
    /** @type {{ round: number, wins: number }[]} */
    const points = [];
    for (const r of chartRounds) {
      const wins = winsAtRound(segmentMatches, member.user_id, r, byRound);
      if (wins == null) continue;
      points.push({ round: r, wins });
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
    const currentStanding =
      byRound?.get(roundCap) && roundHasAnyStandings(segmentMatches, roundCap)
        ? byRound.get(roundCap)
        : null;
    let lastStandingRound = 0;
    let lastStanding = null;
    if (byRound) {
      for (const [r, row] of byRound.entries()) {
        if (r > roundCap || !roundHasAnyStandings(segmentMatches, r)) continue;
        if (r > lastStandingRound) {
          lastStandingRound = r;
          lastStanding = row;
        }
      }
    }

    const pairingRounds = pairingRoundsForUser(segmentMatches, member.user_id);
    const lastPairingRound = maxRoundNumber(pairingRounds);
    const hasPairingForCap = pairingRounds.has(roundCap);
    const hadEarlierPairing = lastPairingRound > 0 && lastPairingRound < roundCap;
    const dropped = capPairingsPublished && hadEarlierPairing && !hasPairingForCap;
    const recordRound = dropped
      ? lastPairingRound
      : roundHasChartData(segmentMatches, roundCap)
        ? roundCap
        : latestChartRound;
    const { wins, losses } = recordThroughRound(segmentMatches, member.user_id, recordRound);
    const heroFromPairing = hasPairingForCap
      ? heroFromPairingRound(segmentMatches, member.user_id, roundCap)
      : "";

    const displayRank = currentStanding?.rank ?? lastStanding?.rank ?? null;

    return {
      userId: member.user_id,
      name: teamMemberLabel(member),
      rank: displayRank,
      hero: currentStanding?.hero ?? heroFromPairing ?? lastStanding?.hero ?? "",
      wins,
      losses,
      dropped,
      droppedAfterRound: dropped ? lastPairingRound : null,
      sortRank: displayRank ?? (dropped ? 9999 : 9999),
    };
  });

  rankings.sort((a, b) => {
    if (a.dropped !== b.dropped) return a.dropped ? 1 : -1;
    if (a.sortRank !== b.sortRank) return a.sortRank - b.sortRank;
    if (a.rank == null && b.rank == null && !a.dropped && !b.dropped) {
      if (a.wins !== b.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
    }
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
