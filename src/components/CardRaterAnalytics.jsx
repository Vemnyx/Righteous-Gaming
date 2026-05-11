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
 * @param {{ isLight: boolean, active: boolean, raterId: string, onOpenCardDetail: (identifier: string) => void, onOpenRanker: () => void }} props
 */
export function CardRaterAnalytics({ isLight, active, raterId, onOpenCardDetail, onOpenRanker }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @type {unknown} */
  const [raw, setRaw] = useState(null);

  const [filterClass, setFilterClass] = useState("");
  const [filterTalent, setFilterTalent] = useState("");
  const [filterType, setFilterType] = useState("");

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
    const tbl = Array.isArray(o.ranked_table) ? o.ranked_table : [];
    return { rater, summary, dist, fo, top, tbl };
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

  const panel =
    isLight
      ? "rounded-xl border border-white/[0.12] bg-black/20 px-4 py-4 sm:px-5"
      : "rounded-xl border border-white/[0.14] bg-black/25 px-4 py-4 sm:px-5";

  const labelMuted = "text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/50";
  const selectCls =
    "min-h-10 w-full max-w-[14rem] rounded-lg border border-white/[0.18] bg-black/35 px-3 py-2 text-[0.8125rem] text-[#f4f0fa] outline-none focus-visible:ring-2 focus-visible:ring-purple-500/55";

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
        <button
          type="button"
          className="shrink-0 self-start rounded-lg border border-white/[0.22] bg-black/30 px-4 py-2 text-[0.8125rem] font-semibold text-[#f4f0fa] hover:bg-white/[0.06]"
          onClick={onOpenRanker}
        >
          Open ranker
        </button>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-[0.875rem] text-red-100/95"
          role="alert"
        >
          {error}
          <button
            type="button"
            className="ml-3 font-semibold underline"
            onClick={() => void load()}
          >
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
          <p className={`m-0 ${labelMuted}`}>Top cards — filters</p>
          <p className="mt-1 text-[0.8rem] text-[#f4f0fa]/60">
            Defaults to the top 10 overall by average rating. Narrow by class, talent, or card type.
          </p>
          <div className="mt-4 flex flex-wrap gap-4">
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
        </div>
      ) : null}

      {parsed?.tbl?.length ? (
        <div className={panel}>
          <p className={`m-0 ${labelMuted}`}>Ranked cards (top 50 in this view)</p>
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
    </div>
  );
}
