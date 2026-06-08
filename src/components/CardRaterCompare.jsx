import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";
import { cardImageUrl } from "../utils/cardPrintings";

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** @param {unknown} v */
function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {unknown} row */
function parseStats(row) {
  if (!row || typeof row !== "object") return null;
  const r = /** @type {Record<string, unknown>} */ (row);
  const avg = numOrNull(r.avg_rating);
  const votes = numOrNull(r.vote_count);
  const rank = numOrNull(r.rank);
  if (avg == null && votes == null && rank == null) return null;
  return {
    avg_rating: avg,
    vote_count: votes ?? 0,
    rank: rank,
  };
}

/** @param {number | null | undefined} delta */
function formatDelta(delta, digits = 2) {
  if (delta == null || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(digits)}`;
}

/** @param {number | null | undefined} delta */
function formatRankDelta(delta) {
  if (delta == null || !Number.isFinite(delta) || delta === 0) return "—";
  if (delta < 0) return `↑${Math.abs(delta)}`;
  return `↓${delta}`;
}

/** @param {Record<string, unknown> | null} rater @param {string} fallback */
function raterTitle(rater, fallback) {
  if (!rater) return fallback;
  const label = typeof rater.label === "string" && rater.label.trim() !== "" ? rater.label.trim() : null;
  if (label) return label;
  const format = numOrNull(rater.format);
  if (format != null) return cardFormatName(format) ?? fallback;
  return fallback;
}

/** @param {Record<string, unknown> | null} rater */
function raterDetails(rater) {
  if (!rater) return "—";
  const parts = [];
  const hasLabel = typeof rater.label === "string" && rater.label.trim() !== "";
  const format = numOrNull(rater.format);
  if (hasLabel && format != null) parts.push(cardFormatName(format) ?? String(format));
  if (typeof rater.started_at === "string") parts.push(`Started ${formatDateTime(rater.started_at)}`);
  if (rater.completed_at != null && String(rater.completed_at).trim() !== "") {
    parts.push(`Completed ${formatDateTime(String(rater.completed_at))}`);
  } else {
    parts.push("Active session");
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * @param {{
 *   isLight: boolean,
 *   active: boolean,
 *   raterId: string,
 *   baselineRaterId: string,
 *   onBack: () => void,
 * }} props
 */
export function CardRaterCompare({ isLight, active, raterId, baselineRaterId, onBack }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @type {unknown} */
  const [raw, setRaw] = useState(null);
  const [filter, setFilter] = useState(/** @type {"all" | "gains" | "drops"} */ ("all"));
  const [rowPreview, setRowPreview] = useState(
    /** @type {{ src: string, x: number, y: number } | null} */ (null),
  );

  const currentId = useMemo(() => {
    const n = Number.parseInt(String(raterId), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [raterId]);

  const baselineId = useMemo(() => {
    const n = Number.parseInt(String(baselineRaterId), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [baselineRaterId]);

  const load = useCallback(async () => {
    if (!user || currentId <= 0 || baselineId <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const qs = new URLSearchParams({ baseline_id: String(baselineId) });
      const res = await fetch(`/api/card-raters/${currentId}/compare?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setRaw(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comparison");
      setRaw(null);
    } finally {
      setLoading(false);
    }
  }, [user, currentId, baselineId]);

  useEffect(() => {
    if (!active || currentId <= 0 || baselineId <= 0) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, currentId, baselineId, load]);

  const parsed = useMemo(() => {
    if (!raw || typeof raw !== "object") return null;
    const o = /** @type {Record<string, unknown>} */ (raw);
    const baseline = o.baseline && typeof o.baseline === "object" ? /** @type {Record<string, unknown>} */ (o.baseline) : null;
    const current = o.current && typeof o.current === "object" ? /** @type {Record<string, unknown>} */ (o.current) : null;
    const baselineSummary =
      o.baseline_summary && typeof o.baseline_summary === "object"
        ? /** @type {Record<string, unknown>} */ (o.baseline_summary)
        : null;
    const currentSummary =
      o.current_summary && typeof o.current_summary === "object"
        ? /** @type {Record<string, unknown>} */ (o.current_summary)
        : null;
    const cards = Array.isArray(o.cards) ? o.cards : [];
    return { baseline, current, baselineSummary, currentSummary, cards };
  }, [raw]);

  const filteredCards = useMemo(() => {
    if (!parsed) return [];
    const rows = parsed.cards.filter((row) => {
      if (!row || typeof row !== "object") return false;
      const r = /** @type {Record<string, unknown>} */ (row);
      const delta = numOrNull(r.avg_rating_delta);
      switch (filter) {
        case "gains":
          return delta != null && delta > 0.001;
        case "drops":
          return delta != null && delta < -0.001;
        default:
          return true;
      }
    });
    if (filter === "drops") {
      return [...rows].sort((a, b) => {
        const ra = /** @type {Record<string, unknown>} */ (a);
        const rb = /** @type {Record<string, unknown>} */ (b);
        const da = numOrNull(ra.avg_rating_delta) ?? 0;
        const db = numOrNull(rb.avg_rating_delta) ?? 0;
        return da - db;
      });
    }
    return rows;
  }, [parsed, filter]);

  const panel =
    isLight
      ? "rounded-xl border border-white/[0.12] bg-black/20 px-4 py-4 sm:px-5"
      : "rounded-xl border border-white/[0.14] bg-black/25 px-4 py-4 sm:px-5";

  const labelMuted = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";
  const filterBtn = (id) =>
    filter === id
      ? "border-violet-400/60 bg-violet-950/35 text-[#f4f0fa]"
      : "border-white/[0.14] bg-black/20 text-[#f4f0fa]/70 hover:bg-white/[0.05] hover:text-[#f4f0fa]/90";

  if (!active || currentId <= 0 || baselineId <= 0) {
    return null;
  }

  const baselineTitle = raterTitle(parsed?.baseline ?? null, "Baseline");
  const currentTitle = raterTitle(parsed?.current ?? null, "Current");

  /** @param {Record<string, unknown> | null} summary @param {string} key */
  function summaryValue(summary, key) {
    if (!summary) return null;
    return numOrNull(summary[key]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 text-left">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <button
            type="button"
            className="mb-2 text-[0.8125rem] font-semibold text-violet-300/90 underline-offset-2 hover:underline"
            onClick={onBack}
          >
            ← Back to results
          </button>
          <h2 className="m-0 text-lg font-semibold text-[#f4f0fa] sm:text-xl">Session comparison</h2>
          {parsed ? (
            <p className="mt-1.5 text-[0.85rem] leading-snug text-[#f4f0fa]/70">
              {baselineTitle} → {currentTitle}
            </p>
          ) : null}
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

      {loading && !parsed ? <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading comparison…</p> : null}

      {parsed ? (
        <>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className={panel}>
              <p className={`m-0 ${labelMuted}`}>Baseline</p>
              <p className="m-0 mt-1 text-[0.9rem] font-semibold text-[#f4f0fa]">{baselineTitle}</p>
              <p className="m-0 mt-1 text-[0.8125rem] leading-snug text-[#f4f0fa]/70">
                {raterDetails(parsed.baseline)}
              </p>
            </div>
            <div className={panel}>
              <p className={`m-0 ${labelMuted}`}>Current</p>
              <p className="m-0 mt-1 text-[0.9rem] font-semibold text-[#f4f0fa]">{currentTitle}</p>
              <p className="m-0 mt-1 text-[0.8125rem] leading-snug text-[#f4f0fa]/70">
                {raterDetails(parsed.current)}
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Raters (users)", "unique_users", 0],
              ["Cards rated", "distinct_cards", 0],
              ["Session average", "average_rating", 2],
            ].map(([label, key, digits]) => {
              const base = summaryValue(parsed.baselineSummary, key);
              const cur = summaryValue(parsed.currentSummary, key);
              const delta = base != null && cur != null ? cur - base : null;
              return (
                <div key={key} className={panel}>
                  <p className={`m-0 ${labelMuted}`}>{label}</p>
                  <p className="m-0 mt-1 text-xl font-semibold tabular-nums text-[#f4f0fa]">
                    {cur != null ? (digits === 2 ? cur.toFixed(2) : String(cur)) : "—"}
                  </p>
                  <p className="m-0 mt-1 text-[0.75rem] tabular-nums text-[#f4f0fa]/55">
                    Baseline: {base != null ? (digits === 2 ? base.toFixed(2) : String(base)) : "—"}
                    {delta != null ? (
                      <span
                        className={
                          delta > 0
                            ? " ml-2 text-emerald-300/90"
                            : delta < 0
                              ? " ml-2 text-rose-300/90"
                              : " ml-2"
                        }
                      >
                        ({formatDelta(delta, digits)})
                      </span>
                    ) : null}
                  </p>
                </div>
              );
            })}
          </div>

          <div className={panel}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className={`m-0 ${labelMuted}`}>Card changes</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ["all", "All"],
                  ["gains", "Rating gains"],
                  ["drops", "Rating drops"],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-lg border px-2.5 py-1 text-[0.72rem] font-semibold ${filterBtn(id)}`}
                    onClick={() => setFilter(/** @type {"all" | "gains" | "drops"} */ (id))}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {filteredCards.length === 0 ? (
              <p className="mt-4 text-[0.85rem] text-[#f4f0fa]/60">No cards match this filter.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[48rem] border-collapse text-left text-[0.78rem] text-[#f4f0fa]/88">
                  <thead>
                    <tr className="border-b border-white/[0.12] text-[0.68rem] uppercase tracking-wide text-[#f4f0fa]/50">
                      <th className="py-2 pr-3 font-semibold">Card</th>
                      <th className="py-2 pr-3 font-semibold">Baseline avg</th>
                      <th className="py-2 pr-3 font-semibold">Current avg</th>
                      <th className="py-2 pr-3 font-semibold">Δ avg</th>
                      <th className="py-2 pr-3 font-semibold">Baseline rank</th>
                      <th className="py-2 pr-3 font-semibold">Current rank</th>
                      <th className="py-2 font-semibold">Δ rank</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((row, idx) => {
                      if (!row || typeof row !== "object") return null;
                      const r = /** @type {Record<string, unknown>} */ (row);
                      const card =
                        r.card && typeof r.card === "object" ? /** @type {Record<string, unknown>} */ (r.card) : null;
                      if (!card) return null;
                      const name = card.name != null ? String(card.name) : "—";
                      const baseline = parseStats(r.baseline);
                      const current = parseStats(r.current);
                      const avgDelta = numOrNull(r.avg_rating_delta);
                      const rankDelta = numOrNull(r.rank_delta);
                      const img = cardImageUrl(card);
                      return (
                        <tr
                          key={typeof card.id === "number" ? card.id : idx}
                          className="border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.04]"
                          onMouseEnter={(e) => {
                            if (!img) {
                              setRowPreview(null);
                              return;
                            }
                            setRowPreview({ src: img, x: e.clientX + 18, y: e.clientY });
                          }}
                          onMouseMove={(e) => {
                            if (!img) return;
                            setRowPreview({ src: img, x: e.clientX + 18, y: e.clientY });
                          }}
                          onMouseLeave={() => setRowPreview(null)}
                        >
                          <td className="py-2 pr-3">
                            <span className="max-w-[16rem] truncate font-semibold text-violet-200/95">{name}</span>
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {baseline?.avg_rating != null ? baseline.avg_rating.toFixed(2) : "—"}
                            {baseline?.vote_count != null ? (
                              <span className="text-[#f4f0fa]/45"> · {baseline.vote_count}</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 tabular-nums">
                            {current?.avg_rating != null ? current.avg_rating.toFixed(2) : "—"}
                            {current?.vote_count != null ? (
                              <span className="text-[#f4f0fa]/45"> · {current.vote_count}</span>
                            ) : null}
                          </td>
                          <td
                            className={`py-2 pr-3 tabular-nums ${
                              avgDelta != null && avgDelta > 0
                                ? "text-emerald-300/95"
                                : avgDelta != null && avgDelta < 0
                                  ? "text-rose-300/95"
                                  : ""
                            }`}
                          >
                            {formatDelta(avgDelta)}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/70">
                            {baseline?.rank != null ? `#${baseline.rank}` : "—"}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-[#f4f0fa]/70">
                            {current?.rank != null ? `#${current.rank}` : "—"}
                          </td>
                          <td
                            className={`py-2 tabular-nums ${
                              rankDelta != null && rankDelta < 0
                                ? "text-emerald-300/95"
                                : rankDelta != null && rankDelta > 0
                                  ? "text-rose-300/95"
                                  : "text-[#f4f0fa]/70"
                            }`}
                          >
                            {formatRankDelta(rankDelta)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {rowPreview ? (
              <div
                className="pointer-events-none fixed z-[500] -translate-y-1/2"
                style={{ left: rowPreview.x, top: rowPreview.y }}
              >
                <img
                  src={rowPreview.src}
                  alt=""
                  className="h-[14rem] w-auto max-w-[10rem] rounded-md border border-white/20 bg-[#0d0914] shadow-2xl"
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
