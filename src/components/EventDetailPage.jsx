import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";
import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "../utils/youtube";

/** @typedef {"team" | "overall" | "streams"} MainTab */
/** @typedef {"pairings" | "results" | "standings"} CoverageTab */
/** @typedef {{ id: number, name: string, art_image_url?: string | null }} HeroOption */

/** @param {object} d */
function segmentLabel(d) {
  return d.label || d.event_type_name || `Segment ${d.id}`;
}

const MATCH_ROW_H = "h-[6.65rem] min-h-[6.65rem]";
const heroArtFadeToRight =
  "[mask-image:linear-gradient(to_right,black_0%,black_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_82%,transparent_100%)]";
const heroArtFadeToLeft =
  "[mask-image:linear-gradient(to_left,black_0%,black_82%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_left,black_0%,black_82%,transparent_100%)]";
const heroArtFadeDeck =
  "[mask-image:linear-gradient(to_right,black_0%,black_70%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_right,black_0%,black_70%,transparent_100%)]";

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
 * @param {string | null | undefined} heroName
 * @param {HeroOption[]} heroes
 */
function heroArtForName(heroName, heroes) {
  const full = normalizeHeroKey(heroName);
  if (!full || heroes.length === 0) return null;
  const base = heroBaseKey(heroName);
  let best = null;
  for (const h of heroes) {
    const hFull = normalizeHeroKey(h.name);
    const hBase = heroBaseKey(h.name);
    if (hFull === full || hBase === base) {
      if (h.art_image_url) return h.art_image_url;
      best = best ?? h.art_image_url ?? null;
    }
  }
  return best;
}

/** @param {string | null | undefined} player @param {string} query */
function playerMatchesNameFilter(player, query) {
  const q = normalizeHeroKey(query);
  if (!q) return true;
  return normalizeHeroKey(player).includes(q);
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
  const winnerName = row.winner_name;
  let flippedWinnerName = winnerName;
  if (winnerName) {
    const w = normalizeHeroKey(winnerName);
    const p1 = normalizeHeroKey(row.player1);
    const p2 = normalizeHeroKey(row.player2);
    if (w === p2) flippedWinnerName = row.player1;
    else if (w === p1) flippedWinnerName = row.player2;
  }
  return {
    ...row,
    player1: row.player2,
    player2: row.player1,
    hero1: row.hero2,
    hero2: row.hero1,
    winner_side: flipWinnerSide(row.winner_side),
    winner_name: flippedWinnerName,
  };
}

const matchRowGridCols =
  "grid-cols-[minmax(0,1fr)_minmax(3.25rem,4.5rem)_minmax(0,1fr)]";

const nameShadow = "drop-shadow-[0_1px_4px_rgba(0,0,0,0.92)]";

/**
 * @param {object} row
 * @returns {1 | 2 | null}
 */
function matchRowWinnerSide(row) {
  if (row.winner_name) {
    const w = normalizeHeroKey(row.winner_name);
    const p1 = normalizeHeroKey(row.player1);
    const p2 = normalizeHeroKey(row.player2);
    if (w && p1 && w === p1) return 1;
    if (w && p2 && w === p2) return 2;
  }
  const side = String(row.winner_side || "").toLowerCase();
  if (side.includes("player 1")) return 1;
  if (side.includes("player 2")) return 2;
  return null;
}

/**
 * @param {{ side: "left" | "right", src?: string | null, name?: string | null }} props
 */
function MatchRowHeroArt({ side, src, name }) {
  const label = name != null && String(name).trim() !== "" ? String(name).trim() : "Hero";
  const isLeft = side === "left";
  const objectCls = isLeft ? "object-left object-top" : "object-right object-top";
  const fadeCls = isLeft ? heroArtFadeToRight : heroArtFadeToLeft;
  const placeholderGradient = isLeft
    ? "bg-gradient-to-r from-purple-900/35 via-purple-800/15 to-transparent"
    : "bg-gradient-to-l from-purple-900/35 via-purple-800/15 to-transparent";

  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      {src ? (
        <img src={src} alt="" className={`h-full w-full object-cover ${objectCls} ${fadeCls}`} draggable={false} />
      ) : (
        <div className={`h-full w-full ${placeholderGradient} ${fadeCls}`} title={label} />
      )}
    </div>
  );
}

/**
 * @param {{
 *   side: "left" | "right",
 *   player: string,
 *   hero?: string | null,
 *   heroArt?: string | null,
 *   isWinner?: boolean,
 * }} props
 */
