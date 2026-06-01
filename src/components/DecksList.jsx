import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { cardFormatName } from "../constants/cardFormat";
import { deckHeroLabel } from "../utils/deckHeroLabel";

/** @typedef {{ id: number, user_id: number, name: string, format: number, hero: number, hero_name?: string | null, fabrary_link?: string | null }} DeckRow */

/**
 * @param {string | undefined | null} errText
 * @returns {string}
 */
function parseApiError(errText) {
  const raw = (errText ?? "").trim();
  if (raw === "") return "Request failed";
  try {
    const j = JSON.parse(raw);
    if (j && typeof j.message === "string" && j.message.trim() !== "") return j.message.trim();
    if (j && Array.isArray(j.unknown_cards) && j.unknown_cards.length > 0) {
      const preview = j.unknown_cards.slice(0, 5).join(", ");
      const more = j.unknown_cards.length > 5 ? ` (+${j.unknown_cards.length - 5} more)` : "";
      return `Some cards were not found in the catalog: ${preview}${more}`;
    }
    if (j && typeof j.fabrary_link === "string" && j.fabrary_link.trim() !== "") return j.fabrary_link.trim();
  } catch {
    /* use raw */
  }
  return raw;
}

/**
 * @param {{ isLight: boolean, active: boolean, onOpenDeck?: (deckId: number) => void }} props
 */
