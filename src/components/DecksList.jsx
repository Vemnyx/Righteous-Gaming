import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import { deckHeroLabel } from "../utils/deckHeroLabel";
import { deckDisplayName } from "../utils/deckDisplayName";
import {
  DECK_FILTER_ALL,
  buildDeckFormatFilterOptions,
  buildDeckHeroFilterOptions,
  buildDeckSourceFilterOptions,
  deckFormatColumnLabel,
  matchesDeckTableFilters,
} from "../utils/deckTableFilters";

/** @typedef {{ id: number, user_id: number, name: string, format: number, hero_id: number, hero_name?: string | null, set_id?: number | null, fabrary_format?: string | null, deck_source_id: number, source: string, fabrary_link?: string | null }} DeckRow */

/** @typedef {{ id: number, source: string }} DeckSourceOption */

const CREATE_SOURCE_VALUE = "__create__";

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
    if (j && typeof j.source === "string" && j.source.trim() !== "") return j.source.trim();
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
  const [sets, setSets] = useState(/** @type {{ id: number, name: string }[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importSourceId, setImportSourceId] = useState("");
  const [deckSources, setDeckSources] = useState(/** @type {DeckSourceOption[]} */ ([]));
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importError, setImportError] = useState(/** @type {string | null} */ (null));

  const [createSourceOpen, setCreateSourceOpen] = useState(false);
  const [newSourceName, setNewSourceName] = useState("");
  const [createSourceSubmitting, setCreateSourceSubmitting] = useState(false);
  const [createSourceError, setCreateSourceError] = useState(/** @type {string | null} */ (null));

  const [deleteTarget, setDeleteTarget] = useState(/** @type {DeckRow | null} */ (null));
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState(/** @type {string | null} */ (null));

  const [filterFormat, setFilterFormat] = useState(DECK_FILTER_ALL);
  const [filterHero, setFilterHero] = useState(DECK_FILTER_ALL);
  const [filterSource, setFilterSource] = useState(DECK_FILTER_ALL);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const [resDecks, resSets] = await Promise.all([
        fetch("/api/me/decks", {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/sets"),
      ]);
      if (!resDecks.ok) throw new Error(parseApiError(await resDecks.text()));
      const data = await resDecks.json();
      const list = Array.isArray(data.decks) ? data.decks : [];
      /** @type {DeckRow[]} */
      const next = [];
      for (const d of list) {
        if (!d || typeof d.id !== "number" || typeof d.name !== "string") continue;
        if (typeof d.format !== "number" || typeof d.hero_id !== "number") continue;
        if (typeof d.user_id !== "number") continue;
        next.push({
          id: d.id,
          user_id: d.user_id,
          name: String(d.name).trim() || `Deck #${d.id}`,
          format: d.format,
          hero_id: d.hero_id,
          hero_name:
            d.hero_name != null && String(d.hero_name).trim() !== "" ? String(d.hero_name).trim() : null,
          set_id: typeof d.set_id === "number" ? d.set_id : null,
          fabrary_format:
            d.fabrary_format != null && String(d.fabrary_format).trim() !== ""
              ? String(d.fabrary_format).trim()
              : null,
          deck_source_id: typeof d.deck_source_id === "number" ? d.deck_source_id : 0,
          source: typeof d.source === "string" ? String(d.source).trim() : "",
          fabrary_link:
            d.fabrary_link != null && String(d.fabrary_link).trim() !== ""
              ? String(d.fabrary_link).trim()
              : null,
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
      } else {
        setSets([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load decks");
      setRows([]);
      setSets([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const setNameById = useMemo(() => {
    /** @type {Record<number, string>} */
    const m = {};
    for (const s of sets) {
      if (s && typeof s.id === "number") {
        m[s.id] = s.name;
      }
    }
    return m;
  }, [sets]);

  const formatFilterOptions = useMemo(
    () => buildDeckFormatFilterOptions(rows, setNameById),
    [rows, setNameById],
  );

  const heroFilterOptions = useMemo(() => buildDeckHeroFilterOptions(rows), [rows]);

  const sourceFilterOptions = useMemo(() => buildDeckSourceFilterOptions(rows), [rows]);

  const filteredRows = useMemo(
    () =>
      rows.filter((row) =>
        matchesDeckTableFilters(row, {
          format: filterFormat,
          hero: filterHero,
          source: filterSource,
        }),
      ),
    [rows, filterFormat, filterHero, filterSource],
  );

  const loadDeckSources = useCallback(async () => {
    if (!user) return /** @type {DeckSourceOption[]} */ ([]);
    const token = await user.getIdToken();
    const res = await fetch("/api/deck-sources", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(parseApiError(await res.text()));
    const data = await res.json();
    const list = Array.isArray(data.sources) ? data.sources : [];
    /** @type {DeckSourceOption[]} */
    const next = [];
    for (const s of list) {
      if (!s || typeof s.id !== "number") continue;
      const label = String(s.source ?? "").trim();
      if (label === "") continue;
      next.push({ id: s.id, source: label });
    }
    return next;
  }, [user]);

  const applyDefaultSource = useCallback((/** @type {DeckSourceOption[]} */ sources) => {
    const member = sources.find((s) => s.source.toLowerCase() === "member");
    const pick = member ?? sources[0];
    setImportSourceId(pick ? String(pick.id) : "");
  }, []);

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
    setCreateSourceOpen(false);
    setNewSourceName("");
    setCreateSourceError(null);
    setImportModalOpen(true);
    setSourcesLoading(true);
    void (async () => {
      try {
        const sources = await loadDeckSources();
        setDeckSources(sources);
        applyDefaultSource(sources);
      } catch (e) {
        setImportError(e instanceof Error ? e.message : "Failed to load deck sources");
        setDeckSources([]);
        setImportSourceId("");
      } finally {
        setSourcesLoading(false);
      }
    })();
  }, [loadDeckSources, applyDefaultSource]);

  const closeImportModal = useCallback(() => {
    setImportModalOpen(false);
    setImportError(null);
    setCreateSourceOpen(false);
    setNewSourceName("");
    setCreateSourceError(null);
  }, []);

  const closeCreateSourceModal = useCallback(() => {
    setCreateSourceOpen(false);
    setNewSourceName("");
    setCreateSourceError(null);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setDeleteTarget(null);
    setDeleteError(null);
  }, []);

  useEffect(() => {
    if (!importModalOpen && !deleteTarget && !createSourceOpen) return undefined;
    /** @param {KeyboardEvent} e */
    function onKeyDown(e) {
      if (e.key !== "Escape") return;
      if (createSourceOpen && !createSourceSubmitting) {
        closeCreateSourceModal();
        return;
      }
      if (deleteTarget && !deleteSubmitting) {
        closeDeleteModal();
        return;
      }
      if (importModalOpen && !importSubmitting) closeImportModal();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    importModalOpen,
    deleteTarget,
    createSourceOpen,
    importSubmitting,
    deleteSubmitting,
    createSourceSubmitting,
    closeImportModal,
    closeDeleteModal,
    closeCreateSourceModal,
  ]);

  const submitCreateSource = useCallback(async () => {
    if (!user) return;
    const name = newSourceName.trim();
    if (name === "") {
      setCreateSourceError("Enter a source name.");
      return;
    }
    setCreateSourceSubmitting(true);
    setCreateSourceError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/deck-sources", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ source: name }),
      });
      const errText = await res.text();
      if (!res.ok) throw new Error(parseApiError(errText));
      const created = JSON.parse(errText);
      if (!created || typeof created.id !== "number") throw new Error("Invalid response");
      const label = String(created.source ?? name).trim() || name;
      const next = { id: created.id, source: label };
      setDeckSources((prev) => {
        const merged = [...prev.filter((s) => s.id !== next.id), next];
        merged.sort((a, b) => a.source.localeCompare(b.source, undefined, { sensitivity: "base" }));
        return merged;
      });
      setImportSourceId(String(next.id));
      closeCreateSourceModal();
    } catch (e) {
      setCreateSourceError(e instanceof Error ? e.message : "Failed to create source");
    } finally {
      setCreateSourceSubmitting(false);
    }
  }, [user, newSourceName, closeCreateSourceModal]);

  const submitImport = useCallback(async () => {
    if (!user) return;
    const link = importUrl.trim();
    if (link === "") {
      setImportError("Enter a Fabrary deck URL.");
      return;
    }
    const sourceId = parseInt(importSourceId, 10);
    if (!Number.isFinite(sourceId) || sourceId <= 0) {
      setImportError("Select a deck source.");
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
        body: JSON.stringify({ fabrary_link: link, deck_source_id: sourceId }),
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
  }, [user, importUrl, importSourceId, closeImportModal]);

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

  const selectCls = isLight
    ? "w-full rounded-lg border border-white/[0.22] bg-black/30 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
    : "w-full rounded-lg border border-white/[0.22] bg-black/40 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55";

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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Format</span>
          <select
            className={selectCls}
            value={filterFormat}
            disabled={loading || rows.length === 0}
            onChange={(e) => setFilterFormat(e.target.value)}
          >
            {formatFilterOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Hero</span>
          <select
            className={selectCls}
            value={filterHero}
            disabled={loading || rows.length === 0}
            onChange={(e) => setFilterHero(e.target.value)}
          >
            {heroFilterOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:max-w-[14rem]">
          <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Source</span>
          <select
            className={selectCls}
            value={filterSource}
            disabled={loading || rows.length === 0}
            onChange={(e) => setFilterSource(e.target.value)}
          >
            {sourceFilterOptions.map((opt) => (
              <option key={opt.value || "all"} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[52rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Name</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Source</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Format</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Hero</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Fabrary</th>
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
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No decks yet. Import one from Fabrary to get started.
                </td>
              </tr>
            ) : filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className={`px-4 py-8 text-center text-[#f4f0fa]/65 ${tableRowBorder}`}>
                  No decks match the selected filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => {
                const fmtLabel = deckFormatColumnLabel(row, setNameById);
                const heroLabel = deckHeroLabel(row);
                const displayName = deckDisplayName(row, setNameById);
                const canDelete = myUserId != null && row.user_id === myUserId;
                return (
                  <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0`}>
                    <td className="max-w-[18rem] truncate px-3 py-2.5 text-[#f4f0fa]/85 sm:px-4" title={displayName}>
                      {typeof onOpenDeck === "function" ? (
                        <button
                          type="button"
                          className="max-w-full truncate text-left text-purple-300/95 underline decoration-purple-300/35 underline-offset-2 hover:text-purple-200"
                          onClick={() => onOpenDeck(row.id)}
                        >
                          {displayName}
                        </button>
                      ) : (
                        displayName
                      )}
                    </td>
                    <td className="px-3 py-2.5 sm:px-4">{row.source || "—"}</td>
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
                    Deck source
                  </span>
                  {sourcesLoading ? (
                    <p className="m-0 text-[0.875rem] text-[#f4f0fa]/70">Loading sources…</p>
                  ) : (
                    <select
                      className={selectCls}
                      value={importSourceId}
                      disabled={importSubmitting || deckSources.length === 0}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === CREATE_SOURCE_VALUE) {
                          setCreateSourceOpen(true);
                          return;
                        }
                        setImportSourceId(v);
                      }}
                    >
                      <option value={CREATE_SOURCE_VALUE}>Create New Source</option>
                      {deckSources.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.source}
                        </option>
                      ))}
                    </select>
                  )}
                </label>

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
                    disabled={importSubmitting || sourcesLoading || !user || importSourceId === ""}
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

      {createSourceOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !createSourceSubmitting) closeCreateSourceModal();
              }}
            >
              <div
                className={`relative w-full max-w-md rounded-xl p-5 sm:p-6 ${modalPanel}`}
                role="dialog"
                aria-modal="true"
                aria-labelledby="decks-create-source-title"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="decks-create-source-title" className="m-0 text-lg font-semibold text-[#f4f0fa]">
                  Create New Source
                </h3>
                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">
                    Source name
                  </span>
                  <input
                    type="text"
                    className={inputCls}
                    value={newSourceName}
                    onChange={(e) => setNewSourceName(e.target.value)}
                    placeholder="e.g. Member"
                    disabled={createSourceSubmitting}
                    autoComplete="off"
                    autoFocus
                  />
                </label>
                {createSourceError ? (
                  <p className="mt-3 text-[0.85rem] text-red-200/95" role="alert">
                    {createSourceError}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className={`${btnBase} ${btnTheme}`}
                    disabled={createSourceSubmitting}
                    onClick={closeCreateSourceModal}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={createSourceSubmitting || !user}
                    onClick={() => void submitCreateSource()}
                  >
                    {createSourceSubmitting ? "Creating…" : "Create"}
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
