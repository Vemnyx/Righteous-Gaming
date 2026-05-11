import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/** @typedef {{ id: number, name: string, code: string, image_url?: string | null }} CatalogSetRow */

/**
 * Omens of the Stars / Omen of the Stars — fabrary sync is only offered for this set name.
 * @param {CatalogSetRow} row
 */
function rowShowsFabrarySync(row) {
  const n = String(row?.name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return n === "omens of the stars" || n === "omen of the stars";
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function SetsAdmin({ isLight, active }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {CatalogSetRow[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);
  const [syncingId, setSyncingId] = useState(/** @type {number | null} */ (null));
  const [syncBanner, setSyncBanner] = useState(/** @type {string | null} */ (null));

  const loadSets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sets");
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const list = Array.isArray(data) ? data : [];
      /** @type {CatalogSetRow[]} */
      const next = [];
      for (const s of list) {
        if (!s || typeof s.id !== "number") continue;
        next.push({
          id: s.id,
          name: String(s.name ?? "").trim() || `Set ${s.id}`,
          code: String(s.code ?? "").trim(),
          image_url: s.image_url != null ? String(s.image_url) : null,
        });
      }
      next.sort((a, b) => a.id - b.id);
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load sets");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await loadSets();
    })();
    return () => {
      cancelled = true;
    };
  }, [active, reloadSeq, loadSets]);

  const fabrarySyncRows = useMemo(() => rows.filter((r) => rowShowsFabrarySync(r)), [rows]);

  const runFabrarySync = useCallback(
    /** @param {CatalogSetRow} row */
    async (row) => {
      if (!user) return;
      setSyncBanner(null);
      setSyncingId(row.id);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ set_name: row.name });
        const res = await fetch(`/api/admin/catalog/sync-fabrary-latest-set?${params.toString()}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        const text = await res.text();
        let body;
        try {
          body = JSON.parse(text);
        } catch {
          body = { raw: text };
        }
        if (!res.ok) {
          const msg =
            body && typeof body === "object" && body.message != null
              ? String(body.message)
              : text?.trim() || res.statusText;
          throw new Error(msg);
        }
        const inserted =
          body && typeof body === "object" && typeof body.inserted === "number" ? body.inserted : null;
        const matched =
          body && typeof body === "object" && typeof body.objects_matched === "number"
            ? body.objects_matched
            : null;
        const skipped =
          body && typeof body === "object" && typeof body.skipped_already_have === "number"
            ? body.skipped_already_have
            : null;
        const parts = [];
        if (matched != null) parts.push(`matched ${matched} card(s) in source`);
        if (skipped != null) parts.push(`${skipped} already in DB`);
        if (inserted != null) parts.push(`inserted ${inserted}`);
        setSyncBanner(
          parts.length ? `Sync for “${row.name}”: ${parts.join(" · ")}.` : `Sync for “${row.name}” completed.`,
        );
        setReloadSeq((n) => n + 1);
      } catch (e) {
        setSyncBanner(e instanceof Error ? e.message : "Sync failed");
      } finally {
        setSyncingId(null);
      }
    },
    [user],
  );

  const btnBase =
    "rounded-lg border px-3 py-1.5 text-[0.8125rem] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
  const btnTheme = isLight
    ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:border-white/40 hover:bg-black/35"
    : "border-white/[0.28] bg-black/20 text-[#f4f0fa] hover:border-white/40 hover:bg-black/30";
  const btnSync =
    "rounded-lg border border-emerald-400/45 bg-emerald-950/40 px-3 py-1.5 text-[0.8125rem] font-semibold text-emerald-100 transition-colors hover:border-emerald-300/55 hover:bg-emerald-900/40 disabled:cursor-not-allowed disabled:opacity-45";

  const tableChromeBorder = isLight
    ? "border-white/[0.12]"
    : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Sets</h2>
          <p className="m-0 mt-1 max-w-2xl text-[0.85rem] leading-snug text-[#f4f0fa]/70">
            Catalog sets stored in the database. For{" "}
            <span className="font-semibold text-[#f4f0fa]/88">Omens of the Stars</span> (or{" "}
            <span className="font-semibold text-[#f4f0fa]/88">Omen of the Stars</span>), use Sync to pull new cards
            from fabrary’s published latest-set file.
          </p>
        </div>
      </div>

      {syncBanner ? (
        <div
          className="rounded-xl border border-white/[0.18] bg-black/25 px-4 py-3 text-left text-[0.85rem] text-[#f4f0fa]/88"
          role="status"
        >
          {syncBanner}
        </div>
      ) : null}

      {error ? (
        <div
          className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-left text-[0.875rem] text-red-100/95"
          role="alert"
        >
          <p className="font-medium">Could not load sets</p>
          <p className="mt-1 text-red-100/80">{error}</p>
          <button type="button" className={`mt-3 ${btnBase} ${btnTheme}`} onClick={() => setReloadSeq((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      <div className={`overflow-x-auto rounded-xl border bg-black/20 ${tableChromeBorder}`}>
        <table className="w-full min-w-[40rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">ID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Name</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Code</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Image URL</th>
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
                  No sets found.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const showSync = rowShowsFabrarySync(row);
                const img = row.image_url && String(row.image_url).trim() !== "" ? String(row.image_url).trim() : "";
                return (
                  <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0`}>
                    <td className="px-3 py-2.5 tabular-nums text-[#f4f0fa]/80 sm:px-4">{row.id}</td>
                    <td className="max-w-[18rem] px-3 py-2.5 font-medium text-[#f4f0fa]/92 sm:px-4">{row.name}</td>
                    <td className="px-3 py-2.5 font-mono text-[0.78rem] text-[#f4f0fa]/80 sm:px-4">{row.code || "—"}</td>
                    <td className="max-w-[22rem] truncate px-3 py-2.5 text-[#f4f0fa]/60 sm:px-4" title={img || undefined}>
                      {img || "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right sm:px-4">
                      {showSync ? (
                        <button
                          type="button"
                          className={btnSync}
                          disabled={!user || syncingId != null}
                          onClick={() => void runFabrarySync(row)}
                        >
                          {syncingId === row.id ? "Syncing…" : "Sync"}
                        </button>
                      ) : (
                        <span className="text-[0.72rem] text-[#f4f0fa]/40">—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {fabrarySyncRows.length === 0 && !loading && rows.length > 0 ? (
        <p className="m-0 text-[0.8rem] text-amber-200/85">
          No set named “Omens of the Stars” or “Omen of the Stars” was found. Add or rename a set to enable Sync.
        </p>
      ) : null}
    </div>
  );
}
