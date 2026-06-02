import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

/** @param {string | null} contentDisposition */
function filenameFromContentDisposition(contentDisposition) {
  if (!contentDisposition) return "card-ratings.csv";
  const match = /filename="([^"]+)"/i.exec(contentDisposition);
  if (match?.[1]) return match[1];
  return "card-ratings.csv";
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

  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportSets, setExportSets] = useState(/** @type {CatalogSetLite[]} */ ([]));
  const [exportSetsLoading, setExportSetsLoading] = useState(false);
  const [exportSetId, setExportSetId] = useState("");
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportError, setExportError] = useState(/** @type {string | null} */ (null));

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

  const loadExportSets = useCallback(async () => {
    if (!user) return;
    setExportSetsLoading(true);
    setExportError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/me/card-ratings/export-sets", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to load rated sets");
      }
      const data = await res.json();
      const list = Array.isArray(data.sets) ? data.sets : [];
      /** @type {CatalogSetLite[]} */
      const next = list
        .filter((s) => s && typeof s.id === "number")
        .map((s) => ({
          id: s.id,
          name: String(s.name ?? "").trim() || `Set ${s.id}`,
        }));
      setExportSets(next);
      setExportSetId(next.length > 0 ? String(next[0].id) : "");
    } catch (e) {
      setExportSets([]);
      setExportSetId("");
      setExportError(e instanceof Error ? e.message : "Failed to load rated sets");
    } finally {
      setExportSetsLoading(false);
    }
  }, [user]);

  const openExportModal = useCallback(() => {
    setExportModalOpen(true);
    setExportError(null);
    setExportSubmitting(false);
    void loadExportSets();
  }, [loadExportSets]);

  const closeExportModal = useCallback(() => {
    if (exportSubmitting) return;
    setExportModalOpen(false);
    setExportError(null);
  }, [exportSubmitting]);

  const submitExport = useCallback(async () => {
    if (!user || exportSetId === "" || exportSubmitting) return;
    setExportSubmitting(true);
    setExportError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/me/card-ratings/export?set_id=${encodeURIComponent(exportSetId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Export failed");
      }
      const blob = await res.blob();
      const filename = filenameFromContentDisposition(res.headers.get("Content-Disposition"));
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      setExportModalOpen(false);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExportSubmitting(false);
    }
  }, [user, exportSetId, exportSubmitting]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnPrimary = isLight
    ? "rounded-lg border border-violet-300/40 bg-violet-500/35 px-3 py-1.5 text-[0.8125rem] font-semibold text-[#f4f0fa] transition-colors hover:bg-violet-500/50 disabled:cursor-not-allowed disabled:opacity-40"
    : "rounded-lg border border-violet-400/35 bg-violet-600/30 px-3 py-1.5 text-[0.8125rem] font-semibold text-[#f4f0fa] transition-colors hover:bg-violet-600/45 disabled:cursor-not-allowed disabled:opacity-40";

  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls = isLight
    ? "rounded-lg border border-white/20 bg-black/25 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-white/35"
    : "rounded-lg border border-white/25 bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-white/40";

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

      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <button
            type="button"
            className={`${btnBase} ${btnTheme}`}
            disabled={!user}
            onClick={openExportModal}
          >
            Export Ratings
          </button>
        </div>

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

      {exportModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !exportSubmitting) closeExportModal();
              }}
            >
              <div
                className={`relative w-full max-w-md rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="export-ratings-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                {exportSubmitting ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div
                      className="h-9 w-9 animate-spin rounded-full border-2 border-[#f4f0fa]/20 border-t-[#f4f0fa]/90"
                      role="status"
                      aria-label="Generating export"
                    />
                    <p className="m-0 text-[0.875rem] text-[#f4f0fa]/75">Generating export…</p>
                  </div>
                ) : (
                  <>
                    <h3 id="export-ratings-modal-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                      Export Ratings
                    </h3>
                    <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/70">
                      Export your card ratings across all sessions for a set, including any active session.
                    </p>

                    <label className="mt-4 flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Set</span>
                      {exportSetsLoading ? (
                        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/70">Loading sets…</p>
                      ) : exportSets.length === 0 ? (
                        <p className="m-0 text-[0.875rem] text-[#f4f0fa]/70">You have not rated any cards yet.</p>
                      ) : (
                        <select
                          className={inputCls}
                          value={exportSetId}
                          disabled={exportSubmitting}
                          onChange={(e) => setExportSetId(e.target.value)}
                        >
                          {exportSets.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>

                    {exportError ? (
                      <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                        {exportError}
                      </p>
                    ) : null}

                    <div className="mt-5 flex flex-wrap justify-end gap-2">
                      <button type="button" className={`${btnBase} ${btnTheme}`} onClick={closeExportModal}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className={btnPrimary}
                        disabled={exportSetsLoading || exportSets.length === 0 || exportSetId === ""}
                        onClick={() => void submitExport()}
                      >
                        Submit
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