function MatchRowPlayerColumn({ side, player, hero, heroArt, isWinner = false }) {
  const isLeft = side === "left";
  const alignCls = isLeft ? "items-end text-right pr-2 sm:pr-3" : "items-start text-left pl-2 sm:pl-3";
  const posCls = isLeft ? "right-0" : "left-0";
  const winnerCls = isWinner
    ? "z-[2] shadow-[inset_0_0_28px_rgba(251,191,36,0.18)] ring-2 ring-inset ring-amber-400/80 bg-amber-500/[0.07]"
    : "";

  return (
    <div
      className={`relative min-w-0 ${MATCH_ROW_H} ${winnerCls}`}
      aria-label={isWinner ? `Winner: ${player}` : undefined}
    >
      <MatchRowHeroArt side={side} src={heroArt} name={hero} />
      <div
        className={`absolute inset-y-0 ${posCls} z-[1] flex w-[min(100%,13.5rem)] flex-col justify-center gap-0.5 ${alignCls}`}
      >
        <p
          className={`m-0 max-w-full truncate text-[0.85rem] font-semibold leading-tight ${nameShadow} ${
            isWinner ? "text-amber-50" : "text-[#f4f0fa]"
          }`}
        >
          {player}
        </p>
        {hero ? (
          <p
            className={`m-0 max-w-full truncate text-[0.72rem] leading-tight ${nameShadow} ${
              isWinner ? "text-amber-100/85" : "text-[#f4f0fa]/68"
            }`}
          >
            {hero}
          </p>
        ) : null}
      </div>
      {isWinner ? (
        <span
          className={`pointer-events-none absolute top-2 z-[3] rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide text-amber-950 ${isLeft ? "right-2" : "left-2"}`}
          aria-hidden
        >
          Win
        </span>
      ) : null}
    </div>
  );
}

/**
 * @param {{ isLight: boolean, rowChrome: string, heroes: HeroOption[], row: object }} props
 */
function PairingMatchRow({ isLight, rowChrome, heroes, row }) {
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;

  return (
    <div
      className={`grid w-full ${matchRowGridCols} items-stretch overflow-hidden rounded-xl border ${MATCH_ROW_H} ${border}`}
    >
      <MatchRowPlayerColumn
        side="left"
        player={row.player1}
        hero={row.hero1}
        heroArt={heroArtForName(row.hero1, heroes)}
      />
      <div
        className={`relative z-[1] flex ${MATCH_ROW_H} flex-col items-center justify-center gap-0.5 border-x border-white/[0.06] px-1 text-center`}
      >
        <p className="m-0 text-[0.65rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/40">vs</p>
        <p className="m-0 text-[0.7rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/45">
          T{row.table}
        </p>
      </div>
      <MatchRowPlayerColumn
        side="right"
        player={row.player2}
        hero={row.hero2}
        heroArt={heroArtForName(row.hero2, heroes)}
      />
    </div>
  );
}

/**
 * @param {{ isLight: boolean, rowChrome: string, heroes: HeroOption[], row: object }} props
 */
function ResultMatchRow({ isLight, rowChrome, heroes, row }) {
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;
  const winner = matchRowWinnerSide(row);

  return (
    <div
      className={`grid w-full ${matchRowGridCols} items-stretch overflow-hidden rounded-xl border ${MATCH_ROW_H} ${border}`}
    >
      <MatchRowPlayerColumn
        side="left"
        player={row.player1}
        hero={row.hero1}
        heroArt={heroArtForName(row.hero1, heroes)}
        isWinner={winner === 1}
      />
      <div className={`relative z-[1] ${MATCH_ROW_H} border-x border-white/[0.06]`} aria-hidden />
      <MatchRowPlayerColumn
        side="right"
        player={row.player2}
        hero={row.hero2}
        heroArt={heroArtForName(row.hero2, heroes)}
        isWinner={winner === 2}
      />
    </div>
  );
}

/**
 * @param {{ isLight: boolean, rowChrome: string, heroes: HeroOption[], row: object }} props
 */
