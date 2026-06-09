import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../auth/AuthContext";

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/**
 * @param {{ isLight: boolean, active: boolean, onOpenEvent?: (id: number) => void }} props
 */
export function EventsAdmin({ isLight, active, onOpenEvent }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {object[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [reloadSeq, setReloadSeq] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [eventUrl, setEventUrl] = useState("");
  const [dayCount, setDayCount] = useState("3");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/admin/events", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
        const data = await res.json();
        if (!cancelled) setRows(Array.isArray(data.events) ? data.events : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load events");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, user, reloadSeq]);

  const onCreate = useCallback(async () => {
    if (!user || creating) return;
    const url = eventUrl.trim();
    if (!url) {
      setCreateError("Event URL is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/events", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ event_url: url, day_count: Number(dayCount) }),
      });
      if (!res.ok) throw new Error((await res.text()).trim() || res.statusText);
      setModalOpen(false);
      setEventUrl("");
      setDayCount("3");
      setReloadSeq((n) => n + 1);
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : "Failed to create event");
    } finally {
      setCreating(false);
    }
  }, [user, creating, eventUrl, dayCount]);

  const tableChromeBorder = isLight ? "border-white/[0.12]" : "border-white/[0.24] ring-1 ring-white/[0.05]";
  const tableHeadBorder = isLight ? "border-white/12" : "border-white/[0.20]";
  const tableRowBorder = isLight ? "border-white/[0.08]" : "border-white/[0.12]";
  const btnPrimary =
    "rounded-lg border border-white/[0.22] bg-gradient-to-br from-[#7b4cb8] to-[#5a2f8f] px-4 py-2 text-[0.8125rem] font-semibold text-white shadow-[0_3px_14px_rgba(90,47,143,0.38)] hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-45";
  const panel = isLight
    ? "border border-white/[0.14] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_24px_80px_rgba(0,0,0,0.45)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.96)] shadow-[0_24px_80px_rgba(0,0,0,0.5)]";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Events</h2>
        <button type="button" className={`shrink-0 self-start sm:self-auto ${btnPrimary}`} onClick={() => setModalOpen(true)}>
          Add event
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
        <table className="w-full min-w-[42rem] border-collapse text-left text-[0.8125rem] text-[#f4f0fa]/90">
          <thead>
            <tr className={`border-b text-[0.68rem] uppercase tracking-wider text-[#f4f0fa]/55 ${tableHeadBorder}`}>
              <th className="px-3 py-2.5 font-semibold sm:px-4">ID</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Title</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Days</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Event URL</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">Created</th>
              <th className="px-3 py-2.5 font-semibold sm:px-4">View</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#f4f0fa]/60">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-[#f4f0fa]/60">
                  No events yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className={`border-b ${tableRowBorder} last:border-b-0 hover:bg-white/[0.03]`}>
                  <td className="px-3 py-2.5 tabular-nums sm:px-4">{row.id}</td>
                  <td className="px-3 py-2.5 sm:px-4">{row.title || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums sm:px-4">{row.day_count ?? "—"}</td>
                  <td className="max-w-[14rem] truncate px-3 py-2.5 sm:max-w-[18rem] sm:px-4">
                    <a href={row.event_url} target="_blank" rel="noopener noreferrer" className="text-purple-200/90 underline">
                      {row.event_url}
                    </a>
                  </td>
                  <td className="px-3 py-2.5 sm:px-4">{formatDateTime(row.created_at)}</td>
                  <td className="px-3 py-2.5 sm:px-4">
                    {onOpenEvent ? (
                      <button type="button" className="text-purple-200/90 underline" onClick={() => onOpenEvent(row.id)}>
                        Open
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {modalOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-event-title"
              onClick={() => !creating && setModalOpen(false)}
            >
              <div
                className={`w-full max-w-md rounded-xl p-5 ${panel}`}
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="add-event-title" className="m-0 text-[1.05rem] font-semibold text-[#f4f0fa]">
                  Add event
                </h3>
                <p className="mt-2 text-[0.85rem] text-[#f4f0fa]/70">
                  Paste the FabTCG organised-play event URL. Coverage days are scraped from the event page.
                </p>
                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Event URL</span>
                  <input
                    type="url"
                    className="w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
                    placeholder="https://fabtcg.com/organised-play/..."
                    value={eventUrl}
                    disabled={creating}
                    onChange={(e) => setEventUrl(e.target.value)}
                  />
                </label>
                <label className="mt-3 flex flex-col gap-1.5">
                  <span className="text-[0.78rem] font-semibold uppercase tracking-wide text-[#f4f0fa]/55">Days</span>
                  <select
                    className="w-full rounded-lg border border-white/[0.22] bg-black/35 px-3 py-2 text-[0.875rem] text-[#f4f0fa] outline-none focus:border-purple-400/55"
                    value={dayCount}
                    disabled={creating}
                    onChange={(e) => setDayCount(e.target.value)}
                  >
                    <option value="1">1 day</option>
                    <option value="2">2 days</option>
                    <option value="3">3 days</option>
                  </select>
                </label>
                {createError ? <p className="mt-3 text-[0.85rem] text-red-200/90">{createError}</p> : null}
                <div className="mt-5 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/25 bg-black/25 px-3 py-2 text-[0.8125rem] text-[#f4f0fa] disabled:opacity-40"
                    disabled={creating}
                    onClick={() => setModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className={btnPrimary} disabled={creating} onClick={() => void onCreate()}>
                    {creating ? "Creating…" : "Create"}
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
