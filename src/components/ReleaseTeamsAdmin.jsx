import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";
import {
  CARD_FORMAT_NAMES,
  cardFormatName,
  formatUsesYoungHeroes,
  isValidCardFormatId,
} from "../constants/cardFormat";

/** @typedef {{ id: number, name: string, young?: boolean, card_image_url?: string | null, art_image_url?: string | null, formats?: number[] }} ReleaseHero */

/** @typedef {{ id: number, title: string, format: number, set_id?: number | null, set_name?: string | null, status: number, created_at: string, closed_at?: string | null, heroes: ReleaseHero[] }} ReleaseSession */

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
  } catch {
    /* ignore */
  }
  return raw;
}

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** @param {ReleaseHero} hero */
function heroPortraitURL(hero) {
  const art = hero?.art_image_url != null ? String(hero.art_image_url).trim() : "";
  if (art) return art;
  const card = hero?.card_image_url != null ? String(hero.card_image_url).trim() : "";
  return card || null;
}

/** @param {ReleaseHero} hero @param {number} formatId */
function heroLegalForFormat(hero, formatId) {
  if (!isValidCardFormatId(formatId)) return false;
  const formats = Array.isArray(hero.formats) ? hero.formats : [];
  if (formats.length > 0 && !formats.includes(formatId)) return false;
  const preferYoung = formatUsesYoungHeroes(formatId);
  if (preferYoung === undefined) return true;
  return preferYoung ? hero.young === true : hero.young !== true;
}