function StandingMatchRow({ isLight, rowChrome, heroes, row }) {
  const heroArt = heroArtForName(row.hero, heroes);
  const border = isLight ? "border-white/[0.12] bg-black/25" : rowChrome;

  return (
    <div
      className={`relative grid min-h-[6.75rem] w-full grid-cols-1 overflow-hidden rounded-xl border text-right ${border}`}
    >
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[58%] sm:w-[54%]" aria-hidden>
        {heroArt ? (
          <img
            src={heroArt}
            alt=""
            className={`h-full w-full object-cover object-left object-top ${heroArtFadeDeck}`}
            draggable={false}
          />
        ) : (
          <div className={`h-full w-full bg-gradient-to-r from-purple-900/35 via-purple-800/15 to-transparent ${heroArtFadeDeck}`} />
        )}
      </div>
      <div className="relative z-[1] col-start-1 row-start-1 flex min-h-[6.75rem] flex-col items-end justify-center gap-0.5 self-stretch py-3.5 pl-[52%] pr-4 sm:pl-[48%]">
        <p className="m-0 text-[0.7rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/45">Rank {row.rank}</p>
        <p className="m-0 max-w-full truncate text-[0.95rem] font-semibold text-[#f4f0fa]">{row.player}</p>
        <p className="m-0 max-w-full truncate text-[0.8125rem] text-[#f4f0fa]/72">{row.hero || "—"}</p>
        <p className="m-0 max-w-full truncate text-[0.75rem] text-[#f4f0fa]/55">{row.wins} wins</p>
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
  const { user } = useAuth();
  const [event, setEvent] = useState(/** @type {object | null} */ (null));
  const [eventData, setEventData] = useState(/** @type {object[]} */ ([]));
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(/** @type {string | null} */ (null));

  const [mainTab, setMainTab] = useState(/** @type {MainTab} */ ("team"));
  const [coverageTab, setCoverageTab] = useState(/** @type {CoverageTab} */ ("pairings"));
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

  const activeData = eventData[dataIdx] ?? null;
  const showCoverage = mainTab === "team" || mainTab === "overall";

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
        onClick={() => setMainTab(id)}
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
        setCoverageTab("pairings");

        if (metaRes.ok) {
          const meta = await metaRes.json();
          const heroList = Array.isArray(meta.heroes) ? meta.heroes : [];
          setHeroes(
            heroList
              .filter((h) => h && typeof h.id === "number")
              .map((h) => ({
                id: h.id,
                name: String(h.name ?? "").trim() || `Hero ${h.id}`,
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
        setRound(max);
      }
    } catch {
      setRounds([]);
    } finally {
      setRoundsLoading(false);
    }
  }, [user, activeData, eventId]);

  useEffect(() => {
    if (!active || !activeData || !showCoverage) return;
    void loadRounds();
  }, [active, activeData, showCoverage, loadRounds]);

  const fetchCoverageTab = useCallback(
    async (kind) => {
      if (!user || !activeData || !round) return;
      const setLoading =
        kind === "pairings" ? setPairingsLoading : kind === "results" ? setResultsLoading : setStandingsLoading;
      const setData = kind === "pairings" ? setPairings : kind === "results" ? setResults : setStandings;
      setLoading(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({
          event_data_id: String(activeData.id),
          round: String(round),
        });
        const res = await fetch(`/api/events/${eventId}/${kind}?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
        const data = await res.json();
        const raw = data[kind];
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
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    },
    [user, activeData, round, eventId],
  );

  useEffect(() => {
    if (!active || !showCoverage || !activeData || roundsLoading) return;
    void fetchCoverageTab(coverageTab);
  }, [active, showCoverage, coverageTab, activeData, round, roundsLoading, fetchCoverageTab]);

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
    setCoverageTab("pairings");
    setNameFilter("");
  }, [dataIdx]);

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
      out.push({ first_name: m.first_name, last_name: m.last_name });
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
    let rows = results;
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

  const nameFilterActive = nameFilter.trim().length > 0;

  const coverageLoading =
    coverageTab === "pairings" ? pairingsLoading : coverageTab === "results" ? resultsLoading : standingsLoading;

  const rowChrome = isLight
    ? "border-white/[0.12] bg-black/25"
    : "border-white/[0.20] bg-black/20 ring-1 ring-white/[0.05]";

  const segmentTabBtn = (idx, label) => {
    const on = dataIdx === idx;
    return (
      <button
        type="button"
        key={idx}
        className={`rounded-md px-3.5 py-1.5 text-[0.8125rem] font-semibold transition ${
          on
            ? "bg-amber-500/20 text-amber-100 shadow-sm"
            : "text-[#f4f0fa]/60 hover:bg-white/[0.05] hover:text-[#f4f0fa]/90"
        }`}
        onClick={() => setDataIdx(idx)}
      >
        {label}
      </button>
    );
  };

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
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[0.875rem]">
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

      {eventData.length > 0 ? (
        <div
          className="inline-flex max-w-full flex-wrap gap-0.5 rounded-lg border border-white/[0.1] bg-black/20 p-1"
          role="tablist"
          aria-label="Event segment"
        >
          {eventData.map((d, idx) => segmentTabBtn(idx, segmentLabel(d)))}
        </div>
      ) : null}

      <nav className="flex gap-6 border-b border-white/[0.1]" aria-label="Event view">
        {mainTabBtn("team", "Team")}
        {mainTabBtn("overall", "Overall")}
        {mainTabBtn("streams", "Streams")}
      </nav>

      {showCoverage && activeData ? (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="inline-flex flex-wrap gap-0.5 rounded-lg bg-black/15 p-0.5" role="tablist">
              {coverageTabBtn("pairings", "Pairings")}
              {coverageTabBtn("results", "Results")}
              {coverageTabBtn("standings", "Standings")}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {roundsLoading ? (
                <span className="text-[0.8rem] text-[#f4f0fa]/55">Loading rounds…</span>
              ) : (
                <label className="flex items-center gap-2 text-[0.8125rem] text-[#f4f0fa]/70">
                  Round
                  <select
                    className="rounded-md border border-white/15 bg-black/25 px-2 py-1.5 text-[0.8125rem] text-[#f4f0fa]"
                    value={round}
                    onChange={(e) => setRound(Number(e.target.value))}
                  >
                    {rounds.map((r) => (
                      <option key={r.id ?? r.round_number} value={r.round_number}>
                        {r.round_label || `Round ${r.round_number}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <input
                type="search"
                value={nameFilter}
                onChange={(e) => setNameFilter(e.target.value)}
                placeholder="Search players…"
                aria-label="Search players"
                className="w-full min-w-[10rem] max-w-xs rounded-md border border-white/15 bg-black/25 px-3 py-1.5 text-[0.8125rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/45 sm:w-48"
              />
            </div>
          </div>

          {mainTab === "team" && !teamLoading && teamMembers.length === 0 ? (
            <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
              No Righteous players matched in {segmentLabel(activeData)} yet.
            </p>
          ) : null}

          {roundsLoading || coverageLoading ? <TabSpinner /> : null}

          {!roundsLoading && !coverageLoading && coverageTab === "pairings" ? (
            <div className="flex flex-col gap-2.5">
              {filteredPairings.map((row, idx) => (
                <PairingMatchRow key={idx} isLight={isLight} rowChrome={rowChrome} heroes={heroes} row={row} />
              ))}
              {filteredPairings.length === 0 ? (
                <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
                  {nameFilterActive ? "No pairings match that name." : "No pairings for this round."}
                </p>
              ) : null}
            </div>
          ) : null}

          {!roundsLoading && !coverageLoading && coverageTab === "results" ? (
            <div className="flex flex-col gap-2.5">
              {filteredResults.map((row, idx) => (
                <ResultMatchRow key={idx} isLight={isLight} rowChrome={rowChrome} heroes={heroes} row={row} />
              ))}
              {filteredResults.length === 0 ? (
                <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
                  {nameFilterActive ? "No results match that name." : "No results for this round."}
                </p>
              ) : null}
            </div>
          ) : null}

          {!roundsLoading && !coverageLoading && coverageTab === "standings" ? (
            <div className="flex flex-col gap-2.5">
              {filteredStandings.map((row, idx) => (
                <StandingMatchRow key={idx} isLight={isLight} rowChrome={rowChrome} heroes={heroes} row={row} />
              ))}
              {filteredStandings.length === 0 ? (
                <p className="m-0 text-[0.85rem] text-[#f4f0fa]/60">
                  {nameFilterActive ? "No standings match that name." : "No standings for this round."}
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      {mainTab === "streams" && activeData ? (
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
                  </p>
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
                  {streamUrlError ? <p className="m-0 text-[0.85rem] text-red-200/90">{streamUrlError}</p> : null}
                  <button
                    type="button"
                    className="self-start rounded-lg border border-white/25 bg-purple-900/40 px-3 py-2 text-[0.8125rem] font-semibold text-white disabled:opacity-45"
                    disabled={streamUrlSaving || !streamUrlDraft.trim()}
                    onClick={() => void onSaveStreamURL()}
                  >
                    {streamUrlSaving ? "Saving…" : "Save stream URL"}
                  </button>
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
          </div>
        </>
      ) : null}
    </div>
  );
}
