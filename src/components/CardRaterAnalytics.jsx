import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";
import { cardClassName } from "../constants/cardClass";
import { cardTalentName } from "../constants/cardTalent";
import { cardTypeName } from "../constants/cardType";

/** @param {unknown} v */
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * @param {{ isLight: boolean, active: boolean, raterId: string, onOpenCardDetail: (identifier: string) => void }} props
 */
export function CardRaterAnalytics({ isLight, active, raterId, onOpenCardDetail }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @type {unknown} */
  const [raw, setRaw] = useState(null);

  const [filterClass, setFilterClass] = useState("");
  const [filterTalent, setFilterTalent] = useState("");
  const [filterType, setFilterType] = useState("");

  const [resultsTab, setResultsTab] = useState(/** @type {'top_rated' | 'controversial' | 'talked'} */ ("top_rated"));

  const [notesModal, setNotesModal] = useState({
    open: false,
    cardId: 0,
    cardName: "",
    loading: false,
    error: null,
    rows: [],
  });

  const idNum = useMemo(() => {
    const n = Number.parseInt(String(raterId), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [raterId]);

  const load = useCallback(async () => {
    if (!user || idNum <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams();
      const c = numOrNull(filterClass);
      const t = numOrNull(filterTalent);
      const ty = numOrNull(filterType);
      if (c != null) qs.set("class", String(c));
      if (t != null) qs.set("talent", String(t));
      if (ty != null) qs.set("type", String(ty));
      qs.set("top_limit", "10");
      qs.set("table_limit", "50");
      const q = qs.toString();
      const res = await fetch(`/api/card-raters/${idNum}/analytics${q ? `?${q}` : ""}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRaw(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load analytics");
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, [user, idNum, filterClass, filterTalent, filterType]);

  useEffect(() => {
    if (!active || !user || idNum <= 0) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, idNum, load]);

  const parsed = useMemo(() => {
    if (!raw || typeof raw !== "object") return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const rater = o.rater && typeof o.rater === "object" ? /** @type {Record<string, unknown>} */ (o.rater) : null;
    const summary = o.summary && typeof o.summary === "object" ? /** @type {Record<string, unknown>} */ (o.summary) : null;
    const dist = Array.isArray(o.rating_distribution) ? o.rating_distribution : [];
    const fo = o.filter_options && typeof o.filter_options === "object" ? /** @type {Record<string, unknown>} */ (o.filter_options) : null;
    const top = Array.isArray(o.top_cards) ? o.top_cards : [];
    const ratedTbl = Array.isArray(o.rated_table) ? o.rated_table : [];
    const legacyTbl = Array.isArray(o.ranked_table) ? o.ranked_table : [];
    const tbl = ratedTbl.length ? ratedTbl : legacyTbl;
    const controversial = Array.isArray(o.most_controversial) ? o.most_controversial : [];
    const talked = Array.isArray(o.most_talked_about_cards) ? o.most_talked_about_cards : [];
    return { rater, summary, dist, fo, top, tbl, controversial, talked };
  }, [raw]);

  const distMap = useMemo(() => {
    /** @type {Record<number, number>} */
    const m = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (!parsed) return m;
    for (const row of parsed.dist) {
      if (!row || typeof row !== "object") continue;
      const r = /** @type {Record<string, unknown>} */ (row);
      const rating = typeof r.rating === "number" ? r.rating : Number(r.rating);
      const count = typeof r.count === "number" ? r.count : Number(r.count);
      if (Number.isFinite(rating) && Number.isFinite(count) && rating >= 1 && rating <= 5) {
        m[rating] = count;
      }
    }
    return m;
  }, [parsed]);

  const distMax = useMemo(() => Math.max(1, ...Object.values(distMap)), [distMap]);

  const openRatingNotes = useCallback(
    async (cardId, cardName) => {
      if (!user || idNum <= 0 || !Number.isFinite(cardId)) return;
      setNotesModal({
        open: true,
        cardId,
        cardName,
        loading: true,
        error: null,
        rows: [],
      });
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/card-raters/${idNum}/cards/${cardId}/rating-notes`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "Failed to load notes");
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error("Invalid response");
        }
        const notes = body && typeof body === "object" && Array.isArray(body.notes) ? body.notes : [];
        const rows = notes
          .filter((n) => n && typeof n === "object")
          .map((n) => {
            const r = /** @type {Record<string, unknown>} */ (n);
            return {
              user_id: typeof r.user_id === "number" ? r.user_id : Number(r.user_id),
              user_label: r.user_label != null ? String(r.user_label) : "",
              rating: typeof r.rating === "number" ? r.rating : Number(r.rating),
              notes: r.notes != null ? String(r.notes) : "",
            };
          });
        setNotesModal((prev) => ({ ...prev, loading: false, rows, error: null }));
      } catch (e) {
        setNotesModal((prev) => ({
          ...prev,
          loading: false,
          rows: [],
          error: e instanceof Error ? e.message : "Failed to load notes",
        }));
      }
    },
    [user, idNum],
  );

  const closeNotesModal = useCallback(() => {
    setNotesModal({ open: false, cardId: 0, cardName: "", loading: false, error: null, rows: [] });
  }, []);

  const panel =
    isLight
      ? "rounded-xl border border-white/[0.12] bg-black/20 px-4 py-4 sm:px-5"
      : "rounded-xl border border-white/[0.14] bg-black/25 px-4 py-4 sm:px-5";

  const labelMuted = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";
  const selectCls =
    "min-h-10 w-full max-w-[14rem] rounded-lg border border-white/[0.18] bg-black/35 px-3 py-2 text-[0.8125rem] text-[#f4f0fa] outline-none focus-visible:ring-2 focus-visible:ring-purple-500/55";

  const tabBtn = (tab) =>
    resultsTab === tab
      ? "border-violet-400/60 bg-violet-950/35 text-[#f4f0fa]"
      : "border-white/[0.14] bg-black/20 text-[#f4f0fa]/70 hover:bg-white/[0.05] hover:text-[#f4f0fa]/90";

  if (!active || idNum <= 0) {
    return null;
  }

  const fmtName = (n) => {
    if (typeof n !== "number" || !Number.isFinite(n)) return String(n);
    return cardFormatName(n) ?? String(n);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 text-left">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="m-0 text-lg font-semibold text-[#f4f0fa] sm:text-xl">Card rater results</h2>
          {parsed?.rater ? (
            <p className="mt-1.5 text-[0.85rem] leading-snug text-[#f4f0fa]/70">
              Session #{idNum}
              {typeof parsed.rater.label === "string" && String(parsed.rater.label).trim() !== ""
                ? ` — ${String(parsed.rater.label).trim()}`
                : ""}
              {" · "}
              {fmtName(/** @type {number} */ (parsed.rater.format))}
              {typeof parsed.rater.started_at === "string" ? ` · Started ${formatDateTime(parsed.rater.started_at)}` : ""}
              {parsed.rater.completed_at != null && String(parsed.rater.completed_at).trim() !== ""
                ? ` · Completed ${formatDateTime(String(parsed.rater.completed_at))}`
                : " · Active session"}
            </p>
          ) : (
            <p className="mt-1.5 text-[0.85rem] text-[#f4f0fa]/65">Session #{idNum}</p>
          )}
        </div>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-[0.875rem] text-red-100/95"
          role="alert"
        >
          {error}
          <button type="button" className="ml-3 font-semibold underline" onClick={() => void load()}>
            Retry
          </button>
        </div>
      ) : null}

      {loading && !parsed?.summary ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading analytics…</p>
      ) : null}

      {parsed?.summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Total ratings", String(parsed.summary.total_ratings ?? "—")],
            ["Raters (users)", String(parsed.summary.unique_users ?? "—")],
            ["Cards rated", String(parsed.summary.distinct_cards ?? "—")],
            ["Session average", typeof parsed.summary.average_rating === "number" ? parsed.summary.average_rating.toFixed(2) : "—"],
          ].map(([k, v]) => (
            <div key={k} className={panel}>
              <p className={`m-0 ${labelMuted}`}>{k}</p>
              <p className="m-0 mt-1 text-xl font-semibold tabular-nums text-[#f4f0fa]">{v}</p>
            </div>
          ))}
        </div>
      ) : null}

      {parsed?.summary ? (
        <div className={panel}>
          <p className={`m-0 ${labelMuted}`}>Rating distribution</p>
          <div className="mt-4 flex h-40 items-end gap-2 sm:gap-3">
            {[1, 2, 3, 4, 5].map((rating) => {
              const c = distMap[rating] ?? 0;
              const h = Math.round((c / distMax) * 100);
              return (
                <div key={rating} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                  <div className="flex h-32 w-full items-end justify-center rounded-md bg-black/30 px-1">
                    <div
                      className="w-[min(3rem,100%)] rounded-t-md bg-gradient-to-t from-[#5a2f8f] to-[#9b6fd8]"
                      style={{ height: `${Math.max(4, h)}%` }}
                      title={`${c} votes`}
                    />
                  </div>
                  <span className="text-[0.75rem] font-semibold tabular-nums text-[#f4f0fa]/75">{rating}</span>
                  <span className="text-[0.68rem] tabular-nums text-[#f4f0fa]/45">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {parsed?.fo ? (
        <div className={panel}>
          <p className={`m-0 ${labelMuted}`}>Session insights</p>
          <p className="mt-1 text-[0.8rem] text-[#f4f0fa]/60">
            Top Rated respects class, talent, and type filters. Most Controversial and Most Talked About reflect the
            whole session.
          </p>

          <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Results sections">
            {[
              ["top_rated", "Top Rated"],
              ["controversial", "Most Controversial"],
              ["talked", "Most Talked About"],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={resultsTab === id}
                className={`rounded-lg border px-3 py-2 text-[0.78rem] font-semibold transition-colors ${tabBtn(id)}`}
                onClick={() => setResultsTab(/** @type {'top_rated' | 'controversial' | 'talked'} */ (id))}
              >
                {label}
              </button>
            ))}
          </div>

          {resultsTab === "top_rated" ? (
            <>
              <div className="mt-5 flex flex-wrap gap-4">
                <label className="flex min-w-[10rem] flex-col gap-1">
                  <span className={labelMuted}>Class</span>
                  <select
                    className={selectCls}
                    value={filterClass}
                    onChange={(e) => setFilterClass(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">All classes</option>
                    {(Array.isArray(parsed.fo.classes) ? parsed.fo.classes : []).map((x) => {
                      const id = typeof x === "number" ? x : Number(x);
                      if (!Number.isFinite(id)) return null;
                      const name = cardClassName(id) ?? `Class ${id}`;
                      return (
                        <option key={id} value={String(id)}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-col gap-1">
                  <span className={labelMuted}>Talent</span>
                  <select
                    className={selectCls}
                    value={filterTalent}
                    onChange={(e) => setFilterTalent(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">All talents</option>
                    {(Array.isArray(parsed.fo.talents) ? parsed.fo.talents : []).map((x) => {
                      const id = typeof x === "number" ? x : Number(x);
                      if (!Number.isFinite(id)) return null;
                      const name = cardTalentName(id) ?? `Talent ${id}`;
                      return (
                        <option key={id} value={String(id)}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </label>
                <label className="flex min-w-[10rem] flex-col gap-1">
                  <span className={labelMuted}>Type</span>
                  <select
                    className={selectCls}
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">All types</option>
                    {(Array.isArray(parsed.fo.types) ? parsed.fo.types : []).map((x) => {
                      const id = typeof x === "number" ? x : Number(x);
                      if (!Number.isFinite(id)) return null;
                      const name = cardTypeName(id) ?? `Type ${id}`;
                      return (
                        <option key={id} value={String(id)}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
                {parsed.top.map((row, idx) => {
                  if (!row || typeof row !== "object") return null;
                  const r = /** @type {Record<string, unknown>} */ (row);
                  const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                  const img = card && card.image_url != null ? String(card.image_url) : "";
                  const name = card && card.name != null ? String(card.name) : "Card";
                  const ident = card && card.card_identifier != null ? String(card.card_identifier).trim() : "";
                  const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                  const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                  return (
                    <div
                      key={card && typeof card.id === "number" ? card.id : idx}
                      className="flex flex-col gap-1.5 rounded-lg border border-white/[0.12] bg-black/25 p-2"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[0.68rem] font-bold tabular-nums text-amber-200/90">#{idx + 1}</span>
                        <span className="text-[0.68rem] tabular-nums text-[#f4f0fa]/55">
                          {Number.isFinite(avg) ? avg.toFixed(2) : "—"} · {Number.isFinite(votes) ? votes : "—"} votes
                        </span>
                      </div>
                      <button
                        type="button"
                        className="relative block aspect-[2.5/3.5] w-full overflow-hidden rounded-md border border-white/[0.1] bg-black/40 outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:opacity-60"
                        disabled={!ident}
                        onClick={() => ident && onOpenCardDetail(ident)}
                        title={ident ? "Open card in catalog" : "No catalog id"}
                      >
                        {img ? (
                          <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-full items-center justify-center px-1 text-center text-[0.7rem] text-[#f4f0fa]/45">
                            No image
                          </span>
                        )}
                      </button>
                      <p className="m-0 line-clamp-2 text-center text-[0.72rem] font-semibold leading-tight text-[#f4f0fa]/90">
                        {name}
                      </p>
                    </div>
                  );
                })}
              </div>
              {parsed.top.length === 0 ? (
                <p className="mt-4 text-[0.85rem] text-[#f4f0fa]/60">No cards match these filters (or no ratings yet).</p>
              ) : null}

              {parsed.tbl?.length ? (
                <div className="mt-8">
                  <p className={`m-0 ${labelMuted}`}>Rated cards (top 50 in this view)</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[52rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                      <thead>
                        <tr className="border-b border-white/[0.12] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/50">
                          <th className="py-2 pr-3 font-semibold">#</th>
                          <th className="py-2 pr-3 font-semibold">Card</th>
                          <th className="py-2 pr-3 font-semibold">Set</th>
                          <th className="py-2 pr-3 font-semibold">Type</th>
                          <th className="py-2 pr-3 font-semibold">Classes</th>
                          <th className="py-2 pr-3 font-semibold">Talents</th>
                          <th className="py-2 pr-3 font-semibold">Avg</th>
                          <th className="py-2 font-semibold">Votes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.tbl.map((row, idx) => {
                          if (!row || typeof row !== "object") return null;
                          const r = /** @type {Record<string, unknown>} */ (row);
                          const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                          if (!card) return null;
                          const name = card.name != null ? String(card.name) : "—";
                          const setName = card.set_name != null ? String(card.set_name) : "—";
                          const typ = numOrNull(card.type);
                          const classes = Array.isArray(card.classes) ? card.classes : [];
                          const talents = Array.isArray(card.talents) ? card.talents : [];
                          const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                          const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                          const ident = card.card_identifier != null ? String(card.card_identifier).trim() : "";
                          return (
                            <tr key={typeof card.id === "number" ? card.id : idx} className="border-b border-white/[0.06] last:border-b-0">
                              <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/55">{idx + 1}</td>
                              <td className="py-2 pr-3">
                                {ident ? (
                                  <button
                                    type="button"
                                    className="max-w-[16rem] cursor-pointer truncate text-left font-semibold text-violet-200/95 underline-offset-2 hover:underline"
                                    onClick={() => onOpenCardDetail(ident)}
                                  >
                                    {name}
                                  </button>
                                ) : (
                                  <span className="font-semibold">{name}</span>
                                )}
                              </td>
                              <td className="py-2 pr-3 text-[#f4f0fa]/75">{setName}</td>
                              <td className="py-2 pr-3">{typ != null ? cardTypeName(typ) ?? typ : "—"}</td>
                              <td className="py-2 pr-3 text-[#f4f0fa]/75">
                                {classes
                                  .map((c) => {
                                    const id = typeof c === "number" ? c : Number(c);
                                    return Number.isFinite(id) ? cardClassName(id) ?? id : null;
                                  })
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </td>
                              <td className="py-2 pr-3 text-[#f4f0fa]/75">
                                {talents
                                  .map((t) => {
                                    const id = typeof t === "number" ? t : Number(t);
                                    return Number.isFinite(id) ? cardTalentName(id) ?? id : null;
                                  })
                                  .filter(Boolean)
                                  .join(", ") || "—"}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">{Number.isFinite(avg) ? avg.toFixed(2) : "—"}</td>
                              <td className="py-2 tabular-nums text-[#f4f0fa]/70">{Number.isFinite(votes) ? votes : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {resultsTab === "controversial" ? (
            <div className="mt-6">
              <p className={`m-0 ${labelMuted}`}>Highest rating spread (1–2 and 4–5 both present)</p>
              {parsed.controversial.length === 0 ? (
                <p className="mt-3 text-[0.85rem] text-[#f4f0fa]/60">
                  No cards yet with both low and high ratings in this session.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[56rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                    <thead>
                      <tr className="border-b border-white/[0.12] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/50">
                        <th className="py-2 pr-3 font-semibold">#</th>
                        <th className="py-2 pr-3 font-semibold">Card</th>
                        <th className="py-2 pr-3 font-semibold">Min–max</th>
                        <th className="py-2 pr-3 font-semibold">Spread</th>
                        <th className="py-2 pr-3 font-semibold">Std dev</th>
                        <th className="py-2 pr-3 font-semibold">Avg</th>
                        <th className="py-2 pr-3 font-semibold">Votes</th>
                        <th className="py-2 pr-3 font-semibold">1–2</th>
                        <th className="py-2 font-semibold">4–5</th>
                      </tr>
                    </thead>
                    <tbody>
                      {parsed.controversial.map((row, idx) => {
                        if (!row || typeof row !== "object") return null;
                        const r = /** @type {Record<string, unknown>} */ (row);
                        const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                        if (!card) return null;
                        const name = card.name != null ? String(card.name) : "—";
                        const ident = card.card_identifier != null ? String(card.card_identifier).trim() : "";
                        const minR = typeof r.min_rating === "number" ? r.min_rating : Number(r.min_rating);
                        const maxR = typeof r.max_rating === "number" ? r.max_rating : Number(r.max_rating);
                        const spread = typeof r.spread === "number" ? r.spread : Number(r.spread);
                        const std = typeof r.stddev === "number" ? r.stddev : Number(r.stddev);
                        const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                        const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                        const low = typeof r.low_ratings === "number" ? r.low_ratings : Number(r.low_ratings);
                        const high = typeof r.high_ratings === "number" ? r.high_ratings : Number(r.high_ratings);
                        const cid = typeof card.id === "number" ? card.id : Number(card.id);
                        return (
                          <tr key={Number.isFinite(cid) ? cid : idx} className="border-b border-white/[0.06] last:border-b-0">
                            <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/55">{idx + 1}</td>
                            <td className="py-2 pr-3">
                              {ident ? (
                                <button
                                  type="button"
                                  className="max-w-[14rem] cursor-pointer truncate text-left font-semibold text-violet-200/95 underline-offset-2 hover:underline"
                                  onClick={() => onOpenCardDetail(ident)}
                                >
                                  {name}
                                </button>
                              ) : (
                                <span className="font-semibold">{name}</span>
                              )}
                            </td>
                            <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/75">
                              {Number.isFinite(minR) && Number.isFinite(maxR) ? `${minR}–${maxR}` : "—"}
                            </td>
                            <td className="py-2 pr-3 tabular-nums">{Number.isFinite(spread) ? spread : "—"}</td>
                            <td className="py-2 pr-3 tabular-nums">{Number.isFinite(std) ? std.toFixed(2) : "—"}</td>
                            <td className="py-2 pr-3 tabular-nums">{Number.isFinite(avg) ? avg.toFixed(2) : "—"}</td>
                            <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/70">{Number.isFinite(votes) ? votes : "—"}</td>
                            <td className="py-2 pr-3 tabular-nums text-rose-200/80">{Number.isFinite(low) ? low : "—"}</td>
                            <td className="py-2 tabular-nums text-emerald-200/80">{Number.isFinite(high) ? high : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : null}

          {resultsTab === "talked" ? (
            <div className="mt-6">
              <p className={`m-0 ${labelMuted}`}>Cards with the most written notes</p>
              {parsed.talked.length === 0 ? (
                <p className="mt-3 text-[0.85rem] text-[#f4f0fa]/60">No notes recorded for this session yet.</p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {parsed.talked.map((row, idx) => {
                    if (!row || typeof row !== "object") return null;
                    const r = /** @type {Record<string, unknown>} */ (row);
                    const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                    if (!card) return null;
                    const img = card.image_url != null ? String(card.image_url) : "";
                    const name = card.name != null ? String(card.name) : "Card";
                    const ident = card.card_identifier != null ? String(card.card_identifier).trim() : "";
                    const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                    const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                    const noteCount = typeof r.note_count === "number" ? r.note_count : Number(r.note_count);
                    const cid = typeof card.id === "number" ? card.id : Number(card.id);
                    return (
                      <div
                        key={Number.isFinite(cid) ? cid : idx}
                        className="flex gap-3 rounded-lg border border-white/[0.12] bg-black/25 p-3"
                      >
                        <button
                          type="button"
                          className="relative h-24 w-[4.5rem] shrink-0 overflow-hidden rounded-md border border-white/[0.1] bg-black/40 outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:opacity-60"
                          disabled={!ident}
                          onClick={() => ident && onOpenCardDetail(ident)}
                          title={ident ? "Open card in catalog" : "No catalog id"}
                        >
                          {img ? (
                            <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-full items-center justify-center px-1 text-center text-[0.65rem] text-[#f4f0fa]/45">
                              No image
                            </span>
                          )}
                        </button>
                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[0.68rem] font-bold tabular-nums text-amber-200/90">#{idx + 1}</span>
                            <span className="text-[0.68rem] tabular-nums text-[#f4f0fa]/55">
                              {Number.isFinite(noteCount) ? noteCount : "—"} notes
                            </span>
                          </div>
                          <p className="m-0 line-clamp-2 text-[0.78rem] font-semibold leading-snug text-[#f4f0fa]/92">{name}</p>
                          <p className="m-0 text-[0.7rem] text-[#f4f0fa]/55">
                            Avg {Number.isFinite(avg) ? avg.toFixed(2) : "—"} · {Number.isFinite(votes) ? votes : "—"} votes
                          </p>
                          <button
                            type="button"
                            className="mt-1 self-start rounded-md border border-violet-400/35 bg-violet-950/30 px-2.5 py-1 text-[0.72rem] font-semibold text-violet-100/95 hover:bg-violet-900/40"
                            disabled={!Number.isFinite(cid)}
                            onClick={() => Number.isFinite(cid) && void openRatingNotes(cid, name)}
                          >
                            View notes
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {notesModal.open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rating-notes-title"
        >
          <div className="max-h-[min(85vh,32rem)] w-full max-w-lg overflow-hidden rounded-xl border border-white/[0.18] bg-[#1a1424] shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.1] px-4 py-3">
              <div className="min-w-0">
                <p id="rating-notes-title" className="m-0 truncate text-[0.95rem] font-semibold text-[#f4f0fa]">
                  Notes — {notesModal.cardName}
                </p>
                <p className="m-0 mt-0.5 text-[0.72rem] text-[#f4f0fa]/50">Session #{idNum}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-white/[0.15] bg-black/30 px-2.5 py-1 text-[0.75rem] font-semibold text-[#f4f0fa]/90 hover:bg-white/[0.06]"
                onClick={closeNotesModal}
              >
                Close
              </button>
            </div>
            <div className="max-h-[min(70vh,26rem)] overflow-y-auto px-4 py-3">
              {notesModal.loading ? (
                <p className="text-[0.85rem] text-[#f4f0fa]/65">Loading notes…</p>
              ) : notesModal.error ? (
                <p className="text-[0.85rem] text-red-200/90" role="alert">
                  {notesModal.error}
                </p>
              ) : notesModal.rows.length === 0 ? (
                <p className="text-[0.85rem] text-[#f4f0fa]/60">No notes for this card.</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-3 p-0">
                  {notesModal.rows.map((n, ni) => (
                    <li key={`${n.user_id}-${ni}`} className="rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2.5">
                      <p className="m-0 text-[0.72rem] font-semibold text-[#f4f0fa]/85">
                        {n.user_label || `User ${n.user_id}`}
                        <span className="ml-2 tabular-nums font-normal text-[#f4f0fa]/50">Rated {n.rating}/5</span>
                      </p>
                      <p className="m-0 mt-1.5 whitespace-pre-wrap text-[0.8rem] leading-relaxed text-[#f4f0fa]/88">{n.notes}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
