import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "../utils/youtube";

/** @typedef {"streams" | "pairings" | "results" | "standings" | "team"} EventTab */

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

/**
 * @param {{
 *   isLight: boolean,
 *   active: boolean,
 *   eventId: string,
 *   onBack: () => void,
 * }} props
 */
export function EventDetailPage({ isLight, active, eventId, onBack }) {
  const { user } = useAuth();
  const [event, setEvent] = useState(/** @type {object | null} */ (null));
  const [eventData, setEventData] = useState(/** @type {object[]} */ ([]));
  const [metaLoading, setMetaLoading] = useState(false);
  const [metaError, setMetaError] = useState(/** @type {string | null} */ (null));

  const [mainTab, setMainTab] = useState(/** @type {EventTab} */ ("streams"));
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

  const [comments, setComments] = useState(/** @type {object[]} */ ([]));
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);

  const [streamUrlDraft, setStreamUrlDraft] = useState("");
  const [streamUrlSaving, setStreamUrlSaving] = useState(false);
  const [streamUrlError, setStreamUrlError] = useState(/** @type {string | null} */ (null));

  const activeData = eventData[dataIdx] ?? null;

  const tabBtn = (id, label) => {
    const on = mainTab === id;
    return (
      <button
        type="button"
        key={id}
        className={`rounded-lg border px-3 py-2 text-[0.8125rem] font-semibold transition ${
          on
            ? "border-purple-400/55 bg-purple-900/40 text-white"
            : "border-white/[0.14] bg-black/20 text-[#f4f0fa]/75 hover:border-white/25"
        }`}
        onClick={() => setMainTab(id)}
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
        const res = await fetch(`/api/events/${eventId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
        const data = await res.json();
        if (cancelled) return;
        setEvent(data.event ?? null);
        setEventData(Array.isArray(data.event_data) ? data.event_data : []);
        setDataIdx(0);
        setStreamTabIdx(0);
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
    if (!active || !activeData) return;
    if (mainTab === "pairings" || mainTab === "results" || mainTab === "standings") {
      void loadRounds();
    }
  }, [active, activeData, mainTab, loadRounds]);

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
        const key = kind;
        const raw = data[key];
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
    if (!active || mainTab !== "pairings" || !activeData || roundsLoading) return;
    void fetchCoverageTab("pairings");
  }, [active, mainTab, activeData, round, roundsLoading, fetchCoverageTab]);

  useEffect(() => {
    if (!active || mainTab !== "results" || !activeData || roundsLoading) return;
    void fetchCoverageTab("results");
  }, [active, mainTab, activeData, round, roundsLoading, fetchCoverageTab]);

  useEffect(() => {
    if (!active || mainTab !== "standings" || !activeData || roundsLoading) return;
    void fetchCoverageTab("standings");
  }, [active, mainTab, activeData, round, roundsLoading, fetchCoverageTab]);

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

  const sectionCls = isLight
    ? "rounded-xl border border-white/[0.14] bg-black/25 p-4"
    : "rounded-xl border border-white/[0.12] bg-black/35 p-4";

  if (metaLoading) {
    return <TabSpinner />;
  }
  if (metaError || !event) {
    return (
      <div className="px-2 py-4">
        <button type="button" className="mb-4 text-[0.85rem] text-purple-200/90 underline" onClick={onBack}>
          ← Back to events
        </button>
        <p className="text-red-200/90">{metaError || "Event not found"}</p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <button type="button" className="self-start text-[0.85rem] text-purple-200/90 underline" onClick={onBack}>
        ← Back to events
      </button>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
        {event.image_url ? (
          <img src={event.image_url} alt="" className="w-full max-w-xs rounded-xl border border-white/10 object-cover sm:shrink-0" />
        ) : null}
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-semibold text-[#f4f0fa]">{event.title}</h2>
          {event.date_text ? <p className="m-0 mt-1 text-[0.9rem] text-[#f4f0fa]/70">{event.date_text}</p> : null}
          {event.venue ? <p className="m-0 mt-1 text-[0.85rem] text-[#f4f0fa]/55">{event.venue}</p> : null}
          <a
            href={event.event_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-[0.82rem] text-purple-200/90 underline"
          >
            FabTCG event page
          </a>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabBtn("streams", "Streams")}
        {tabBtn("pairings", "Pairings")}
        {tabBtn("results", "Results")}
        {tabBtn("standings", "Standings")}
        {tabBtn("team", "Team")}
      </div>

      {eventData.length > 1 && mainTab !== "team" ? (
        <div className="flex flex-wrap gap-2">
          {eventData.map((d, idx) => (
            <button
              key={d.id}
              type="button"
              className={`rounded-md border px-2.5 py-1.5 text-[0.78rem] font-semibold ${
                dataIdx === idx
                  ? "border-amber-300/50 bg-amber-900/30 text-amber-100"
                  : "border-white/15 bg-black/20 text-[#f4f0fa]/70"
              }`}
              onClick={() => setDataIdx(idx)}
            >
              {d.event_type_name || d.label || `Segment ${idx + 1}`}
            </button>
          ))}
        </div>
      ) : null}

      {mainTab === "streams" && activeData ? (
        <section className={sectionCls}>
          {streamTabs.length > 1 ? (
            <div className="mb-4 flex flex-wrap gap-2">
              {streamTabs.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  className={`rounded-md border px-2.5 py-1.5 text-[0.78rem] font-semibold ${
                    streamTabIdx === idx
                      ? "border-purple-400/45 bg-purple-900/35 text-purple-100"
                      : "border-white/15 bg-black/20 text-[#f4f0fa]/70"
                  }`}
                  onClick={() => setStreamTabIdx(idx)}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}

          {youtubeId ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg border border-white/10 bg-black">
              <iframe
                title="Event stream"
                className="h-full w-full"
                src={youtubeEmbedSrc(youtubeId)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-white/20 bg-black/25 px-4 py-6">
              <p className="m-0 text-[0.9rem] text-[#f4f0fa]/70">
                No stream URL for {streamTabs[streamTabIdx] ?? "this segment"} yet.
              </p>
              <label className="flex flex-col gap-1.5">
                <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">YouTube URL</span>
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

          <div className="mt-6 border-t border-white/10 pt-4">
            <h3 className="m-0 text-[0.95rem] font-semibold text-[#f4f0fa]">Stream comments</h3>
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
        </section>
      ) : null}

      {(mainTab === "pairings" || mainTab === "results" || mainTab === "standings") && activeData ? (
        <section className={sectionCls}>
          {roundsLoading ? (
            <TabSpinner />
          ) : (
            <>
              <label className="mb-4 flex flex-wrap items-center gap-2 text-[0.85rem] text-[#f4f0fa]/80">
                Round
                <select
                  className="rounded-md border border-white/20 bg-black/30 px-2 py-1 text-[#f4f0fa]"
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

              {mainTab === "pairings" && pairingsLoading ? <TabSpinner /> : null}
              {mainTab === "pairings" && !pairingsLoading ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-left text-[0.8125rem]">
                    <thead>
                      <tr className="border-b border-white/15 text-[0.68rem] uppercase text-[#f4f0fa]/55">
                        <th className="py-2 pr-3">Table</th>
                        <th className="py-2 pr-3">Player 1</th>
                        <th className="py-2 pr-3">Player 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairings.map((row, idx) => (
                        <tr key={idx} className="border-b border-white/[0.06] last:border-b-0">
                          <td className="py-2 pr-3 tabular-nums">{row.table}</td>
                          <td className="py-2 pr-3">
                            <div>{row.player1}</div>
                            <div className="text-[0.75rem] text-[#f4f0fa]/55">{row.hero1}</div>
                          </td>
                          <td className="py-2 pr-3">
                            <div>{row.player2}</div>
                            <div className="text-[0.75rem] text-[#f4f0fa]/55">{row.hero2}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {pairings.length === 0 ? <p className="mt-3 text-[#f4f0fa]/60">No pairings synced for this round yet.</p> : null}
                </div>
              ) : null}

              {mainTab === "results" && resultsLoading ? <TabSpinner /> : null}
              {mainTab === "results" && !resultsLoading ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[32rem] border-collapse text-left text-[0.8125rem]">
                    <thead>
                      <tr className="border-b border-white/15 text-[0.68rem] uppercase text-[#f4f0fa]/55">
                        <th className="py-2 pr-3">Player 1</th>
                        <th className="py-2 pr-3">Result</th>
                        <th className="py-2 pr-3">Player 2</th>
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((row, idx) => (
                        <tr key={idx} className="border-b border-white/[0.06] last:border-b-0">
                          <td className="py-2 pr-3">
                            <div>{row.player1}</div>
                            <div className="text-[0.75rem] text-[#f4f0fa]/55">{row.hero1}</div>
                          </td>
                          <td className="py-2 pr-3 text-amber-200/90">{row.winner_side || "—"}</td>
                          <td className="py-2 pr-3">
                            <div>{row.player2}</div>
                            <div className="text-[0.75rem] text-[#f4f0fa]/55">{row.hero2}</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {results.length === 0 ? <p className="mt-3 text-[#f4f0fa]/60">No results synced for this round yet.</p> : null}
                </div>
              ) : null}

              {mainTab === "standings" && standingsLoading ? <TabSpinner /> : null}
              {mainTab === "standings" && !standingsLoading ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[28rem] border-collapse text-left text-[0.8125rem]">
                    <thead>
                      <tr className="border-b border-white/15 text-[0.68rem] uppercase text-[#f4f0fa]/55">
                        <th className="py-2 pr-3">Rank</th>
                        <th className="py-2 pr-3">Player</th>
                        <th className="py-2 pr-3">Hero</th>
                        <th className="py-2 pr-3">Wins</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, idx) => (
                        <tr key={idx} className="border-b border-white/[0.06] last:border-b-0">
                          <td className="py-2 pr-3 tabular-nums">{row.rank}</td>
                          <td className="py-2 pr-3">{row.player}</td>
                          <td className="py-2 pr-3">{row.hero}</td>
                          <td className="py-2 pr-3 tabular-nums">{row.wins}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {standings.length === 0 ? <p className="mt-3 text-[#f4f0fa]/60">No standings synced for this round yet.</p> : null}
                </div>
              ) : null}
            </>
          )}
        </section>
      ) : null}

      {mainTab === "team" ? (
        <section className={sectionCls}>
          <p className="m-0 text-[0.85rem] text-[#f4f0fa]/65">
            Matches for users with first and last name set (from latest synced round per segment).
          </p>
          {teamLoading ? <TabSpinner /> : null}
          {!teamLoading && teamMatches.length === 0 ? (
            <p className="mt-3 text-[#f4f0fa]/60">No team matches found.</p>
          ) : null}
          {!teamLoading && teamMatches.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {teamMatches.map((m, idx) => (
                <li key={idx} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[0.85rem]">
                  <span className="font-semibold text-[#f4f0fa]">
                    {m.first_name} {m.last_name}
                  </span>
                  <span className="text-[#f4f0fa]/55">
                    {" "}
                    · {m.event_type_name}
                    {m.stream_label ? ` (${m.stream_label})` : ""} · Round {m.round} · {m.kind}
                  </span>
                  <div className="mt-0.5 text-[#f4f0fa]/75">{m.detail}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
