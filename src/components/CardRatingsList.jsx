import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";

/** @typedef {{ id: number, name: string }} CatalogSetLite */

/** @typedef {{ id: number, set_id: number, format: number, label?: string | null, started_at: string, completed_at?: string | null }} CardRaterRow */

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** @param {CardRaterRow} row */
function rowIsCompleted(row) {
  return row.completed_at != null && row.completed_at !== "";
}

/**
 * @param {{ isLight: boolean, active: boolean, onViewResults: (id: number) => void }} props
 */
export function CardRatingsList({ isLight, active, onViewResults }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {CardRaterRow[]} */ ([]));
  const [sets, setSets] = useState(/** @type {CatalogSetLite[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const completedRows = useMemo(() => rows.filter(rowIsCompleted), [rows]);

  const setNameById = useMemo(() => {
    /** @type {Record<number, string>} */
    const m = {};
    for (const s of sets) {
      if (s && typeof s.id === "number") {
        m[s.id] = String(s.name ?? "").trim() || `Set ${s.id}`;
      }
    }
    return m;
  }, [sets]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [resRaters, resSets] = await Promise.all([
        fetch("/api/card-raters", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/sets"),
      ]);
      if (!resRaters.ok) throw new Error(await resRaters.text());
      const data = await resRaters.json();
      const list = Array.isArray(data.raters) ? data.raters : [];
      /** @type {CardRaterRow[]} */
      const next = [];
      for (const r of list) {
        if (!r || typeof r.id !== "number" || typeof r.set_id !== "number" || typeof r.format !== "number") continue;
        next.push({
          id: r.id,
          set_id: r.set_id,
          format: r.format,
          label: r.label != null && String(r.label).trim() !== "" ? String(r.label).trim() : null,
          started_at: typeof r.started_at === "string" ? r.started_at : "",
          completed_at: r.completed_at != null ? String(r.completed_at) : null,
        });
      }
      setRows(next);

      if (resSets.ok) {
        const rawSets = await resSets.json();
        const arr = Array.isArray(rawSets) ? rawSets : [];
        setSets(
          arr
            .filter((s) => s && typeof s.id === "number")
            .map((s) => ({
              id: s.id,
              name: String(s.name ?? "").trim() || `Set ${s.id}`,
            })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load card ratings");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      await load();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, load, reloadSeq]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";

  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div>
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Card Ratings</h2>
        <p className="m-0 mt-2 max-w-2xl text-left text-[0.85rem] leading-snug text-[#f4f0fa]/70">
          Completed card rater sessions. Open results to browse top cards, controversy, and notes from each session.
        </p>
      </div>

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button type="button" className={`mt-3 ${btnBase} ${btnTheme}`} onClick={() => setReloadSeq((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[56rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Label</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Set</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Format</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Started</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Completed</th>
              <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  Loading…
                </td>
              </tr>
            ) : completedRows.length === 0 ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No completed card rating sessions yet.
                </td>
              </tr>
            ) : (
              completedRows.map((row) => {
                const fmtLabel = cardFormatName(row.format) ?? String(row.format);
                const setLabel = setNameById[row.set_id] ?? `Set #${row.set_id}`;
                const labelText = row.label != null && String(row.label).trim() !== "" ? String(row.label).trim() : null;
                return (
                  <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0`}>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-[#f4f0fa]/85 sm:px-4" title={labelText ?? undefined}>
                      {labelText ?? <span className="text-[#f4f0fa]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 sm:px-4">
                      <span className="text-[#f4f0fa]/88">{setLabel}</span>
                    </td>
                    <td className="px-3 py-2.5 sm:px-4">{fmtLabel}</td>
                    <td className="px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">{formatDateTime(row.started_at)}</td>
                    <td className="px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">{formatDateTime(row.completed_at)}</td>
                    <td className="px-3 py-2.5 text-right sm:px-4">
                      <button
                        type="button"
                        className={`${btnBase} ${btnTheme}`}
                        disabled={!user}
                        onClick={() => onViewResults(row.id)}
                      >
                        View results
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
