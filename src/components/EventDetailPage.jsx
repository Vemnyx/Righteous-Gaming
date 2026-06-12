import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { EventTeamSnapshot } from "./EventTeamSnapshot";
import { EventMetaTab } from "./EventMetaTab";
import {
  defaultMetaDay,
  metaDayRounds,
  metaEffectiveFromRound,
  metaEffectiveSharePhase,
  metaEffectiveThroughRound,
  metaMaxRoundNumber,
  showMetaDaySplit,
  showNationalsFormatSplit,
} from "../utils/eventMetaDay.js";
import { EventPlayerHistoryModal, parsePlayerHistory } from "./EventPlayerHistoryModal";
import { PlayerNameButton } from "./PlayerNameButton";
import { cardFormatName, formatUsesYoungHeroes } from "../constants/cardFormat";
import { canWriteContent } from "../constants/roles";
import { buildTeamSnapshot } from "../utils/eventTeamSnapshot";
import { parseEventMetaSnapshot } from "../utils/eventMeta";
import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "../utils/youtube";

/** @typedef {"team" | "overall" | "meta" | "streams"} MainTab */
/** @typedef {"snapshot" | "pairings" | "results" | "standings"} CoverageTab */
/** @typedef {{ id: number, name: string, young?: boolean, art_image_url?: string | null }} HeroOption */

/** @param {object} d */
function segmentLabel(d) {
  return d.label || d.event_type_name || `Segment ${d.id}`;
}

const MATCH_ROW_MIN_H = "min-h-[5.5rem]";
/** Soft edge fade for hero art panels (deck-style). */
const heroArtFadeToRight =
  "[mask-image:linear-gradient(to_right,black_0%,black_78%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_78%,transparent_100%)]";
const heroArtFadeToLeft =
  "[mask-image:linear-gradient(to_left,black_0%,black_78%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_left,black_0%,black_78%,transparent_100%)]";
const heroArtFadeLeft =
  "[mask-image:linear-gradient(to_right,black_0%,black_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_82%,transparent_100%)]";
const matchRowsWrapCls = "mx-auto flex w-full max-w-[58rem] flex-col gap-2.5";
const matchHeroArtEdgeWidth = "w-[13rem] sm:w-[15rem]";
const matchHeroArtTextInsetLeft = "pl-[13rem] sm:pl-[15rem]";
const matchHeroArtTextInsetRight = "pr-[13rem] sm:pr-[15rem]";