/**
 * Admin panel: create and delete release team sessions.
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function ReleaseTeamsAdmin({ isLight, active }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {ReleaseSession[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);
  const [deletingId, setDeletingId] = useState(/** @type {number | null} */ (null));

  const [heroesMeta, setHeroesMeta] = useState(/** @type {ReleaseHero[]} */ ([]));
  const [sets, setSets] = useState(/** @type {Array<{ id: number, name: string }>} */ ([]));

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createFormat, setCreateFormat] = useState(/** @type {number | ""} */ (""));
  const [createSetId, setCreateSetId] = useState(/** @type {number | ""} */ (""));
  const [createHeroIds, setCreateHeroIds] = useState(/** @type {number[]} */ ([]));
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState(/** @type {string | null} */ (null));

  const tableChromeBorder = isLight ? "border-white/[0.12]" : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const btnGhost =
    "rounded-lg border border-white/20 bg-transparent px-3 py-1.5 text-[0.8125rem] font-semibold text-[#f4f0fa]/85 hover:border-white/35 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-45";
  const panel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";
  const inputCls =
    "w-full rounded-lg border border-white/20 bg-black/35 px-3 py-2 text-[0.9rem] text-[#f4f0fa] outline-none focus:border-purple-300/55";

  const createLegalHeroes = useMemo(() => {
    if (createFormat === "" || !isValidCardFormatId(createFormat)) return [];
    return heroesMeta.filter((h) => heroLegalForFormat(h, createFormat));
  }, [heroesMeta, createFormat]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const headers = { Authorization: `Bearer ${token}` };
      const [curRes, pastRes] = await Promise.all([
        fetch("/api/release-teams/sessions?status=current", { headers }),
        fetch("/api/release-teams/sessions?status=past", { headers }),
      ]);
      if (!curRes.ok) throw new Error(parseApiError(await curRes.text()));
      if (!pastRes.ok) throw new Error(parseApiError(await pastRes.text()));
      const curData = await curRes.json();
      const pastData = await pastRes.json();
      const current = Array.isArray(curData.sessions) ? curData.sessions : [];
      const past = Array.isArray(pastData.sessions) ? pastData.sessions : [];
      const merged = [...current, ...past].filter((s) => s && typeof s.id === "number");
      merged.sort((a, b) => {
        const at = Date.parse(a.created_at || "") || 0;
        const bt = Date.parse(b.created_at || "") || 0;
        return bt - at;
      });
      setRows(merged);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sessions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!active || !user) return undefined;
    void load();
    return undefined;
  }, [active, user, reloadSeq, load]);

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const headers = { Authorization: `Bearer ${token}` };
        const [metaRes, setsRes] = await Promise.all([
          fetch("/api/release-teams/meta", { headers }),
          fetch("/api/sets"),
        ]);
        if (cancelled) return;
        if (metaRes.ok) {
          const meta = await metaRes.json();
          setHeroesMeta(Array.isArray(meta.heroes) ? meta.heroes : []);
        }
        if (setsRes.ok) {
          const setsData = await setsRes.json();
          const list = Array.isArray(setsData.sets)
            ? setsData.sets
            : Array.isArray(setsData)
              ? setsData
              : [];
          setSets(
            list
              .filter((s) => s && typeof s.id === "number" && typeof s.name === "string")
              .map((s) => ({ id: s.id, name: s.name })),
          );
        }
      } catch {
        /* ignore until create */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user]);

  const openCreate = () => {
    setCreateTitle("");
    setCreateFormat("");
    setCreateSetId("");
    setCreateHeroIds([]);
    setCreateError(null);
    setCreateOpen(true);
  };

  const submitCreate = async () => {
    if (!user) return;
    if (!createTitle.trim()) {
      setCreateError("Enter a title.");
      return;
    }
    if (createFormat === "" || !isValidCardFormatId(createFormat)) {
      setCreateError("Select a format.");
      return;
    }
    if (createHeroIds.length === 0) {
      setCreateError("Select at least one hero.");
      return;
    }
    setCreateSubmitting(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/release-teams/sessions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: createTitle.trim(),
          format: createFormat,
          hero_ids: createHeroIds,
          set_id: createSetId === "" ? null : createSetId,
        }),
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setCreateOpen(false);
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create session");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const onDelete = async (row) => {
    if (!user || deletingId != null) return;
    const label = row.title?.trim() || `Session #${row.id}`;
    if (
      !window.confirm(
        `Delete “${label}”? Members, notes, and linked deck/recording associations will be removed. This cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(row.id);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/release-teams/sessions/${row.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(parseApiError(await res.text()));
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete session");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Release Teams</h2>
          <p className="m-0 mt-1 text-[0.85rem] text-[#f4f0fa]/6">
            Create sessions for set releases, or permanently delete ones that are no longer needed.
          </p>
        </div>
        <button type="button" className={`shrink-0 self-start sm:self-auto ${btnPrimary}`} onClick={openCreate}>
          New session
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-[0.875rem] text-red-100/95" role="alert">
          {error}
          <button type="button" className="ml-3 underline" onClick={() => setReloadSeq((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[44rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">ID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Title</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Format</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Set</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Status</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Heroes</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Created</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Delete</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#f4f0fa]/60">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#f4f0fa]/60">
                  No release team sessions yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0 hover:bg-white/[0.03]`}>
                  <td className="px-3 py-2.5 tabular-nums sm:px-4">{row.id}</td>
                  <td className="px-3 py-2.5 font-medium sm:px-4">{row.title || "—"}</td>
                  <td className="px-3 py-2.5 sm:px-4">{cardFormatName(row.format) || "—"}</td>
                  <td className="px-3 py-2.5 sm:px-4">{row.set_name || "—"}</td>
                  <td className="px-3 py-2.5 sm:px-4">
                    {row.status === 0 ? (
                      <span className="rounded-md border border-emerald-400/35 bg-emerald-950/40 px-2 py-0.5 text-[0.75rem] font-semibold text-emerald-100">
                        Current
                      </span>
                    ) : (
                      <span className="rounded-md border border-white/15 bg-black/30 px-2 py-0.5 text-[0.75rem] font-semibold text-[#f4f0fa]/7">
                        Past
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 sm:px-4">
                    <div className="flex flex-wrap gap-1">
                      {(row.heroes || []).slice(0, 6).map((h) => {
                        const url = heroPortraitURL(h);
                        return (
                          <span
                            key={h.id}
                            title={h.name}
                            className="size-7 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/20"
                          >
                            {url ? (
                              <img src={url} alt={h.name} className="h-full w-full object-cover" draggable={false} />
                            ) : (
                              <span className="flex h-full w-full items-center justify-center text-[0.65rem] font-semibold">
                                {(h.name || "?").charAt(0)}
                              </span>
                            )}
                          </span>
                        );
                      })}
                      {(row.heroes || []).length > 6 ? (
                        <span className="self-center text-[0.75rem] text-[#f4f0fa]/55">
                          +{(row.heroes || []).length - 6}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 sm:px-4">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-2.5 sm:px-4">
                    <button
                      type="button"
                      className="text-red-300/90 underline hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-45"
                      disabled={deletingId != null}
                      onClick={() => void onDelete(row)}
                    >
                      {deletingId === row.id ? "Deleting…" : "Delete"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {createOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4"
              role="presentation"
              onClick={(e) => {
                if (e.target === e.currentTarget && !createSubmitting) setCreateOpen(false);
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                className={`max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-5 ${panel}`}
              >
                <h3 className="m-0 text-[1.1rem] font-semibold text-white">New release team session</h3>
                <label className="mt-4 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                  Title
                  <input
                    className={inputCls}
                    value={createTitle}
                    onChange={(e) => setCreateTitle(e.target.value)}
                    placeholder="e.g. Heavy Hitters release"
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                  Format
                  <select
                    className={inputCls}
                    value={createFormat}
                    onChange={(e) => {
                      setCreateFormat(e.target.value === "" ? "" : Number(e.target.value));
                      setCreateHeroIds([]);
                    }}
                  >
                    <option value="">Select format…</option>
                    {CARD_FORMAT_NAMES.map((name, idx) => (
                      <option key={name} value={idx}>
                        {name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="mt-3 flex flex-col gap-1 text-[0.8rem] text-[#f4f0fa]/7">
                  Set (optional)
                  <select
                    className={inputCls}
                    value={createSetId}
                    onChange={(e) => setCreateSetId(e.target.value === "" ? "" : Number(e.target.value))}
                  >
                    <option value="">None</option>
                    {sets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-3">
                  <p className="m-0 mb-2 text-[0.8rem] text-[#f4f0fa]/7">Heroes</p>
                  {createFormat === "" ? (
                    <p className="m-0 text-[0.85rem] text-[#f4f0fa]/5">Select a format to choose heroes.</p>
                  ) : createLegalHeroes.length === 0 ? (
                    <p className="m-0 text-[0.85rem] text-[#f4f0fa]/5">No heroes for this format.</p>
                  ) : (
                    <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto rounded-lg border border-white/10 p-2">
                      {createLegalHeroes.map((h) => {
                        const selected = createHeroIds.includes(h.id);
                        const url = heroPortraitURL(h);
                        return (
                          <button
                            key={h.id}
                            type="button"
                            title={h.name}
                            aria-pressed={selected}
                            onClick={() =>
                              setCreateHeroIds((ids) =>
                                selected ? ids.filter((x) => x !== h.id) : [...ids, h.id],
                              )
                            }
                            className={`flex items-center gap-2 rounded-full border px-2 py-1 text-[0.8rem] ${
                              selected
                                ? "border-emerald-300/70 bg-emerald-950/40 text-white"
                                : "border-white/20 bg-black/30 text-[#f4f0fa]/8"
                            }`}
                          >
                            <span className="size-7 overflow-hidden rounded-full bg-black/40">
                              {url ? (
                                <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                              ) : null}
                            </span>
                            {h.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {createError ? <p className="mt-3 text-[0.85rem] text-red-200">{createError}</p> : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className={btnGhost}
                    disabled={createSubmitting}
                    onClick={() => setCreateOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={createSubmitting}
                    onClick={() => void submitCreate()}
                  >
                    {createSubmitting ? "Creating…" : "Create"}
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
