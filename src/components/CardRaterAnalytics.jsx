import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";
import { cardClassName } from "../constants/cardClass";
import { cardTalentName } from "../constants/cardTalent";
import { cardTypeName } from "../constants/cardType";
import { cardRarityName } from "../constants/cardRarity";
import { cardImageUrl } from "../utils/cardPrintings";

/** @param {unknown} v */
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} card */
function cardIdFromRecord(card) {
  if (!card || typeof card !== "object") return null;
  const c = /** @type {Record<string, unknown>} */ (card);
  const id = c.id;
  const n = typeof id === "number" ? id : Number(id);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const TABLE_PAGE_SIZE = 25;

/**
 * @param {unknown} pageObj
 * @param {unknown[]} [legacyRows]
 */
function parseListPage(pageObj, legacyRows = []) {
  if (pageObj && typeof pageObj === "object") {
    const p = /** @type {Record<string, unknown>} */ (pageObj);
    const rows = Array.isArray(p.rows) ? p.rows : [];
    const total = typeof p.total === "number" ? p.total : Number(p.total);
    const offset = typeof p.offset === "number" ? p.offset : Number(p.offset);
    const limit = typeof p.limit === "number" ? p.limit : Number(p.limit);
    return {
      rows,
      total: Number.isFinite(total) ? total : rows.length,
      offset: Number.isFinite(offset) ? offset : 0,
      limit: Number.isFinite(limit) ? limit : TABLE_PAGE_SIZE,
    };
  }
  const rows = Array.isArray(legacyRows) ? legacyRows : [];
  return { rows, total: rows.length, offset: 0, limit: TABLE_PAGE_SIZE };
}

/** @param {{ label: string, tip: string, className?: string }} props */
function ThWithTooltip({ label, tip, className = "py-2 pr-3 font-semibold" }) {
  return (
    <th className={className}>
      <span
        className="inline-flex cursor-help items-center gap-1 border-b border-dotted border-[#f4f0fa]/30 decoration-[#f4f0fa]/30"
        title={tip}
      >
        {label}
      </span>
    </th>
  );
}

const CONTROVERSIAL_COLUMN_TIPS = {
  variance:
    "Population variance (VAR_POP) of all star ratings for this card. Higher means more disagreement; cards are ranked by this value.",
  stddev:
    "Population standard deviation (STDDEV_POP): square root of variance. Same units as star ratings—typical distance from the average.",
  minMax: "Lowest and highest star rating anyone gave this card in the session.",
  spread: "Range of ratings: highest star minus lowest star (max − min).",
  avg: "Mean star rating across everyone who rated this card.",
  votes: "Total number of ratings for this card (only cards with at least 2 ratings appear here).",
  low: "Number of ratings of 1 or 2 stars.",
  high: "Number of ratings of 4 or 5 stars.",
};

/**
 * @param {{ pageIndex: number, pageSize: number, total: number, onPageChange: (nextIndex: number) => void, disabled?: boolean }} props
 */
function TablePagination({ pageIndex, pageSize, total, onPageChange, disabled }) {
  const totalPages = Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
  const safeIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const start = total === 0 ? 0 : safeIndex * pageSize + 1;
  const end = Math.min(total, (safeIndex + 1) * pageSize);

  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="m-0 text-[0.8rem] text-[#f4f0fa]/60">
        {total === 0 ? "No cards" : `Showing ${start}–${end} of ${total}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={disabled || safeIndex <= 0}
          className="rounded-lg border border-white/[0.18] bg-black/30 px-3 py-1.5 text-[0.78rem] font-semibold text-[#f4f0fa]/90 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-white/[0.06]"
          onClick={() => onPageChange(safeIndex - 1)}
        >
          Previous
        </button>
        <span className="text-[0.78rem] tabular-nums text-[#f4f0fa]/70">
          Page {safeIndex + 1} of {totalPages}
        </span>
        <button
          type="button"
          disabled={disabled || safeIndex >= totalPages - 1}
          className="rounded-lg border border-white/[0.18] bg-black/30 px-3 py-1.5 text-[0.78rem] font-semibold text-[#f4f0fa]/90 disabled:cursor-not-allowed disabled:opacity-45 hover:bg-white/[0.06]"
          onClick={() => onPageChange(safeIndex + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * @param {{ isLight: boolean, active: boolean, raterId: string, onOpenCompare?: (baselineId: number) => void }} props
 */
export function CardRaterAnalytics({ isLight, active, raterId, onOpenCompare }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @type {unknown} */
  const [raw, setRaw] = useState(null);

  const [filterClass, setFilterClass] = useState("");
  const [filterTalent, setFilterTalent] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterRarity, setFilterRarity] = useState("");

  const [resultsTab, setResultsTab] = useState(/** @type {'top_rated' | 'controversial' | 'talked'} */ ("top_rated"));
  const [tablePage, setTablePage] = useState(
    /** @type {{ top_rated: number, controversial: number, talked: number }} */ ({
      top_rated: 0,
      controversial: 0,
      talked: 0,
    }),
  );
  const [ratedRowPreview, setRatedRowPreview] = useState(
    /** @type {{ src: string, x: number, y: number } | null} */ (null),
  );

  const [cardDetailModal, setCardDetailModal] = useState({
    open: false,
    loading: false,
    error: /** @type {string | null} */ (null),
    /** @type {Record<string, unknown> | null} */
    card: null,
    avgRating: /** @type {number | null} */ (null),
    voteCount: 0,
    /** @type {{ user_id: number, user_label: string, rating: number, notes?: string | null }[]} */
    ratings: [],
  });
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareModalLoading, setCompareModalLoading] = useState(false);
  const [compareModalError, setCompareModalError] = useState(/** @type {string | null} */ (null));
  const [compareSessions, setCompareSessions] = useState(
    /** @type {{ id: number, label?: string | null, format: number, started_at: string, completed_at?: string | null }[]} */ ([]),
  );

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
      const r = numOrNull(filterRarity);
      if (c != null) qs.set("class", String(c));
      if (t != null) qs.set("talent", String(t));
      if (ty != null) qs.set("type", String(ty));
      if (r != null) qs.set("rarity", String(r));
      qs.set("top_limit", "10");
      qs.set("rated_offset", String(tablePage.top_rated * TABLE_PAGE_SIZE));
      qs.set("rated_limit", String(TABLE_PAGE_SIZE));
      qs.set("controversial_offset", String(tablePage.controversial * TABLE_PAGE_SIZE));
      qs.set("controversial_limit", String(TABLE_PAGE_SIZE));
      qs.set("talked_offset", String(tablePage.talked * TABLE_PAGE_SIZE));
      qs.set("talked_limit", String(TABLE_PAGE_SIZE));
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
  }, [user, idNum, filterClass, filterTalent, filterType, filterRarity, tablePage]);

  useEffect(() => {
    setTablePage({ top_rated: 0, controversial: 0, talked: 0 });
  }, [filterClass, filterTalent, filterType, filterRarity]);

  useEffect(() => {
    if (resultsTab !== "top_rated") setRatedRowPreview(null);
  }, [resultsTab]);

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
    const legacyTbl = Array.isArray(o.ranked_table) ? o.ranked_table : [];
    const ratedTable = parseListPage(o.rated_table, legacyTbl);
    const controversialTop = Array.isArray(o.controversial_top)
      ? o.controversial_top
      : Array.isArray(o.most_controversial)
        ? o.most_controversial
        : [];
    const controversialTable = parseListPage(o.controversial_table, controversialTop);
    const talkedTop = Array.isArray(o.talked_top)
      ? o.talked_top
      : Array.isArray(o.most_talked_about_cards)
        ? o.most_talked_about_cards
        : [];
    const talkedTable = parseListPage(o.talked_table, talkedTop);
    const userAvg = Array.isArray(o.user_avg_ratings) ? o.user_avg_ratings : [];
    return {
      rater,
      summary,
      dist,
      fo,
      top,
      ratedTable,
      controversialTop,
      controversialTable,
      talkedTop,
      talkedTable,
      userAvg,
    };
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

  const openCardSessionDetail = useCallback(
    async (cardId) => {
      if (!user || idNum <= 0 || !Number.isFinite(cardId) || cardId <= 0) return;
      setCardDetailModal({
        open: true,
        loading: true,
        error: null,
        card: null,
        avgRating: null,
        voteCount: 0,
        ratings: [],
      });
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/card-raters/${idNum}/cards/${cardId}/session-ratings`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        if (!res.ok) throw new Error(text || "Failed to load card session");
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          throw new Error("Invalid response");
        }
        if (!body || typeof body !== "object") throw new Error("Invalid response");
        const b = /** @type {Record<string, unknown>} */ (body);
        const card = b.card && typeof b.card === "object" ? /** @type {Record<string, unknown>} */ (b.card) : null;
        const voteCount = typeof b.vote_count === "number" ? b.vote_count : Number(b.vote_count);
        const avgRaw = b.avg_rating;
        const avgRating =
          avgRaw != null && (typeof avgRaw === "number" || typeof avgRaw === "string")
            ? Number(avgRaw)
            : null;
        const list = Array.isArray(b.ratings) ? b.ratings : [];
        const ratings = list
          .filter((x) => x && typeof x === "object")
          .map((x) => {
            const r = /** @type {Record<string, unknown>} */ (x);
            return {
              user_id: typeof r.user_id === "number" ? r.user_id : Number(r.user_id),
              user_label: r.user_label != null ? String(r.user_label) : "",
              rating: typeof r.rating === "number" ? r.rating : Number(r.rating),
              notes: r.notes != null && r.notes !== "" ? String(r.notes) : null,
            };
          });
        setCardDetailModal({
          open: true,
          loading: false,
          error: null,
          card,
          avgRating: Number.isFinite(avgRating) ? avgRating : null,
          voteCount: Number.isFinite(voteCount) ? voteCount : 0,
          ratings,
        });
      } catch (e) {
        setCardDetailModal((prev) => ({
          ...prev,
          loading: false,
          card: null,
          avgRating: null,
          voteCount: 0,
          ratings: [],
          error: e instanceof Error ? e.message : "Failed to load card session",
        }));
      }
    },
    [user, idNum],
  );

  const closeCardDetailModal = useCallback(() => {
    setCardDetailModal({
      open: false,
      loading: false,
      error: null,
      card: null,
      avgRating: null,
      voteCount: 0,
      ratings: [],
    });
  }, []);

  const openCompareModal = useCallback(async () => {
    if (!user || idNum <= 0 || typeof onOpenCompare !== "function") return;
    const setId = numOrNull(parsed?.rater?.set_id);
    if (setId == null) return;
    setCompareModalOpen(true);
    setCompareModalLoading(true);
    setCompareModalError(null);
    setCompareSessions([]);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/card-raters", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const list = Array.isArray(data.raters) ? data.raters : [];
      const sessions = list
        .filter((row) => row && typeof row === "object")
        .map((row) => /** @type {Record<string, unknown>} */ (row))
        .filter((row) => {
          const sid = numOrNull(row.set_id);
          const rid = numOrNull(row.id);
          const completed = row.completed_at != null && String(row.completed_at).trim() !== "";
          return sid === setId && completed && rid != null && rid !== idNum;
        })
        .map((row) => ({
          id: /** @type {number} */ (numOrNull(row.id)),
          label: row.label != null ? String(row.label) : null,
          format: /** @type {number} */ (numOrNull(row.format) ?? 0),
          started_at: String(row.started_at ?? ""),
          completed_at: row.completed_at != null ? String(row.completed_at) : null,
        }))
        .sort((a, b) => {
          const ta = a.completed_at ? new Date(a.completed_at).getTime() : 0;
          const tb = b.completed_at ? new Date(b.completed_at).getTime() : 0;
          if (tb !== ta) return tb - ta;
          return b.id - a.id;
        });
      setCompareSessions(sessions);
    } catch (e) {
      setCompareModalError(e instanceof Error ? e.message : "Failed to load sessions");
    } finally {
      setCompareModalLoading(false);
    }
  }, [user, idNum, onOpenCompare, parsed?.rater?.set_id]);

  const closeCompareModal = useCallback(() => {
    if (compareModalLoading) return;
    setCompareModalOpen(false);
    setCompareModalError(null);
    setCompareSessions([]);
  }, [compareModalLoading]);

  const selectCompareSession = useCallback(
    (baselineId) => {
      if (typeof onOpenCompare !== "function") return;
      setCompareModalOpen(false);
      setCompareModalError(null);
      setCompareSessions([]);
      onOpenCompare(baselineId);
    },
    [onOpenCompare],
  );

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
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
        {typeof onOpenCompare === "function" ? (
          <button
            type="button"
            className="shrink-0 self-start rounded-lg border border-violet-400/45 bg-violet-950/30 px-3.5 py-2 text-[0.8125rem] font-semibold text-violet-100/95 hover:bg-violet-950/45 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={loading || !parsed?.rater}
            onClick={() => void openCompareModal()}
          >
            Compare
          </button>
        ) : null}
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

      {parsed?.summary ? (
        <div className={panel}>
          <p className={`m-0 ${labelMuted}`}>Rater averages</p>
          <p className="mt-1 text-[0.8rem] text-[#f4f0fa]/60">
            Each user’s mean rating across every card they rated in this session.
          </p>
          {parsed.userAvg.length === 0 ? (
            <p className="mt-3 text-[0.85rem] text-[#f4f0fa]/60">No ratings recorded yet.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[20rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                <thead>
                  <tr className="border-b border-white/[0.12] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/50">
                    <th className="py-2 pr-3 font-semibold">User</th>
                    <th className="py-2 pr-3 font-semibold">Average</th>
                    <th className="py-2 font-semibold">Ratings given</th>
                  </tr>
                </thead>
                <tbody>
                  {parsed.userAvg.map((row, idx) => {
                    if (!row || typeof row !== "object") return null;
                    const r = /** @type {Record<string, unknown>} */ (row);
                    const uid = typeof r.user_id === "number" ? r.user_id : Number(r.user_id);
                    const label = r.user_label != null ? String(r.user_label) : "";
                    const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                    const cnt = typeof r.rating_count === "number" ? r.rating_count : Number(r.rating_count);
                    return (
                      <tr key={Number.isFinite(uid) ? uid : idx} className="border-b border-white/[0.06] last:border-b-0">
                        <td className="py-2 pr-3 font-medium text-[#f4f0fa]/90">
                          {label || (Number.isFinite(uid) ? `User ${uid}` : "—")}
                        </td>
                        <td className="py-2 pr-3 tabular-nums font-semibold text-amber-100/90">
                          {Number.isFinite(avg) ? avg.toFixed(2) : "—"}
                        </td>
                        <td className="py-2 tabular-nums text-[#f4f0fa]/70">{Number.isFinite(cnt) ? cnt : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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
                <label className="flex min-w-[10rem] flex-col gap-1">
                  <span className={labelMuted}>Rarity</span>
                  <select
                    className={selectCls}
                    value={filterRarity}
                    onChange={(e) => setFilterRarity(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">All rarities</option>
                    {(Array.isArray(parsed.fo.rarities) ? parsed.fo.rarities : []).map((x) => {
                      const id = typeof x === "number" ? x : Number(x);
                      if (!Number.isFinite(id)) return null;
                      const name = cardRarityName(id) ?? `Rarity ${id}`;
                      return (
                        <option key={id} value={String(id)}>
                          {name}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>

              <p className={`m-0 mt-6 ${labelMuted}`}>Top 10</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
                {parsed.top.map((row, idx) => {
                  if (!row || typeof row !== "object") return null;
                  const r = /** @type {Record<string, unknown>} */ (row);
                  const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                  const cid = cardIdFromRecord(card);
                  const img = cardImageUrl(card) ?? "";
                  const name = card && card.name != null ? String(card.name) : "Card";
                  const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                  const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                  return (
                    <div
                      key={cid ?? idx}
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
                        className="relative block aspect-[2.5/3.5] w-full cursor-pointer overflow-hidden rounded-md border border-white/[0.1] bg-black/40 outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={cid == null}
                        onClick={() => cid != null && void openCardSessionDetail(cid)}
                        title={cid != null ? "View ratings for this session" : "Missing card id"}
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

              <div className="mt-8">
                <p className={`m-0 ${labelMuted}`}>All rated cards</p>
                {parsed.ratedTable.total === 0 ? (
                  <p className="mt-3 text-[0.85rem] text-[#f4f0fa]/60">No cards match these filters (or no ratings yet).</p>
                ) : (
                  <>
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
                          {parsed.ratedTable.rows.map((row, idx) => {
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
                          const cid = cardIdFromRecord(card);
                          const img = cardImageUrl(card);
                          const rank = parsed.ratedTable.offset + idx + 1;
                          return (
                            <tr
                              key={typeof card.id === "number" ? card.id : idx}
                              className={`border-b border-white/[0.06] last:border-b-0 ${
                                cid != null ? "cursor-pointer hover:bg-white/[0.04]" : ""
                              }`}
                              onClick={() => cid != null && void openCardSessionDetail(cid)}
                              onMouseEnter={(e) => {
                                if (!img) {
                                  setRatedRowPreview(null);
                                  return;
                                }
                                setRatedRowPreview({ src: img, x: e.clientX + 18, y: e.clientY });
                              }}
                              onMouseMove={(e) => {
                                if (!img) return;
                                setRatedRowPreview({ src: img, x: e.clientX + 18, y: e.clientY });
                              }}
                              onMouseLeave={() => setRatedRowPreview(null)}
                              onKeyDown={(e) => {
                                if (cid != null && (e.key === "Enter" || e.key === " ")) {
                                  e.preventDefault();
                                  void openCardSessionDetail(cid);
                                }
                              }}
                              tabIndex={cid != null ? 0 : undefined}
                              role={cid != null ? "button" : undefined}
                            >
                              <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/55">{rank}</td>
                              <td className="py-2 pr-3">
                                <span className="max-w-[16rem] truncate font-semibold text-violet-200/95">{name}</span>
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
                    <TablePagination
                      pageIndex={tablePage.top_rated}
                      pageSize={TABLE_PAGE_SIZE}
                      total={parsed.ratedTable.total}
                      disabled={loading}
                      onPageChange={(next) => setTablePage((p) => ({ ...p, top_rated: next }))}
                    />
                    {ratedRowPreview ? (
                      <div
                        className="pointer-events-none fixed z-[500] -translate-y-1/2"
                        style={{ left: ratedRowPreview.x, top: ratedRowPreview.y }}
                      >
                        <img
                          src={ratedRowPreview.src}
                          alt=""
                          className="h-[14rem] w-auto max-w-[10rem] rounded-md border border-white/20 bg-[#0d0914] shadow-2xl"
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </>
          ) : null}

          {resultsTab === "controversial" ? (
            <div className="mt-6">
              <p className={`m-0 ${labelMuted}`}>
                Population variance of ratings (VAR_POP); at least two votes per card. Higher means more disagreement.
              </p>
              {parsed.controversialTable.total === 0 ? (
                <p className="mt-3 text-[0.85rem] text-[#f4f0fa]/60">
                  No cards with at least two ratings in this session yet.
                </p>
              ) : (
                <>
                  <p className={`m-0 mt-6 ${labelMuted}`}>Top 10</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
                    {parsed.controversialTop.map((row, idx) => {
                      if (!row || typeof row !== "object") return null;
                      const r = /** @type {Record<string, unknown>} */ (row);
                      const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                      const cid = cardIdFromRecord(card);
                      const img = cardImageUrl(card) ?? "";
                      const name = card && card.name != null ? String(card.name) : "Card";
                      const variance =
                        typeof r.rating_variance === "number" ? r.rating_variance : Number(r.rating_variance);
                      const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                      return (
                        <div
                          key={cid ?? idx}
                          className="flex flex-col gap-1.5 rounded-lg border border-white/[0.12] bg-black/25 p-2"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[0.68rem] font-bold tabular-nums text-amber-200/90">#{idx + 1}</span>
                            <span
                              className="cursor-help text-[0.68rem] tabular-nums text-[#f4f0fa]/55"
                              title={CONTROVERSIAL_COLUMN_TIPS.variance}
                            >
                              σ² {Number.isFinite(variance) ? variance.toFixed(3) : "—"} · {Number.isFinite(votes) ? votes : "—"}{" "}
                              votes
                            </span>
                          </div>
                          <button
                            type="button"
                            className="relative block aspect-[2.5/3.5] w-full cursor-pointer overflow-hidden rounded-md border border-white/[0.1] bg-black/40 outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={cid == null}
                            onClick={() => cid != null && void openCardSessionDetail(cid)}
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

                  <p className={`m-0 mt-8 ${labelMuted}`}>All controversial cards</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[58rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                      <thead>
                        <tr className="border-b border-white/[0.12] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/50">
                          <th className="py-2 pr-3 font-semibold">#</th>
                          <th className="py-2 pr-3 font-semibold">Card</th>
                          <ThWithTooltip label="Variance" tip={CONTROVERSIAL_COLUMN_TIPS.variance} />
                          <ThWithTooltip label="Std dev" tip={CONTROVERSIAL_COLUMN_TIPS.stddev} />
                          <ThWithTooltip label="Min–max" tip={CONTROVERSIAL_COLUMN_TIPS.minMax} />
                          <ThWithTooltip label="Spread" tip={CONTROVERSIAL_COLUMN_TIPS.spread} />
                          <ThWithTooltip label="Avg" tip={CONTROVERSIAL_COLUMN_TIPS.avg} />
                          <ThWithTooltip label="Votes" tip={CONTROVERSIAL_COLUMN_TIPS.votes} />
                          <ThWithTooltip label="1–2" tip={CONTROVERSIAL_COLUMN_TIPS.low} />
                          <ThWithTooltip label="4–5" tip={CONTROVERSIAL_COLUMN_TIPS.high} className="py-2 font-semibold" />
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.controversialTable.rows.map((row, idx) => {
                          if (!row || typeof row !== "object") return null;
                          const r = /** @type {Record<string, unknown>} */ (row);
                          const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                          if (!card) return null;
                          const name = card.name != null ? String(card.name) : "—";
                          const minR = typeof r.min_rating === "number" ? r.min_rating : Number(r.min_rating);
                          const maxR = typeof r.max_rating === "number" ? r.max_rating : Number(r.max_rating);
                          const spread = typeof r.spread === "number" ? r.spread : Number(r.spread);
                          const std = typeof r.stddev === "number" ? r.stddev : Number(r.stddev);
                          const variance =
                            typeof r.rating_variance === "number" ? r.rating_variance : Number(r.rating_variance);
                          const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                          const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                          const low = typeof r.low_ratings === "number" ? r.low_ratings : Number(r.low_ratings);
                          const high = typeof r.high_ratings === "number" ? r.high_ratings : Number(r.high_ratings);
                          const cid = cardIdFromRecord(card);
                          const rank = parsed.controversialTable.offset + idx + 1;
                          return (
                            <tr
                              key={cid ?? idx}
                              className={`border-b border-white/[0.06] last:border-b-0 ${
                                cid != null ? "cursor-pointer hover:bg-white/[0.04]" : ""
                              }`}
                              onClick={() => cid != null && void openCardSessionDetail(cid)}
                              onKeyDown={(e) => {
                                if (cid != null && (e.key === "Enter" || e.key === " ")) {
                                  e.preventDefault();
                                  void openCardSessionDetail(cid);
                                }
                              }}
                              tabIndex={cid != null ? 0 : undefined}
                              role={cid != null ? "button" : undefined}
                            >
                              <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/55">{rank}</td>
                              <td className="py-2 pr-3">
                                <span className="max-w-[14rem] truncate font-semibold text-violet-200/95">{name}</span>
                              </td>
                              <td className="py-2 pr-3 tabular-nums font-semibold text-amber-100/90">
                                {Number.isFinite(variance) ? variance.toFixed(3) : "—"}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">{Number.isFinite(std) ? std.toFixed(2) : "—"}</td>
                              <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/75">
                                {Number.isFinite(minR) && Number.isFinite(maxR) ? `${minR}–${maxR}` : "—"}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">{Number.isFinite(spread) ? spread : "—"}</td>
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
                  <TablePagination
                    pageIndex={tablePage.controversial}
                    pageSize={TABLE_PAGE_SIZE}
                    total={parsed.controversialTable.total}
                    disabled={loading}
                    onPageChange={(next) => setTablePage((p) => ({ ...p, controversial: next }))}
                  />
                </>
              )}
            </div>
          ) : null}

          {resultsTab === "talked" ? (
            <div className="mt-6">
              <p className={`m-0 ${labelMuted}`}>Cards with the most written notes</p>
              {parsed.talkedTable.total === 0 ? (
                <p className="mt-3 text-[0.85rem] text-[#f4f0fa]/60">No notes recorded for this session yet.</p>
              ) : (
                <>
                  <p className={`m-0 mt-6 ${labelMuted}`}>Top 10</p>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-5">
                    {parsed.talkedTop.map((row, idx) => {
                      if (!row || typeof row !== "object") return null;
                      const r = /** @type {Record<string, unknown>} */ (row);
                      const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                      const cid = cardIdFromRecord(card);
                      const img = cardImageUrl(card) ?? "";
                      const name = card && card.name != null ? String(card.name) : "Card";
                      const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                      const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                      const noteCount = typeof r.note_count === "number" ? r.note_count : Number(r.note_count);
                      return (
                        <div
                          key={cid ?? idx}
                          className="flex flex-col gap-1.5 rounded-lg border border-white/[0.12] bg-black/25 p-2"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[0.68rem] font-bold tabular-nums text-amber-200/90">#{idx + 1}</span>
                            <span className="text-[0.68rem] tabular-nums text-[#f4f0fa]/55">
                              {Number.isFinite(noteCount) ? noteCount : "—"} notes · {Number.isFinite(avg) ? avg.toFixed(2) : "—"}{" "}
                              avg
                            </span>
                          </div>
                          <button
                            type="button"
                            className="relative block aspect-[2.5/3.5] w-full cursor-pointer overflow-hidden rounded-md border border-white/[0.1] bg-black/40 outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={cid == null}
                            onClick={() => cid != null && void openCardSessionDetail(cid)}
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

                  <p className={`m-0 mt-8 ${labelMuted}`}>All cards with notes</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[48rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                      <thead>
                        <tr className="border-b border-white/[0.12] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/50">
                          <th className="py-2 pr-3 font-semibold">#</th>
                          <th className="py-2 pr-3 font-semibold">Card</th>
                          <th className="py-2 pr-3 font-semibold">Notes</th>
                          <th className="py-2 pr-3 font-semibold">Avg</th>
                          <th className="py-2 font-semibold">Votes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {parsed.talkedTable.rows.map((row, idx) => {
                          if (!row || typeof row !== "object") return null;
                          const r = /** @type {Record<string, unknown>} */ (row);
                          const card = r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                          if (!card) return null;
                          const name = card.name != null ? String(card.name) : "—";
                          const avg = typeof r.avg_rating === "number" ? r.avg_rating : Number(r.avg_rating);
                          const votes = typeof r.vote_count === "number" ? r.vote_count : Number(r.vote_count);
                          const noteCount = typeof r.note_count === "number" ? r.note_count : Number(r.note_count);
                          const cid = cardIdFromRecord(card);
                          const rank = parsed.talkedTable.offset + idx + 1;
                          return (
                            <tr
                              key={cid ?? idx}
                              className={`border-b border-white/[0.06] last:border-b-0 ${
                                cid != null ? "cursor-pointer hover:bg-white/[0.04]" : ""
                              }`}
                              onClick={() => cid != null && void openCardSessionDetail(cid)}
                              onKeyDown={(e) => {
                                if (cid != null && (e.key === "Enter" || e.key === " ")) {
                                  e.preventDefault();
                                  void openCardSessionDetail(cid);
                                }
                              }}
                              tabIndex={cid != null ? 0 : undefined}
                              role={cid != null ? "button" : undefined}
                            >
                              <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/55">{rank}</td>
                              <td className="py-2 pr-3">
                                <span className="max-w-[16rem] truncate font-semibold text-violet-200/95">{name}</span>
                              </td>
                              <td className="py-2 pr-3 tabular-nums font-semibold text-amber-100/90">
                                {Number.isFinite(noteCount) ? noteCount : "—"}
                              </td>
                              <td className="py-2 pr-3 tabular-nums">{Number.isFinite(avg) ? avg.toFixed(2) : "—"}</td>
                              <td className="py-2 tabular-nums text-[#f4f0fa]/70">{Number.isFinite(votes) ? votes : "—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <TablePagination
                    pageIndex={tablePage.talked}
                    pageSize={TABLE_PAGE_SIZE}
                    total={parsed.talkedTable.total}
                    disabled={loading}
                    onPageChange={(next) => setTablePage((p) => ({ ...p, talked: next }))}
                  />
                </>
              )}
            </div>
          ) : null}
        </div>
      ) : null}

      {cardDetailModal.open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-session-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeCardDetailModal();
          }}
        >
          <div className="max-h-[min(96vh,56rem)] w-full max-w-6xl overflow-hidden rounded-xl border border-white/[0.18] bg-[#1a1424] shadow-xl">
            <div className="flex items-start justify-between gap-3 border-b border-white/[0.1] px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <p id="card-session-detail-title" className="m-0 truncate text-[0.95rem] font-semibold text-[#f4f0fa]">
                  {cardDetailModal.card && cardDetailModal.card.name != null
                    ? String(cardDetailModal.card.name)
                    : "Card"}
                </p>
                <p className="m-0 mt-0.5 text-[0.72rem] text-[#f4f0fa]/50">Session #{idNum}</p>
              </div>
              <button
                type="button"
                className="shrink-0 rounded-lg border border-white/[0.15] bg-black/30 px-2.5 py-1 text-[0.75rem] font-semibold text-[#f4f0fa]/90 hover:bg-white/[0.06]"
                onClick={closeCardDetailModal}
              >
                Close
              </button>
            </div>
            <div className="max-h-[min(88vh,50rem)] overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
              {cardDetailModal.loading ? (
                <p className="text-[0.85rem] text-[#f4f0fa]/65">Loading…</p>
              ) : cardDetailModal.error ? (
                <p className="text-[0.85rem] text-red-200/90" role="alert">
                  {cardDetailModal.error}
                </p>
              ) : (
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
                  <div className="mx-auto w-full max-w-[22rem] shrink-0 sm:max-w-[26rem] md:mx-0 md:max-w-[28rem] lg:max-w-[32rem]">
                    {cardDetailModal.card && cardImageUrl(cardDetailModal.card) ? (
                      <img
                        src={cardImageUrl(cardDetailModal.card)}
                        alt=""
                        className="aspect-[2.5/3.5] w-full rounded-xl border border-white/[0.14] object-contain shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
                      />
                    ) : (
                      <div className="flex aspect-[2.5/3.5] w-full items-center justify-center rounded-xl border border-white/[0.12] bg-black/35 px-2 text-center text-[0.8rem] text-[#f4f0fa]/50">
                        No image
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`m-0 ${labelMuted}`}>Session average</p>
                    <p className="m-0 mt-1 text-lg font-semibold tabular-nums text-[#f4f0fa]">
                      {cardDetailModal.avgRating != null && Number.isFinite(cardDetailModal.avgRating)
                        ? cardDetailModal.avgRating.toFixed(2)
                        : "—"}
                      <span className="ml-2 text-[0.8rem] font-normal text-[#f4f0fa]/55">
                        ({cardDetailModal.voteCount} {cardDetailModal.voteCount === 1 ? "rating" : "ratings"})
                      </span>
                    </p>
                    <p className={`m-0 mt-5 ${labelMuted}`}>Ratings by user</p>
                    {cardDetailModal.ratings.length === 0 ? (
                      <p className="mt-2 text-[0.85rem] text-[#f4f0fa]/60">No ratings for this card in this session.</p>
                    ) : (
                      <div className="mt-2 overflow-x-auto rounded-lg border border-white/[0.1]">
                        <table className="w-full min-w-[20rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                          <thead>
                            <tr className="border-b border-white/[0.1] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/45">
                              <th className="py-2 pl-3 pr-2 font-semibold">User</th>
                              <th className="py-2 pr-2 font-semibold">Rating</th>
                              <th className="py-2 pr-3 font-semibold">Notes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {cardDetailModal.ratings.map((row, ri) => (
                              <tr key={`${row.user_id}-${ri}`} className="border-b border-white/[0.06] last:border-b-0">
                                <td className="py-2 pl-3 pr-2 font-medium text-[#f4f0fa]/90">
                                  {row.user_label || `User ${row.user_id}`}
                                </td>
                                <td className="py-2 pr-2 tabular-nums text-[#f4f0fa]/80">{row.rating}/5</td>
                                <td className="max-w-[min(36rem,58vw)] py-2 pr-3 whitespace-pre-wrap text-[0.8rem] leading-relaxed text-[#f4f0fa]/75">
                                  {row.notes != null && row.notes !== "" ? row.notes : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {compareModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !compareModalLoading) closeCompareModal();
              }}
            >
              <div
                className={`relative max-h-[min(80vh,40rem)] w-full max-w-lg overflow-hidden rounded-xl p-5 sm:p-6 ${panel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="card-rater-compare-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="card-rater-compare-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Compare to another session
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/75">
                  Choose a completed session for this set to compare against session #{idNum}.
                </p>
                {compareModalError ? (
                  <p className="mt-3 text-[0.85rem] text-red-200" role="alert">
                    {compareModalError}
                  </p>
                ) : null}
                {compareModalLoading ? (
                  <p className="mt-4 text-[0.85rem] text-[#f4f0fa]/65">Loading sessions…</p>
                ) : compareSessions.length === 0 ? (
                  <p className="mt-4 text-[0.85rem] text-[#f4f0fa]/60">
                    No other completed sessions for this set.
                  </p>
                ) : (
                  <ul className="mt-4 max-h-[min(52vh,28rem)] space-y-2 overflow-y-auto pr-1">
                    {compareSessions.map((session) => {
                      const label =
                        session.label != null && session.label.trim() !== "" ? session.label.trim() : null;
                      return (
                        <li key={session.id}>
                          <button
                            type="button"
                            className="w-full rounded-lg border border-white/[0.12] bg-black/25 px-3 py-2.5 text-left hover:bg-white/[0.05]"
                            onClick={() => selectCompareSession(session.id)}
                          >
                            <span className="block text-[0.875rem] font-semibold text-[#f4f0fa]">
                              {label ? label : `Session #${session.id}`}
                            </span>
                            <span className="mt-0.5 block text-[0.75rem] text-[#f4f0fa]/60">
                              #{session.id} · {cardFormatName(session.format) ?? session.format}
                              {session.completed_at ? ` · Completed ${formatDateTime(session.completed_at)}` : ""}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-5 flex justify-end">
                  <button
                    type="button"
                    className="rounded-lg border border-white/[0.18] bg-black/30 px-3.5 py-2 text-[0.8125rem] font-semibold text-[#f4f0fa]/85 hover:bg-white/[0.05] disabled:opacity-50"
                    disabled={compareModalLoading}
                    onClick={closeCompareModal}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