function TabSpinner() {
  return (
    <div className="flex min-h-[12rem] items-center justify-center" aria-busy="true">
      <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-purple-300/90" />
    </div>
  );
}

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** @param {string} s */
function normalizeHeroKey(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[<>\\]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** @param {string} s */
function heroBaseKey(s) {
  const n = normalizeHeroKey(s);
  const i = n.indexOf(",");
  return i >= 0 ? n.slice(0, i).trim() : n;
}

/**
 * @param {HeroOption} candidate
 * @param {HeroOption} current
 * @param {boolean | undefined} preferYoung
 */
function heroArtShouldPrefer(candidate, current, preferYoung) {
  if (preferYoung === undefined) {
    if (!candidate.young && current.young) return true;
    return false;
  }
  if (preferYoung) {
    return !!candidate.young && !current.young;
  }
  return !candidate.young && !!current.young;
}

/**
 * Resolves hero art for FabTCG coverage labels. When the event format is known,
 * prefers young or adult heroes to match backend event indexing.
 *
 * @param {string | null | undefined} heroName
 * @param {HeroOption[]} heroes
 * @param {number | null | undefined} formatId
 */
function heroArtForName(heroName, heroes, formatId) {
  const full = normalizeHeroKey(heroName);
  if (!full || heroes.length === 0) return null;
  const base = heroBaseKey(heroName);
  const preferYoung = formatUsesYoungHeroes(formatId);

  for (const h of heroes) {
    if (normalizeHeroKey(h.name) === full) {
      return h.art_image_url ?? null;
    }
  }

  /** @type {HeroOption | null} */
  let best = null;
  for (const h of heroes) {
    if (heroBaseKey(h.name) !== base) continue;
    if (!best || heroArtShouldPrefer(h, best, preferYoung)) {
      best = h;
    }
  }
  return best?.art_image_url ?? null;
}

/** @param {string | null | undefined} player @param {string} query */
function playerMatchesNameFilter(player, query) {
  const q = normalizeHeroKey(query);
  if (!q) return true;
  return normalizeHeroKey(player).includes(q);
}

/** @param {string | undefined | null} name */
function isValidResultPlayer(name) {
  const n = normalizeHeroKey(name);
  if (!n) return false;
  return n !== "n/a" && n !== "na" && n !== "tbd" && n !== "-";
}

/** @param {{ player1?: string, player2?: string }} row */
function isValidResultRow(row) {
  return isValidResultPlayer(row.player1) && isValidResultPlayer(row.player2);
}

/** @param {string} player @param {{ first_name: string, last_name: string }[]} members */
function playerOnTeam(player, members) {
  const p = normalizeHeroKey(player);
  if (!p) return false;
  return members.some((u) => {
    const full = normalizeHeroKey(`${u.first_name} ${u.last_name}`);
    const comma = normalizeHeroKey(`${u.last_name}, ${u.first_name}`);
    const first = normalizeHeroKey(u.first_name);
    const last = normalizeHeroKey(u.last_name);
    return p === full || p === comma || (first && last && p.includes(first) && p.includes(last));
  });
}

/** @param {string | undefined | null} side */
function flipWinnerSide(side) {
  if (!side) return side;
  const s = String(side);
  const lower = s.toLowerCase();
  if (lower.includes("player 2")) {
    return s
      .replace(/player\s*2/gi, "PLAYER__ONE__PLACEHOLDER")
      .replace(/player\s*1/gi, "Player 2")
      .replace(/PLAYER__ONE__PLACEHOLDER/gi, "Player 1");
  }
  if (lower.includes("player 1")) {
    return s
      .replace(/player\s*1/gi, "PLAYER__TWO__PLACEHOLDER")
      .replace(/player\s*2/gi, "Player 1")
      .replace(/PLAYER__TWO__PLACEHOLDER/gi, "Player 2");
  }
  return s;
}

/**
 * Puts the Righteous team member on the left (player1 / hero1) for match rows.
 * @param {object} row
 * @param {{ first_name: string, last_name: string }[]} members
 */
function orientMatchRowForTeam(row, members) {
  const p1Team = playerOnTeam(row.player1, members);
  const p2Team = playerOnTeam(row.player2, members);
  if (!p2Team || p1Team) return row;
  return {
    ...row,
    player1: row.player2,
    player2: row.player1,
    hero1: row.hero2,
    hero2: row.hero1,
    winner_side: flipWinnerSide(row.winner_side),
    // winner_name is the actual person who won — keep it unchanged when swapping sides.
  };
}

/**
 * Hero art flush to the card edge and corners on its side (cover fill).
 * @param {{ align: "left" | "right", src?: string | null, name?: string | null, isWinner?: boolean }} props
 */
function MatchHeroArtStrip({ align, src, name, isWinner = false }) {
  const label = name != null && String(name).trim() !== "" ? String(name).trim() : "Hero";
  const winnerCls = isWinner ? "ring-2 ring-inset ring-amber-400/75" : "";
  const fadeCls = align === "left" ? heroArtFadeToRight : heroArtFadeToLeft;
  const objectCls = align === "left" ? "object-left" : "object-right";
  const edgeCls = align === "left" ? "left-0" : "right-0";

  return (
    <div
      className={`absolute inset-y-0 z-0 overflow-hidden ${matchHeroArtEdgeWidth} ${edgeCls} ${winnerCls}`}
      aria-hidden={!src}
    >
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full scale-[1.08] object-cover ${objectCls} ${fadeCls}`}
          draggable={false}
        />
      ) : (
        <div
          className={`h-full w-full ${
            align === "right"
              ? "bg-gradient-to-l from-purple-900/30 via-purple-800/12 to-transparent"
              : "bg-gradient-to-r from-purple-900/30 via-purple-800/12 to-transparent"
          } ${fadeCls}`}
          title={label}
        />
      )}
    </div>
  );
}

/**
 * @param {{
 *   align: "left" | "right",
 *   player: string,
 *   hero?: string | null,
 *   isWinner?: boolean,
 *   onPlayerClick?: (name: string) => void,
 * }} props
 */
function MatchPlayerTextBlock({ align, player, hero, isWinner = false, onPlayerClick }) {
  const isLeft = align === "left";
  const playerNameCls = isWinner ? "text-amber-50" : "text-[#f4f0fa]";
  const heroNameCls = isWinner ? "text-amber-100/85" : "text-[#f4f0fa]/68";
  const textPosCls = isLeft
    ? "justify-start pt-2 pb-1.5 pl-2 pr-1 text-left items-start"
    : "justify-end pt-1.5 pb-2 pl-1 pr-2 text-right items-end";

  return (
    <div className={`flex min-w-0 w-full flex-col ${textPosCls}`}>
      <div
        className={`max-w-full ${isLeft ? "" : "ml-auto"} ${
          isWinner
            ? "rounded-md px-1.5 py-1 shadow-[inset_0_0_20px_rgba(251,191,36,0.12)] ring-1 ring-amber-400/55"
            : ""
        }`}
        aria-label={isWinner ? `Winner: ${player}` : undefined}
      >
        <PlayerNameButton
          name={player}
          onPlayerClick={onPlayerClick}
          align={isLeft ? "left" : "right"}
          className={`text-[0.85rem] font-semibold leading-tight ${playerNameCls}`}
        />
        {hero ? (
          <p className={`m-0 max-w-full truncate text-[0.72rem] leading-tight ${heroNameCls}`}>{hero}</p>
        ) : null}
        {isWinner ? (
          <span className="mt-0.5 inline-block rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-amber-950">
            Win
          </span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Full-width hero banner for mobile match rows.
 * @param {{ src?: string | null, name?: string | null, isWinner?: boolean, align?: "left" | "right" }} props
 */
function MatchMobileHeroBanner({ src, name, isWinner = false, align = "left" }) {
  const label = name != null && String(name).trim() !== "" ? String(name).trim() : "Hero";
  const winnerCls = isWinner ? "ring-2 ring-inset ring-amber-400/75" : "";
  const objectCls = align === "left" ? "object-left" : "object-right";
  const fadeCls = heroArtFadeToRight;

  return (
    <div className={`relative h-[4.25rem] w-full overflow-hidden bg-black/20 ${winnerCls}`} aria-hidden={!src}>
      {src ? (
        <img
          src={src}
          alt=""
          className={`h-full w-full scale-[1.06] object-cover ${objectCls} ${fadeCls}`}
          draggable={false}
        />
      ) : (
        <div
          className={`h-full w-full bg-gradient-to-r from-purple-900/35 via-purple-800/15 to-transparent ${fadeCls}`}
          title={label}
        />
      )}
    </div>
  );
}

/**
 * @param {{
 *   player: string,
 *   hero?: string | null,
 *   heroArt?: string | null,
 *   isWinner?: boolean,
 *   onPlayerClick?: (name: string) => void,
 *   align?: "left" | "right",
 *   withTopBorder?: boolean,
 * }} props
 */
function MatchMobilePlayerSection({
  player,
  hero,
  heroArt,
  isWinner = false,
  onPlayerClick,
  align = "left",
  withTopBorder = false,
}) {
  return (
    <div className={withTopBorder ? "border-t border-white/[0.08]" : ""}>
      <MatchMobileHeroBanner src={heroArt} name={hero} isWinner={isWinner} align={align} />
      <div className="px-3 py-2">
        <MatchPlayerTextBlock
          align={align}
          player={player}
          hero={hero}
          isWinner={isWinner}
          onPlayerClick={onPlayerClick}
        />
      </div>
    </div>
  );
}

/**
 * @param {{
 *   player1: string,
 *   hero1?: string | null,
 *   player2: string,
 *   hero2?: string | null,
 *   hero1Art?: string | null,
 *   hero2Art?: string | null,
 *   table?: number | null,
 *   winner?: 1 | 2 | null,
 *   onPlayerClick?: (name: string) => void,
 * }} props
 */
function MatchRowContent({ player1, hero1, player2, hero2, hero1Art, hero2Art, table, winner = null, onPlayerClick }) {
  return (
    <>
      <div className="flex flex-col sm:hidden">
        <MatchMobilePlayerSection
          player={player1}
          hero={hero1}
          heroArt={hero1Art}
          isWinner={winner === 1}
          onPlayerClick={onPlayerClick}
          align="left"
        />
        {table != null && table > 0 ? (
          <div className="border-y border-white/[0.08] bg-black/15 px-3 py-1.5 text-center">
            <p className="m-0 text-[0.78rem] font-semibold text-[#f4f0fa]/55">Table {table}</p>
          </div>
        ) : null}
        <MatchMobilePlayerSection
          player={player2}
          hero={hero2}
          heroArt={hero2Art}
          isWinner={winner === 2}
          onPlayerClick={onPlayerClick}
          align="left"
          withTopBorder={table == null || table <= 0}
        />
      </div>

      <div className={`relative hidden items-stretch sm:flex ${MATCH_ROW_MIN_H}`}>
        <MatchHeroArtStrip align="left" src={hero1Art} name={hero1} isWinner={winner === 1} />
        <MatchHeroArtStrip align="right" src={hero2Art} name={hero2} isWinner={winner === 2} />

        <div className={`relative z-[1] flex min-w-0 flex-1 ${matchHeroArtTextInsetLeft}`}>
          <MatchPlayerTextBlock
            align="left"
            player={player1}
            hero={hero1}
            isWinner={winner === 1}
            onPlayerClick={onPlayerClick}
          />
        </div>
        <div className="relative z-[1] flex shrink-0 flex-col items-center justify-center px-2 sm:px-3">
          {table != null && table > 0 ? (
            <p className="m-0 whitespace-nowrap text-[0.875rem] font-semibold text-[#f4f0fa]/55">Table {table}</p>
          ) : null}
        </div>
        <div className={`relative z-[1] flex min-w-0 flex-1 justify-end ${matchHeroArtTextInsetRight}`}>
          <MatchPlayerTextBlock
            align="right"
            player={player2}
            hero={hero2}
            isWinner={winner === 2}
            onPlayerClick={onPlayerClick}
          />
        </div>
      </div>
    </>
  );
}

/**
 * @param {object} row
 * @returns {1 | 2 | null}
 */
/** @param {string | undefined | null} a @param {string | undefined | null} b */
function resultPlayerNamesMatch(a, b) {
  const x = normalizeHeroKey(a);
  const y = normalizeHeroKey(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const xParts = x.split(" ");
  const yParts = y.split(" ");
  if (xParts.length >= 2 && yParts.length >= 2) {
    const xFirst = xParts[0];
    const xLast = xParts[xParts.length - 1];
    const yFirst = yParts[0];
    const yLast = yParts[yParts.length - 1];
    if (xFirst === yFirst && (xLast === yLast || xLast.startsWith(yLast) || yLast.startsWith(xLast))) {
      return true;
    }
  }
  return false;
}

function matchRowWinnerSide(row) {
  if (row.winner_name) {
    if (resultPlayerNamesMatch(row.winner_name, row.player1)) return 1;
    if (resultPlayerNamesMatch(row.winner_name, row.player2)) return 2;
  }
  const side = String(row.winner_side || "").toLowerCase();
  if (side.includes("player 1")) return 1;
  if (side.includes("player 2")) return 2;
  return null;
}

/**
 * @param {{ isLight: boolean, rowChrome: string, heroes: HeroOption[], formatId?: number | null, row: object, onPlayerClick?: (name: string) => void }} props
 */
function PairingMatchRow({ isLight, rowChrome, heroes, formatId, row, onPlayerClick }) {
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;

  return (
    <div className={`overflow-hidden rounded-xl border ${border}`}>
      <MatchRowContent
        player1={row.player1}
        hero1={row.hero1}
        player2={row.player2}
        hero2={row.hero2}
        hero1Art={heroArtForName(row.hero1, heroes, formatId)}
        hero2Art={heroArtForName(row.hero2, heroes, formatId)}
        table={row.table}
        onPlayerClick={onPlayerClick}
      />
    </div>
  );
}

/**
 * @param {{ isLight: boolean, rowChrome: string, heroes: HeroOption[], formatId?: number | null, row: object, onPlayerClick?: (name: string) => void }} props
 */
function ResultMatchRow({ isLight, rowChrome, heroes, formatId, row, onPlayerClick }) {
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;
  const winner = matchRowWinnerSide(row);

  return (
    <div className={`overflow-hidden rounded-xl border ${border}`}>
      <MatchRowContent
        player1={row.player1}
        hero1={row.hero1}
        player2={row.player2}
        hero2={row.hero2}
        hero1Art={heroArtForName(row.hero1, heroes, formatId)}
        hero2Art={heroArtForName(row.hero2, heroes, formatId)}
        winner={winner}
        onPlayerClick={onPlayerClick}
      />
    </div>
  );
}

/** @param {unknown} raw */
function parseStandingsPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * @param {number | null | undefined} currentRank
 * @param {Map<string, number>} prevRankByPlayer
 * @param {string} player
 * @returns {number | null} positive = climbed, negative = dropped
 */
function standingRankDelta(currentRank, prevRankByPlayer, player) {
  const key = normalizeHeroKey(player);
  if (!key) return null;
  const prev = prevRankByPlayer.get(key);
  const cur = Number(currentRank);
  if (prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
  return prev - cur;
}

/**
 * @param {{
 *   isLight: boolean,
 *   rowChrome: string,
 *   heroes: HeroOption[],
 *   formatId?: number | null,
 *   row: object,
 *   rankDelta?: number | null,
 *   onPlayerClick?: (name: string) => void,
 * }} props
 */
function StandingGridCard({ isLight, rowChrome, heroes, formatId, row, rankDelta = null, onPlayerClick }) {
  const heroArt = heroArtForName(row.hero, heroes, formatId);
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;

  return (
    <div className={`relative min-h-[5.75rem] overflow-hidden rounded-lg border ${border}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[58%] sm:w-[54%]" aria-hidden>
        {heroArt ? (
          <img
            src={heroArt}
            alt=""
            className={`h-full w-full scale-[1.06] object-cover object-left ${heroArtFadeLeft}`}
            draggable={false}
          />
        ) : (
          <div
            className={`h-full w-full bg-gradient-to-r from-purple-900/35 via-purple-800/15 to-transparent ${heroArtFadeLeft}`}
          />
        )}
      </div>
      <div className="relative z-[1] min-h-[5.75rem]">
        <div className="absolute right-3 top-2.5 flex flex-wrap items-baseline justify-end gap-x-1.5 gap-y-0">
          <span className="text-[0.72rem] font-bold tabular-nums text-[#f4f0fa]/55">#{row.rank}</span>
          {rankDelta != null && rankDelta !== 0 ? (
            <span
              className={`text-[0.68rem] font-semibold tabular-nums ${
                rankDelta > 0 ? "text-emerald-400" : "text-red-400"
              }`}
              title={rankDelta > 0 ? `Up ${rankDelta} from last round` : `Down ${Math.abs(rankDelta)} from last round`}
            >
              {rankDelta > 0 ? `+${rankDelta}` : rankDelta}
            </span>
          ) : null}
        </div>
        <div className="absolute bottom-2.5 right-3 max-w-[calc(100%-3.5rem)] text-right">
          <PlayerNameButton
            name={row.player}
            onPlayerClick={onPlayerClick}
            align="right"
            className="text-[0.78rem] font-semibold leading-tight text-[#f4f0fa]"
          />
          <p className="m-0 max-w-full truncate text-[0.68rem] leading-tight text-[#f4f0fa]/68">
            {row.hero || "—"}
          </p>
          <p className="m-0 text-[0.65rem] text-[#f4f0fa]/52">
            {row.wins} {row.wins === 1 ? "Win" : "Wins"}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * @param {{
 *   isLight: boolean,
 *   active: boolean,
 *   eventId: string,
 * }} props
 */
export function EventDetailPage({ isLight, active, eventId }) {
  const { user, sessionProfile } = useAuth();
  const canWrite = canWriteContent(sessionProfile?.role);
  const [event, setEvent] = useState(/** @type {object | null} */ (null));
  const [eventData, setEventData] = useState(/** @type {object[]} */ ([]));
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(/** @type {string | null} */ (null));

  const [mainTab, setMainTab] = useState(/** @type {MainTab} */ ("team"));
  const [coverageTab, setCoverageTab] = useState(/** @type {CoverageTab} */ ("snapshot"));
  const [dataIdx, setDataIdx] = useState(0);
  const [streamTabIdx, setStreamTabIdx] = useState(0);
  const [round, setRound] = useState(1);
  const [rounds, setRounds] = useState(/** @type {object[]} */ ([]));
  const [roundsLoading, setRoundsLoading] = useState(false);

  const [pairings, setPairings] = useState(/** @type {object[]} */ ([]));
  const [pairingsLoading, setPairingsLoading] = useState(false);
  const [results, setResults] = useState(/** @type {object[]} */ ([]));
  const [resultsLoading, setResultsLoading] = useState(false);
  const [standings, setStandings] = useState(/** @type {object[]} */ ([]));
  const [prevStandings, setPrevStandings] = useState(/** @type {object[]} */ ([]));
  const [standingsLoading, setStandingsLoading] = useState(false);

  const [teamMatches, setTeamMatches] = useState(/** @type {object[]} */ ([]));
  const [teamLoading, setTeamLoading] = useState(false);
  const [heroes, setHeroes] = useState(/** @type {HeroOption[]} */ ([]));

  const [comments, setComments] = useState(/** @type {object[]} */ ([]));
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [streamUrlDraft, setStreamUrlDraft] = useState("");
  const [streamUrlSaving, setStreamUrlSaving] = useState(false);
  const [streamUrlError, setStreamUrlError] = useState(/** @type {string | null} */ (null));
  const [nameFilter, setNameFilter] = useState("");

  const [eventMetaSnapshot, setEventMetaSnapshot] = useState(
    /** @type {import("../utils/eventMeta.js").EventMetaSnapshot | null} */ (null),
  );
  const [eventMetaLoading, setEventMetaLoading] = useState(false);
  const [metaRound, setMetaRound] = useState(1);
  const [metaDay, setMetaDay] = useState(/** @type {import("../utils/eventMetaDay.js").MetaDay} */ ("day1"));
  const [metaSubTab, setMetaSubTab] = useState(/** @type {"share" | "round-stats" | "matchups"} */ ("share"));
  const roundsInitializedRef = useRef(false);
  const [metaSharePhase, setMetaSharePhase] = useState(
    /** @type {import("../utils/eventMetaDay.js").MetaSharePhase} */ ("cc"),
  );

  const [historyPlayer, setHistoryPlayer] = useState(/** @type {string | null} */ (null));
  const [playerHistory, setPlayerHistory] = useState(
    /** @type {import("./EventPlayerHistoryModal.jsx").PlayerHistory | null} */ (null),
  );
  const [playerHistoryLoading, setPlayerHistoryLoading] = useState(false);
  const [playerHistoryError, setPlayerHistoryError] = useState(/** @type {string | null} */ (null));

  const activeData = eventData[dataIdx] ?? null;
  const showCoverage = mainTab === "team" || mainTab === "overall";
  const showMeta = mainTab === "meta";

  const mainTabBtn = (id, label) => {
    const on = mainTab === id;
    return (
      <button
        type="button"
        key={id}
        className={`border-b-2 pb-2.5 text-[0.875rem] font-semibold transition -mb-px ${
          on
            ? "border-purple-400/80 text-[#f4f0fa]"
            : "border-transparent text-[#f4f0fa]/50 hover:border-white/20 hover:text-[#f4f0fa]/80"
        }`}
        onClick={() => {
          setMainTab(id);
          if (id === "team") setCoverageTab("snapshot");
        }}
      >
        {label}
      </button>
    );
  };

  const coverageTabBtn = (id, label) => {
    const on = coverageTab === id;
    return (
      <button
        type="button"
        key={id}
        className={`rounded-md px-2.5 py-1 text-[0.8125rem] font-medium transition ${
          on ? "bg-white/10 text-[#f4f0fa]" : "text-[#f4f0fa]/55 hover:bg-white/[0.06] hover:text-[#f4f0fa]/85"
        }`}
        onClick={() => setCoverageTab(id)}
      >
        {label}
      </button>
    );
  };

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      setMetaLoading(true);
      setMetaError(null);
      try {
        const token = await user.getIdToken();
        const [eventRes, metaRes] = await Promise.all([
          fetch(`/api/events/${eventId}`, { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/recordings/meta", { headers: { Authorization: `Bearer ${token}` } }),
        ]);
        if (!eventRes.ok) throw new Error((await eventRes.text()).trim() || eventRes.statusText);
        const data = await eventRes.json();
        if (cancelled) return;
        setEvent(data.event ?? null);
        setEventData(Array.isArray(data.event_data) ? data.event_data : []);
        setDataIdx(0);
        setStreamTabIdx(0);
        setMainTab("team");
        setCoverageTab("snapshot");

        if (metaRes.ok) {
          const meta = await metaRes.json();
          const heroList = Array.isArray(meta.heroes) ? meta.heroes : [];
          setHeroes(
            heroList
              .filter((h) => h && typeof h.id === "number")
              .map((h) => ({
                id: h.id,
                name: String(h.name ?? "").trim() || `Hero ${h.id}`,
                young: h.young === true,
                art_image_url:
                  h.art_image_url != null && String(h.art_image_url).trim() !== ""
                    ? String(h.art_image_url).trim()
                    : null,
              })),
          );
        }
      } catch (e) {
        if (!cancelled) setMetaError(e instanceof Error ? e.message : "Failed to load event");
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, eventId]);

  useEffect(() => {
    if (!active || !user || eventData.length > 0) return undefined;
    let cancelled = false;
    const poll = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = await res.json();
        const next = Array.isArray(data.event_data) ? data.event_data : [];
        if (next.length === 0 || cancelled) return;
        setEvent(data.event ?? null);
        setEventData(next);
        setDataIdx(0);
        setStreamTabIdx(0);
      } catch {
        /* ignore background poll errors */
      }
    };
    const timer = setInterval(() => {
      void poll();
    }, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [active, user, eventId, eventData.length]);

  useEffect(() => {
    if (!active || !user || !event) return undefined;
    let cancelled = false;
    (async () => {
      setTeamLoading(true);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/events/${eventId}/team-summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
        const data = await res.json();
        if (!cancelled) setTeamMatches(Array.isArray(data.matches) ? data.matches : []);
      } catch {
        if (!cancelled) setTeamMatches([]);
      } finally {
        if (!cancelled) setTeamLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, eventId, event]);

  useEffect(() => {
    roundsInitializedRef.current = false;
  }, [activeData?.id]);

  const loadRounds = useCallback(async () => {
    if (!user || !activeData) return;
    setRoundsLoading(true);
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ event_data_id: String(activeData.id) });
      const res = await fetch(`/api/events/${eventId}/rounds?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      const data = await res.json();
      const list = Array.isArray(data.rounds) ? data.rounds : [];
      setRounds(list);
      if (list.length > 0) {
        const max = list.reduce((m, r) => (r.round_number > m ? r.round_number : m), list[0].round_number ?? 1);
        setRound((prev) => {
          if (!roundsInitializedRef.current) {
            roundsInitializedRef.current = true;
            return max;
          }
          if (prev > 0 && list.some((r) => r.round_number === prev)) return prev;
          return max;
        });
        const day = defaultMetaDay(max);
        setMetaDay(day);
        const dayList = metaDayRounds(day, list);
        const metaMax =
          dayList.length > 0
            ? dayList.reduce((m, r) => (r.round_number > m ? r.round_number : m), dayList[0].round_number ?? 1)
            : max;
        setMetaRound(metaMax);
      }
    } catch {
      setRounds([]);
    } finally {
      setRoundsLoading(false);
    }
  }, [user, activeData, eventId]);

  useEffect(() => {
    if (!active || !activeData || (!showCoverage && !showMeta)) return;
    void loadRounds();
  }, [active, activeData, showCoverage, showMeta, loadRounds]);

  useEffect(() => {
    if (!active || !activeData || (!showCoverage && !showMeta)) return undefined;
    const timer = setInterval(() => {
      void loadRounds();
    }, 60_000);
    return () => clearInterval(timer);
  }, [active, activeData, showCoverage, showMeta, loadRounds]);

  const loadEventMeta = useCallback(async () => {
    if (!user || !activeData || !metaRound) return;
    setEventMetaLoading(true);
    try {
      const token = await user.getIdToken();
      const throughRound = metaEffectiveThroughRound(
        metaDay,
        metaSubTab,
        metaRound,
        rounds,
        activeData.event_type,
        metaSharePhase,
      );
      const fromRound = metaEffectiveFromRound(
        metaDay,
        metaSubTab,
        rounds,
        activeData.event_type,
        metaSharePhase,
      );
      const params = new URLSearchParams({
        event_data_id: String(activeData.id),
        through_round: String(throughRound),
      });
      if (showMetaDaySplit(rounds) || fromRound > 1) {
        params.set("from_round", String(fromRound));
      }
      const sharePhase = metaEffectiveSharePhase(
        metaDay,
        metaSharePhase,
        activeData.event_type,
        metaSubTab,
      );
      if (sharePhase) {
        params.set("meta_share_phase", sharePhase);
      }
      const res = await fetch(`/api/events/${eventId}/meta?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      const data = await res.json();
      setEventMetaSnapshot(parseEventMetaSnapshot(data));
    } catch {
      setEventMetaSnapshot(null);
    } finally {
      setEventMetaLoading(false);
    }
  }, [user, activeData, metaRound, metaDay, metaSubTab, metaSharePhase, rounds, eventId]);

  useEffect(() => {
    if (!active || !showMeta || !activeData || roundsLoading) return;
    void loadEventMeta();
  }, [active, showMeta, activeData, metaRound, metaDay, metaSubTab, metaSharePhase, roundsLoading, loadEventMeta]);

  const metaDaySplitActive = showMetaDaySplit(rounds);
  const metaRoundOptions = useMemo(() => metaDayRounds(metaDay, rounds), [metaDay, rounds]);

  const onMetaDayChange = useCallback(
    (day) => {
      setMetaDay(day);
      const dayList = metaDayRounds(day, rounds);
      if (dayList.length === 0) return;
      const maxInDay = dayList.reduce(
        (m, r) => (r.round_number > m ? r.round_number : m),
        dayList[0].round_number ?? 1,
      );
      setMetaRound(maxInDay);
    },
    [rounds],
  );

  const openPlayerHistory = useCallback((name) => {
    const label = String(name ?? "").trim();
    if (!label) return;
    setHistoryPlayer(label);
  }, []);

  const closePlayerHistory = useCallback(() => {
    setHistoryPlayer(null);
    setPlayerHistory(null);
    setPlayerHistoryError(null);
  }, []);

  const loadPlayerHistory = useCallback(
    async (playerName) => {
      if (!user || !activeData || !playerName) return;
      setPlayerHistoryLoading(true);
      setPlayerHistoryError(null);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          event_data_id: String(activeData.id),
          player: playerName,
        });
        const res = await fetch(`/api/events/${eventId}/player-history?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
        const data = await res.json();
        setPlayerHistory(parsePlayerHistory(data));
      } catch (e) {
        setPlayerHistory(null);
        setPlayerHistoryError(e instanceof Error ? e.message : "Failed to load player history");
      } finally {
        setPlayerHistoryLoading(false);
      }
    },
    [user, activeData, eventId],
  );

  useEffect(() => {
    if (!active || !historyPlayer) return;
    void loadPlayerHistory(historyPlayer);
  }, [active, historyPlayer, loadPlayerHistory]);

  const fetchCoverageTab = useCallback(
    async (kind) => {
      if (!user || !activeData || !round) return;
      const setLoading =
        kind === "pairings" ? setPairingsLoading : kind === "results" ? setResultsLoading : setStandingsLoading;
      const setData = kind === "pairings" ? setPairings : kind === "results" ? setResults : setStandings;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };

        const fetchRoundPayload = async (endpoint, roundNum) => {
          const params = new URLSearchParams({
            event_data_id: String(activeData.id),
            round: String(roundNum),
          });
          const res = await fetch(`/api/events/${eventId}/${endpoint}?${params}`, { headers });
          if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
          const data = await res.json();
          return data[endpoint];
        };

        if (kind === "standings") {
          let prevRound = null;
          for (const r of rounds) {
            const n = r.round_number;
            if (typeof n !== "number" || n >= round) continue;
            if (prevRound === null || n > prevRound) prevRound = n;
          }

          const [currentRaw, prevRaw] = await Promise.all([
            fetchRoundPayload("standings", round),
            prevRound != null ? fetchRoundPayload("standings", prevRound) : Promise.resolve(null),
          ]);
          setStandings(parseStandingsPayload(currentRaw));
          setPrevStandings(prevRound != null ? parseStandingsPayload(prevRaw) : []);
        } else {
          setPrevStandings([]);
          const raw = await fetchRoundPayload(kind, round);
          if (Array.isArray(raw)) {
            setData(raw);
          } else if (typeof raw === "string") {
            try {
              setData(JSON.parse(raw));
            } catch {
              setData([]);
            }
          } else {
            setData([]);
          }
        }
      } catch {
        if (kind === "standings") {
          setStandings([]);
          setPrevStandings([]);
        } else {
          setData([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [user, activeData, round, eventId, rounds],
  );

  useEffect(() => {
    if (!active || !showCoverage || !activeData || roundsLoading) return;
    if (coverageTab === "snapshot") return;
    void fetchCoverageTab(coverageTab);
  }, [active, showCoverage, coverageTab, activeData, round, roundsLoading, fetchCoverageTab]);

  useEffect(() => {
    if (mainTab === "overall" && coverageTab === "snapshot") {
      setCoverageTab("pairings");
    }
  }, [mainTab, coverageTab]);

  const loadComments = useCallback(async () => {
    if (!user || !activeData) return;
    setCommentsLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/events/data/${activeData.id}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      const data = await res.json();
      setComments(Array.isArray(data.comments) ? data.comments : []);
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, [user, activeData]);

  useEffect(() => {
    if (!active || mainTab !== "streams" || !activeData) return;
    void loadComments();
  }, [active, mainTab, activeData, loadComments]);

  useEffect(() => {
    setStreamTabIdx(0);
    setMainTab("team");
    setCoverageTab("snapshot");
    setNameFilter("");
    closePlayerHistory();
  }, [dataIdx, closePlayerHistory]);

  useEffect(() => {
    const urls = Array.isArray(activeData?.stream_urls) ? activeData.stream_urls : [];
    setStreamUrlDraft(urls[streamTabIdx] ?? "");
    setStreamUrlError(null);
  }, [activeData, streamTabIdx]);

  const onSaveStreamURL = useCallback(async () => {
    if (!user || !activeData || streamUrlSaving) return;
    setStreamUrlSaving(true);
    setStreamUrlError(null);
    try {
      const token = await user.getIdToken();
      const urls = Array.isArray(activeData.stream_urls) ? [...activeData.stream_urls] : [];
      while (urls.length <= streamTabIdx) urls.push("");
      urls[streamTabIdx] = streamUrlDraft.trim();
      const res = await fetch(`/api/events/data/${activeData.id}/stream-urls`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ stream_urls: urls }),
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      const data = await res.json();
      if (data.event_data) {
        setEventData((prev) => prev.map((row) => (row.id === data.event_data.id ? data.event_data : row)));
      }
    } catch (e) {
      setStreamUrlError(e instanceof Error ? e.message : "Failed to save stream URL");
    } finally {
      setStreamUrlSaving(false);
    }
  }, [user, activeData, streamUrlDraft, streamTabIdx, streamUrlSaving]);

  const onPostComment = useCallback(async () => {
    if (!user || !activeData || commentSubmitting) return;
    const text = commentDraft.trim();
    if (!text) return;
    setCommentSubmitting(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/events/data/${activeData.id}/comments`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ comment: text }),
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      setCommentDraft("");
      await loadComments();
    } finally {
      setCommentSubmitting(false);
    }
  }, [user, activeData, commentDraft, commentSubmitting, loadComments]);

  const streamTabs = useMemo(() => {
    if (!activeData) return [];
    return Array.isArray(activeData.stream_tabs) ? activeData.stream_tabs : [];
  }, [activeData]);

  const currentStreamURL = useMemo(() => {
    const urls = Array.isArray(activeData?.stream_urls) ? activeData.stream_urls : [];
    return urls[streamTabIdx] ?? "";
  }, [activeData, streamTabIdx]);

  const youtubeId = useMemo(
    () => (currentStreamURL ? youtubeVideoIdFromInput(currentStreamURL) : null),
    [currentStreamURL],
  );

  const segmentTeamMatches = useMemo(() => {
    if (!activeData) return [];
    return teamMatches.filter((m) => m.event_data_id === activeData.id);
  }, [teamMatches, activeData]);

  const teamMembers = useMemo(() => {
    const seen = new Set();
    /** @type {{ first_name: string, last_name: string }[]} */
    const out = [];
    for (const m of segmentTeamMatches) {
      if (seen.has(m.user_id)) continue;
      seen.add(m.user_id);
      out.push({ user_id: m.user_id, first_name: m.first_name, last_name: m.last_name });
    }
    return out;
  }, [segmentTeamMatches]);

  const filteredPairings = useMemo(() => {
    let rows = pairings;
    if (mainTab === "team") {
      if (teamMembers.length === 0) return [];
      rows = rows
        .filter(
          (row) => playerOnTeam(row.player1, teamMembers) || playerOnTeam(row.player2, teamMembers),
        )
        .map((row) => orientMatchRowForTeam(row, teamMembers));
    }
    if (!nameFilter.trim()) return rows;
    return rows.filter(
      (row) => playerMatchesNameFilter(row.player1, nameFilter) || playerMatchesNameFilter(row.player2, nameFilter),
    );
  }, [mainTab, pairings, teamMembers, nameFilter]);

  const filteredResults = useMemo(() => {
    let rows = results.filter(isValidResultRow);
    if (mainTab === "team") {
      if (teamMembers.length === 0) return [];
      rows = rows
        .filter(
          (row) => playerOnTeam(row.player1, teamMembers) || playerOnTeam(row.player2, teamMembers),
        )
        .map((row) => orientMatchRowForTeam(row, teamMembers));
    }
    if (!nameFilter.trim()) return rows;
    return rows.filter(
      (row) => playerMatchesNameFilter(row.player1, nameFilter) || playerMatchesNameFilter(row.player2, nameFilter),
    );
  }, [mainTab, results, teamMembers, nameFilter]);

  const filteredStandings = useMemo(() => {
    let rows = standings;
    if (mainTab === "team") {
      if (teamMembers.length === 0) return [];
      rows = rows.filter((row) => playerOnTeam(row.player, teamMembers));
    }
    if (!nameFilter.trim()) return rows;
    return rows.filter((row) => playerMatchesNameFilter(row.player, nameFilter));
  }, [mainTab, standings, teamMembers, nameFilter]);

  const teamSnapshot = useMemo(() => {
    if (!activeData || teamMembers.length === 0) {
      return { chartSeries: [], chartRounds: [], rankings: [], maxWins: 1 };
    }
    return buildTeamSnapshot(segmentTeamMatches, teamMembers, round);
  }, [activeData, segmentTeamMatches, teamMembers, round]);

  const prevRankByPlayer = useMemo(() => {
    /** @type {Map<string, number>} */
    const map = new Map();
    for (const row of prevStandings) {
      const key = normalizeHeroKey(row.player);
      const rank = Number(row.rank);
      if (key && Number.isFinite(rank)) map.set(key, rank);
    }
    return map;
  }, [prevStandings]);

  const nameFilterActive = nameFilter.trim().length > 0;

  const coverageLoading =
    coverageTab === "snapshot"
      ? teamLoading
      : coverageTab === "pairings"
        ? pairingsLoading
        : coverageTab === "results"
          ? resultsLoading
          : standingsLoading;

  const rowChrome = isLight
    ? "border-white/[0.12] bg-black/25"
    : "border-white/[0.20] bg-black/20 ring-1 ring-white/[0.05]";

  if (metaLoading) {
    return <TabSpinner />;
  }
  if (metaError || !event) {
    return (
      <div className="px-2 py-4">
        <p className="text-red-200/90">{metaError || "Event not found"}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.875rem]">
          <h2 className="m-0 text-base font-semibold tracking-tight text-[#f4f0fa] sm:text-lg">{event.title}</h2>
          {event.date_text ? (
            <>
              <span className="text-[#f4f0fa]/35" aria-hidden>
                ·
              </span>
              <span className="text-[#f4f0fa]/70">{event.date_text}</span>
            </>
          ) : null}
          {activeData?.format_name || (activeData?.format != null && cardFormatName(activeData.format)) ? (
            <>
              <span className="text-[#f4f0fa]/35" aria-hidden>
                ·
              </span>
              <span className="text-[#f4f0fa]/70">
                {activeData.format_name || cardFormatName(activeData.format)}
              </span>
            </>
          ) : null}
          <span className="text-[#f4f0fa]/35" aria-hidden>
            ·
          </span>
          <a
            href={event.event_url}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-purple-200/90 underline hover:text-purple-100"
          >
            FabTCG event page
          </a>
        </div>
        {eventData.length > 1 ? (
          <select
            className="rg-select max-w-[min(100vw-2rem,18rem)] min-w-[11rem] shrink-0 rounded-md border border-white/15 bg-black/25 py-2 pl-3 text-[0.875rem] font-semibold text-[#f4f0fa] outline-none focus:border-purple-400/45"
            value={dataIdx}
            aria-label="Event segment"
            onChange={(e) => setDataIdx(Number(e.target.value))}
          >
            {eventData.map((d, idx) => (
              <option key={d.id ?? idx} value={idx}>
                {segmentLabel(d)}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <nav className="flex gap-6 border-b border-white/[0.1]" aria-label="Event view">
        {mainTabBtn("team", "Team")}
        {mainTabBtn("overall", "Overall")}
        {mainTabBtn("meta", "Meta")}
        {mainTabBtn("streams", "Streams")}
      </nav>

      {eventData.length === 0 ? (
        <div
          className={`rounded-xl border px-6 py-10 text-center ${
            isLight ? "border-white/[0.12] bg-black/25" : rowChrome
          }`}
        >
          <p className="m-0 text-[0.9375rem] font-medium text-[#f4f0fa]">Coverage coming soon</p>
          <p className="mx-auto mt-2 max-w-md text-[0.85rem] leading-relaxed text-[#f4f0fa]/60">
            FabTCG hasn&apos;t published coverage links for this event yet. Pairings, results, and standings will
            appear here automatically once they&apos;re available.
          </p>
          <p className="m-0 mt-3 text-[0.75rem] text-[#f4f0fa]/45">Checking for updates every minute…</p>
        </div>
      ) : null}

      {eventData.length > 0 && showCoverage && activeData ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-black/15 p-0.5" role="tablist">
                {mainTab === "team" ? coverageTabBtn("snapshot", "Snapshot") : null}
                {coverageTabBtn("pairings", "Pairings")}
                {coverageTabBtn("results", "Results")}
                {coverageTabBtn("standings", "Standings")}
              </div>
              {coverageTab !== "snapshot" ? (
                <input
                  type="search"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  placeholder="Search players…"
                  aria-label="Search players"
                  className="min-w-[10rem] max-w-xs rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-[0.8125rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/45 sm:w-48"
                />
              ) : null}
            </div>
            {roundsLoading ? (
              <span className="shrink-0 text-[0.8rem] text-[#f4f0fa]/55">Loading rounds…</span>
            ) : (
              <select
                className="rg-select shrink-0 rounded-md border border-white/15 bg-black/25 py-1.5 pl-2.5 text-[0.8125rem] text-[#f4f0fa] outline-none focus:border-purple-400/45"
                value={round}
                aria-label="Round"
                onChange={(e) => setRound(Number(e.target.value))}
              >
                {rounds.map((r) => (
                  <option key={r.id ?? r.round_number} value={r.round_number}>
                    {r.round_label || `Round ${r.round_number}`}
                  </option>
                ))}
              </select>
            )}
          </div>

          {mainTab === "team" &&
          !teamLoading &&
          teamMembers.length === 0 &&
          coverageTab !== "snapshot" ? (
            <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
              No Righteous players matched in {segmentLabel(activeData)} yet.
            </p>
          ) : null}

          {roundsLoading || coverageLoading ? <TabSpinner /> : null}

          {!roundsLoading && !coverageLoading && mainTab === "team" && coverageTab === "snapshot" ? (
            <EventTeamSnapshot
              chartSeries={teamSnapshot.chartSeries}
              chartRounds={teamSnapshot.chartRounds}
              rankings={teamSnapshot.rankings}
              maxWins={teamSnapshot.maxWins}
              isLight={isLight}
              rowChrome={rowChrome}
              currentRound={round}
              onPlayerClick={openPlayerHistory}
            />
          ) : null}

          {!roundsLoading && !coverageLoading && coverageTab === "pairings" ? (
            <div className={matchRowsWrapCls}>
              {filteredPairings.map((row, idx) => (
                <PairingMatchRow
                  key={idx}
                  isLight={isLight}
                  rowChrome={rowChrome}
                  heroes={heroes}
                  formatId={activeData.format}
                  row={row}
                  onPlayerClick={openPlayerHistory}
                />
              ))}
              {filteredPairings.length === 0 ? (
                <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
                  {nameFilterActive ? "No pairings match that name." : "No pairings for this round."}
                </p>
              ) : null}
            </div>
          ) : null}

          {!roundsLoading && !coverageLoading && coverageTab === "results" ? (
            <div className={matchRowsWrapCls}>
              {filteredResults.map((row, idx) => (
                <ResultMatchRow
                  key={idx}
                  isLight={isLight}
                  rowChrome={rowChrome}
                  heroes={heroes}
                  formatId={activeData.format}
                  row={row}
                  onPlayerClick={openPlayerHistory}
                />
              ))}
              {filteredResults.length === 0 ? (
                <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
                  {nameFilterActive ? "No results match that name." : "No results for this round."}
                </p>
              ) : null}
            </div>
          ) : null}

          {!roundsLoading && !coverageLoading && coverageTab === "standings" ? (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {filteredStandings.map((row, idx) => (
                <StandingGridCard
                  key={`${normalizeHeroKey(row.player)}-${row.rank}-${idx}`}
                  isLight={isLight}
                  rowChrome={rowChrome}
                  heroes={heroes}
                  formatId={activeData.format}
                  row={row}
                  rankDelta={standingRankDelta(row.rank, prevRankByPlayer, row.player)}
                  onPlayerClick={openPlayerHistory}
                />
              ))}
              {filteredStandings.length === 0 ? (
                <p className="col-span-full m-0 text-[0.85rem] text-[#f4f0fa]/60">
                  {nameFilterActive ? "No standings match that name." : "No standings for this round."}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {eventData.length > 0 && showMeta && activeData ? (
        <EventMetaTab
          snapshot={eventMetaSnapshot}
          rounds={metaRoundOptions}
          metaRound={metaRound}
          onMetaRoundChange={setMetaRound}
          metaSubTab={metaSubTab}
          onMetaSubTabChange={setMetaSubTab}
          showMetaDaySplit={metaDaySplitActive}
          metaDay={metaDay}
          onMetaDayChange={onMetaDayChange}
          showNationalsFormatSplit={showNationalsFormatSplit(activeData.event_type)}
          metaSharePhase={metaSharePhase}
          onMetaSharePhaseChange={setMetaSharePhase}
          maxRound={metaMaxRoundNumber(rounds)}
          loading={eventMetaLoading || roundsLoading}
          isLight={isLight}
          rowChrome={rowChrome}
        />
      ) : null}

      {eventData.length > 0 && mainTab === "streams" && activeData ? (
        <>
          {streamTabs.length > 1 ? (
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-white/[0.1] bg-black/20 p-1">
              {streamTabs.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-md px-3 py-1.5 text-[0.8125rem] font-semibold transition ${
                    streamTabIdx === idx
                      ? "bg-purple-500/25 text-purple-100"
                      : "text-[#f4f0fa]/60 hover:bg-white/[0.05] hover:text-[#f4f0fa]/90"
                  }`}
                  onClick={() => setStreamTabIdx(idx)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {youtubeId ? (
            <div className="aspect-video w-full overflow-hidden rounded-xl border border-white/10 bg-black">
                  <iframe
                    title="Event stream"
                    className="h-full w-full"
                    src={youtubeEmbedSrc(youtubeId)}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-xl border border-dashed border-white/15 bg-black/15 px-4 py-6">
                  <p className="m-0 text-[0.9rem] text-[#f4f0fa]/70">
                    No stream URL for {streamTabs[streamTabIdx] ?? "this segment"} yet.
                    {!canWrite ? " Ask a team member to add one." : null}
                  </p>
                  {canWrite ? (
                    <>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                          YouTube URL
                        </span>
                        <input
                          type="url"
                          className="w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={streamUrlDraft}
                          disabled={streamUrlSaving}
                          onChange={(e) => setStreamUrlDraft(e.target.value)}
                        />
                      </label>
                      {streamUrlError ? (
                        <p className="m-0 text-[0.85rem] text-red-200/90">{streamUrlError}</p>
                      ) : null}
                      <button
                        type="button"
                        className="self-start rounded-lg border border-white/25 bg-purple-900/40 px-3 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-45"
                        disabled={streamUrlSaving || !streamUrlDraft.trim()}
                        onClick={() => void onSaveStreamURL()}
                      >
                        {streamUrlSaving ? "Saving…" : "Save stream URL"}
                      </button>
                    </>
                  ) : null}
                </div>
          )}

          <div className="border-t border-white/[0.08] pt-5">
            <h3 className="m-0 text-[0.9rem] font-semibold text-[#f4f0fa]/90">Stream comments</h3>
                {commentsLoading ? <TabSpinner /> : null}
                {!commentsLoading && comments.length === 0 ? (
                  <p className="mt-2 text-[0.85rem] text-[#f4f0fa]/60">No comments yet.</p>
                ) : null}
                {!commentsLoading ? (
                  <ul className="mt-3 flex flex-col gap-3">
                    {comments.map((c) => (
                      <li key={c.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                        <div className="text-[0.75rem] text-[#f4f0fa]/50">
                          {c.owner_username || c.owner_email} · {formatDateTime(c.created_at)}
                        </div>
                        <p className="m-0 mt-1 text-[0.875rem] text-[#f4f0fa]/90">{c.comment}</p>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {canWrite ? (
                  <div className="mt-4 flex flex-col gap-2">
                    <textarea
                      className="min-h-[4.5rem] w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
                      placeholder="Add a comment…"
                      value={commentDraft}
                      disabled={commentSubmitting}
                      onChange={(e) => setCommentDraft(e.target.value)}
                    />
                    <button
                      type="button"
                      className="self-start rounded-lg border border-white/25 bg-purple-900/40 px-3 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-45"
                      disabled={commentSubmitting}
                      onClick={() => void onPostComment()}
                    >
                      {commentSubmitting ? "Posting…" : "Post comment"}
                    </button>
                  </div>
                ) : null}
          </div>
        </>
      ) : null}

      <EventPlayerHistoryModal
        open={historyPlayer != null}
        player={historyPlayer}
        history={playerHistory}
        loading={playerHistoryLoading}
        error={playerHistoryError}
        isLight={isLight}
        onClose={closePlayerHistory}
        onPlayerClick={openPlayerHistory}
      />
    </div>
  );
}