export function DecksList({ isLight, active, onOpenDeck }) {
  const { user, sessionProfile } = useAuth();
  const myUserId = typeof sessionProfile?.id === "number" ? sessionProfile.id : null;
  const [rows, setRows] = useState(/** @type {DeckRow[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState(/** @type {string | null} */ (null));

  const [deleteTarget, setDeleteTarget] = useState(/** @type {DeckRow | null} */ (null));
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(/** @type {string | null} */ (null));

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/me/decks", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      const data = await res.json();
      const list = Array.isArray(data.decks) ? data.decks : [];
      /** @type {DeckRow[]} */
      const next = [];
      for (const d of list) {
        if (!d || typeof d.id !== "number" || typeof d.name !== "string") continue;
        if (typeof d.format !== "number" || typeof d.hero !== "number") continue;
        if (typeof d.user_id !== "number") continue;
        next.push({
          id: d.id,
          user_id: d.user_id,
          name: String(d.name).trim() || `Deck #${d.id}`,
          format: d.format,
          hero: d.hero,
          hero_name:
            d.hero_name != null && String(d.hero_name).trim() !== "" ? String(d.hero_name).trim() : null,
          fabrary_link:
            d.fabrary_link != null && String(d.fabrary_link).trim() !== ""
              ? String(d.fabrary_link).trim()
              : null,
        });
      }
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decks");
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

  const openImportModal = useCallback(() => {
    setImportError(null);
    setImportUrl("");
    setImportSubmitting(false);
    setImportModalOpen(true);
  }, []);

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    setImportError(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  useEffect(() => {
    if (!importModalOpen && !deleteTarget) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      if (deleteTarget && !deleteSubmitting) {
        closeDeleteModal();
        return;
      }
      if (importModalOpen && !importSubmitting) closeImportModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [importModalOpen, deleteTarget, importSubmitting, deleteSubmitting, closeImportModal, closeDeleteModal]);

  const submitImport = useCallback(async () => {
    if (!user) return;
    const link = importUrl.trim();
    if (link === "") {
      setImportError("Enter a Fabrary deck URL.");
      return;
    }
    setImportSubmitting(true);
    setImportError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/me/decks/import-fabrary", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ fabrary_link: link }),
      });
      const errText = await res.text();
      if (!res.ok) throw new Error(parseApiError(errText));
      closeImportModal();
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImportSubmitting(false);
    }
  }, [user, importUrl, closeImportModal]);

  const confirmDeleteDeck = useCallback(async () => {
    if (!user || !deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/me/decks/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      closeDeleteModal();
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteSubmitting(false);
    }
  }, [user, deleteTarget, closeDeleteModal]);

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

  const inputCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/40 focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none placeholder:text-[#f4f0fa]/35 focus:border-purple-400/55";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Decks</h2>
          <p className="m-0 mt-2 max-w-2xl text-left text-[0.85rem] leading-snug text-[#f4f0fa]/70">
            Your saved decks. Import from Fabrary to add a deck to your library.
          </p>
        </div>
        <button
          type="button"
          className={`shrink-0 self-start sm:self-auto ${btnPrimary}`}
          disabled={!user || loading}
          onClick={openImportModal}
        >
          Import From Fabrary
        </button>
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
        <table className="w-full min-w-[48rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Name</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Format</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Hero</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Fabrary</th>
              <th className="px-3 py-2.5 text-right font-semibold sm:px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No decks yet. Import one from Fabrary to get started.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const fmtLabel = cardFormatName(row.format) ?? String(row.format);
                const heroLabel = deckHeroLabel(row);
                const canDelete = myUserId != null && row.user_id === myUserId;
                return (
                  <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0`}>
                    <td className="max-w-[18rem] truncate px-3 py-2.5 text-[#f4f0fa]/85 sm:px-4" title={row.name}>
                      {typeof onOpenDeck === "function" ? (
                        <button
                          type="button"
                          className="max-w-full truncate text-left text-purple-300/95 underline decoration-purple-300/35 underline-offset-2 hover:text-purple-200"
                          onClick={() => onOpenDeck(row.id)}
                        >
                          {row.name}
                        </button>
                      ) : (
                        row.name
                      )}
                    </td>
                    <td className="px-3 py-2.5 sm:px-4">{fmtLabel}</td>
                    <td className="px-3 py-2.5 sm:px-4">{heroLabel}</td>
                    <td className="px-3 py-2.5 sm:px-4">
                      {row.fabrary_link ? (
                        <a
                          href={row.fabrary_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-300/90 underline decoration-purple-300/40 underline-offset-2 hover:text-purple-200"
                        >
                          View
                        </a>
                      ) : (
                        <span className="text-[#f4f0fa]/40">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right sm:px-4">
                      {canDelete ? (
                        <button
                          type="button"
                          className={btnDanger}
                          disabled={!user || deleteSubmitting}
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(row);
                          }}
                        >
                          Delete
                        </button>
                      ) : (
                        <span className="text-[#f4f0fa]/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {importModalOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !importSubmitting) closeImportModal();
              }}
            >
              <div
                className={`relative w-full max-w-md rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="decks-import-modal-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="decks-import-modal-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Import From Fabrary
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/70">
                  Paste a Fabrary deck URL to import it into your library.
                </p>

                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                    Fabrary deck URL
                  </span>
                  <input
                    type="url"
                    className={inputCls}
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    placeholder="https://fabrary.net/decks/..."
                    disabled={importSubmitting}
                    autoComplete="off"
                    autoFocus
                  />
                </label>

                {importError ? (
                  <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                    {importError}
                  </p>
                ) : null}

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={importSubmitting}
                    onClick={closeImportModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={importSubmitting || !user}
                    onClick={() => void submitImport()}
                  >
                    {importSubmitting ? "Importing…" : "Import"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

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
                aria-labelledby="decks-delete-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="decks-delete-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Delete “{deleteTarget.name}”?
                </h3>
                <p className="mt-2 text-[0.85rem] leading-snug text-[#f4f0fa]/75">
                  This will permanently remove the deck and all of its cards from your library.
                </p>
                {deleteError ? (
                  <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                    {deleteError}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={deleteSubmitting}
                    onClick={closeDeleteModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnDanger}
                    disabled={deleteSubmitting || !user}
                    onClick={() => void confirmDeleteDeck()}
                  >
                    {deleteSubmitting ? "Deleting…" : "Delete deck"}
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
