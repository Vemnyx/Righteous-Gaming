import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";

/**
 * @param {{ isLight: boolean, active: boolean, onOpenEvent: (id: number) => void }} props
 */
export function EventsList({ isLight, active, onOpenEvent }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(/** @type {object[]} */ ([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(/** @type {string | null} */ (null));

  useEffect(() => {
    if (!active || !user) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/events", { headers: { Authorization: `Bearer ${token}` } });
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
  }, [active, user]);

  const cardCls = isLight
    ? "rounded-xl border border-white/[0.14] bg-black/25 p-4 shadow-sm transition hover:border-white/25 hover:bg-black/30"
    : "rounded-xl border border-white/[0.12] bg-black/35 p-4 shadow-sm transition hover:border-white/20";

  return (
    <div className="flex w-full flex-1 flex-col gap-4 px-1 py-2 sm:px-2">
      <h2 className="m-0 text-left text-lg font-semibold tracking-tight text-[#f4f0fa]">Events</h2>
      {error ? (
        <div className="rounded-xl border border-red-400/35 bg-red-950/40 px-4 py-3 text-[0.875rem] text-red-100/95">{error}</div>
      ) : null}
      {loading ? <p className="text-[#f4f0fa]/65">Loading events…</p> : null}
      {!loading && rows.length === 0 ? <p className="text-[#f4f0fa]/65">No events yet.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((ev) => (
          <button
            key={ev.id}
            type="button"
            className={`${cardCls} cursor-pointer text-left`}
            onClick={() => onOpenEvent(ev.id)}
          >
            {ev.image_url ? (
              <img src={ev.image_url} alt="" className="mb-3 aspect-video w-full rounded-lg object-cover" loading="lazy" />
            ) : (
              <div className="mb-3 flex aspect-video w-full items-center justify-center rounded-lg bg-black/40 text-[0.8rem] text-[#f4f0fa]/45">
                No image
              </div>
            )}
            <h3 className="m-0 text-[1rem] font-semibold text-[#f4f0fa]">{ev.title || `Event #${ev.id}`}</h3>
            {ev.date_text ? <p className="m-0 mt-1 text-[0.82rem] text-[#f4f0fa]/65">{ev.date_text}</p> : null}
            {ev.venue ? <p className="m-0 mt-0.5 line-clamp-2 text-[0.78rem] text-[#f4f0fa]/50">{ev.venue}</p> : null}
            <p className="m-0 mt-2 text-[0.75rem] text-[#f4f0fa]/45">{ev.day_count} day{ev.day_count === 1 ? "" : "s"}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
