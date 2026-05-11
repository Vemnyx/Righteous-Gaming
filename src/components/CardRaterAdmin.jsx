import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { CARD_FORMAT_NAMES, cardFormatName } from "../constants/cardFormat";

/** @typedef {{ id: number, name: string, code?: string }} CatalogSetLite */

/** @typedef {{ id: number, set_id: number, format: number, label?: string | null, started_at: string, completed_at?: string | null }} CardRaterRow */

const MAX_LABEL_LEN = 512;

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** @param {CardRaterRow} row */
function rowIsActive(row) {
  return row.completed_at == null || row.completed_at === "";
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function CardRaterAdmin({ isLight, active }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {CardRaterRow[]} */ ([]));
  const [sets, setSets] = useState(/** @type {CatalogSetLite[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [setsModalLoading, setSetsModalLoading] = useState(false);
  const [modalSetId, setModalSetId] = useState(/** @type {number | ""} */ (""));
  const [modalFormat, setModalFormat] = useState(0);
  const [modalLabel, setModalLabel] = useState("");
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState(/** @type {string | null} */ (null));

  const [completing, setCompleting] = useState(false);

  /** Row pending delete confirmation; null when dialog closed. */
  const [deleteTarget, setDeleteTarget] = useState(/** @type {CardRaterRow | null} */ (null));
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(/** @type {string | null} */ (null));

  const hasActiveRater = useMemo(() => rows.some((r) => rowIsActive(r)), [rows]);

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

  const loadRaters = useCallback(async () => {
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
              code: String(s.code ?? "").trim(),
            })),
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load card raters");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadRaters();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, reloadSeq, loadRaters]);

  const openModal = useCallback(async () => {
    setModalError(null);
    setModalOpen(true);
    setModalSubmitting(false);
    setModalLabel("");
    const first = sets[0];
    if (first) {
      setModalSetId(first.id);
      setModalFormat(0);
    } else {
      setModalSetId("");
    }
    if (sets.length > 0) {
      setSetsModalLoading(false);
      return;
    }
    setSetsModalLoading(true);
    try {
      const res = await fetch("/api/sets");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      /** @type {CatalogSetLite[]} */
      const normalized = list
        .filter((s) => s && typeof s.id === "number")
        .map((s) => ({
          id: s.id,
          name: String(s.name ?? "").trim() || `Set ${s.id}`,
          code: String(s.code ?? "").trim(),
        }));
      setSets(normalized);
      const f = normalized[0];
      setModalSetId(f ? f.id : "");
      setModalFormat(0);
      setModalLabel("");
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Failed to load sets");
      setSets([]);
      setModalSetId("");
    } finally {
      setSetsModalLoading(false);
    }
  }, [sets]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setModalError(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  useEffect(() => {
    if (!modalOpen && !deleteTarget) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      if (deleteTarget && !deleteSubmitting) {
        closeDeleteModal();
        return;
      }
      if (modalOpen && !modalSubmitting) closeModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalOpen, deleteTarget, modalSubmitting, deleteSubmitting, closeModal, closeDeleteModal]);

  const confirmDeleteSession = useCallback(async () => {
    if (!user || !deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/card-raters/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const errText = (await res.text())?.trim() || res.statusText;
      if (!res.ok) {
        let msg = errText || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(errText);
          if (j && typeof j.message === "string" && j.message.trim() !== "") msg = j.message.trim();
        } catch {
          /* use msg as-is */
        }
        throw new Error(msg);
      }
      setDeleteTarget(null);
      setDeleteError(null);
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [user, deleteTarget]);

  const submitNewRater = useCallback(async () => {
    if (!user || modalSetId === "") return;
    setModalSubmitting(true);
    setModalError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/card-raters", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          set_id: modalSetId,
          format: modalFormat,
          ...(modalLabel.trim() !== "" ? { label: modalLabel.trim() } : {}),
        }),
      });
      if (res.status === 409) {
        const t = await res.text();
        throw new Error(t?.trim() || "An active card rater already exists.");
      }
      if (!res.ok) throw new Error(await res.text());
      closeModal();
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setModalSubmitting(false);
    }
  }, [user, modalSetId, modalFormat, modalLabel, closeModal]);

  const completeActive = useCallback(async () => {
    if (!user) return;
    setCompleting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/card-raters/active/complete", {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to complete session");
    } finally {
      setCompleting(false);
    }
  }, [user]);

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";

  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";

  const btnDanger =
    "rounded-lg border border-red-400/45 bg-red-950/50 px-3 py-1.5 text-[0.8125rem] font-medium text-red-100 transition-colors hover:border-red-300/55 hover:bg-red-900/45 disabled:cursor-not-allowed disabled:opacity-45";

  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  const modalPanel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  const selectCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55";

  const inputCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Card Rater</h2>
        <button
          type="button"
          className={`shrink-0 self-start sm:self-auto ${btnPrimary}`}
          disabled={!user || hasActiveRater || loading}
          onClick={() => void openModal()}
        >
          New session
        </button>
      </div>
      <p className="m-0 max-w-2xl text-left text-[0.85rem] leading-snug text-[#f4f0fa]/70">
        Only one open session is allowed at a time. Use Complete to close the active session before starting another.
      </p>

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
        <table className="w-full min-w-[58rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">ID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Label</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Set</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Format</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Started</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Completed</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Status</th>
              <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No card rater sessions yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const active = rowIsActive(row);
                const fmtLabel = cardFormatName(row.format) ?? String(row.format);
                const setLabel = setNameById[row.set_id] ?? `Set #${row.set_id}`;
                const labelText = row.label != null && String(row.label).trim() !== "" ? String(row.label).trim() : null;
                return (
                  <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0`}>
                    <td className="px-3 py-2.5 tabular-nums sm:px-4">{row.id}</td>
                    <td className="max-w-[14rem] truncate px-3 py-2.5 text-[#f4f0fa]/85 sm:px-4" title={labelText ?? undefined}>
                      {labelText ?? <span className="text-[#f4f0fa]/40">—</span>}
                    </td>
                    <td className="px-3 py-2.5 sm:px-4">
                      <span className="text-[#f4f0fa]/88">{setLabel}</span>
                      <span className="ml-1.5 text-[0.72rem] text-[#f4f0fa]/45">({row.set_id})</span>
                    </td>
                    <td className="px-3 py-2.5 sm:px-4">{fmtLabel}</td>
                    <td className="px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">{formatDateTime(row.started_at)}</td>
                    <td className="px-3 py-2.5 text-[#f4f0fa]/80 sm:px-4">{formatDateTime(row.completed_at)}</td>
                    <td className="px-3 py-2.5 sm:px-4">
                      {active ? (
                        <span className="inline-flex rounded-md border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-[0.72rem] font-semibold uppercase tracking-wide text-amber-100/95">
                          Active
                        </span>
                      ) : (
                        <span className="text-[#f4f0fa]/50">Completed</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right sm:px-4">
                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {active ? (
                          <button
                            type="button"
                            className={`${btnBase} ${btnTheme}`}
                            disabled={completing || !user || deleteSubmitting}
                            onClick={() => void completeActive()}
                          >
                            {completing ? "Completing…" : "Complete"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className={btnDanger}
                          disabled={!user || deleteSubmitting || completing}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(row);
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {deleteTarget && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[210] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !deleteSubmitting) closeDeleteModal();
              }}
            >
              <div
                className={`relative w-full max-w-md rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="card-rater-delete-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="card-rater-delete-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Delete this session?
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/75">
                  This removes the session record{" "}
                  <span className="font-mono text-[#f4f0fa]/90">#{deleteTarget.id}</span>
                  {deleteTarget.label != null && String(deleteTarget.label).trim() !== "" ? (
                    <>
                      {" "}
                      <span className="text-[#f4f0fa]/90">({String(deleteTarget.label).trim()})</span>
                    </>
                  ) : null}{" "}
                  permanently. You cannot delete a session that still has user card ratings; remove or migrate those
                  first.
                </p>
                <ul className="mt-3 list-inside list-disc text-[0.82rem] leading-snug text-[#f4f0fa]/70">
                  <li>
                    Set: {setNameById[deleteTarget.set_id] ?? `Set #${deleteTarget.set_id}`} (id {deleteTarget.set_id})
                  </li>
                  <li>Format: {cardFormatName(deleteTarget.format) ?? deleteTarget.format}</li>
                  <li>Started: {formatDateTime(deleteTarget.started_at)}</li>
                  <li>Completed: {formatDateTime(deleteTarget.completed_at)}</li>
                </ul>
                {deleteError ? (
                  <p className="mt-3 rounded-lg border border-red-400/35 bg-red-950/35 px-3 py-2 text-[0.82rem] text-red-100">
                    {deleteError}
                  </p>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button type="button" className={`${btnBase} ${btnTheme}`} disabled={deleteSubmitting} onClick={closeDeleteModal}>
                    Cancel
                  </button>
                  <button type="button" className={btnDanger} disabled={deleteSubmitting} onClick={() => void confirmDeleteSession()}>
                    {deleteSubmitting ? "Deleting…" : "Delete session"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {modalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !modalSubmitting) closeModal();
              }}
            >
              <div
                className={`relative w-full max-w-md rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="card-rater-admin-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="card-rater-admin-modal-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  New card rater session
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/70">Choose the set, format, and an optional label for this session.</p>

                {setsModalLoading ? (
                  <p className="mt-4 text-[0.875rem] text-[#f4f0fa]/75">Loading sets…</p>
                ) : (
                  <div className="mt-4 flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Label</span>
                      <input
                        type="text"
                        className={inputCls}
                        value={modalLabel}
                        onChange={(e) => setModalLabel(e.target.value)}
                        placeholder="e.g. Omens Limited — March 2026"
                        maxLength={MAX_LABEL_LEN}
                        disabled={modalSubmitting}
                        autoComplete="off"
                      />
                      <span className="text-[0.72rem] text-[#f4f0fa]/45">Optional. Max {MAX_LABEL_LEN} characters.</span>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Set</span>
                      <select
                        className={selectCls}
                        value={modalSetId === "" ? "" : String(modalSetId)}
                        onChange={(e) => {
                          const v = e.target.value;
                          setModalSetId(v === "" ? "" : Number.parseInt(v, 10));
                        }}
                        disabled={sets.length === 0 || modalSubmitting}
                      >
                        {sets.length === 0 ? (
                          <option value="">No sets available</option>
                        ) : (
                          sets.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                            </option>
                          ))
                        )}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Format</span>
                      <select
                        className={selectCls}
                        value={String(modalFormat)}
                        onChange={(e) => setModalFormat(Number.parseInt(e.target.value, 10))}
                        disabled={modalSubmitting}
                      >
                        {CARD_FORMAT_NAMES.map((name, idx) => (
                          <option key={idx} value={String(idx)}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}

                {modalError ? (
                  <p className="mt-3 rounded-lg border border-red-400/35 bg-red-950/35 px-3 py-2 text-[0.82rem] text-red-100">{modalError}</p>
                ) : null}

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <button type="button" className={`${btnBase} ${btnTheme}`} disabled={modalSubmitting} onClick={closeModal}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={modalSubmitting || modalSetId === "" || sets.length === 0 || setsModalLoading}
                    onClick={() => void submitNewRater()}
                  >
                    {modalSubmitting ? "Creating…" : "Create session"}
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
