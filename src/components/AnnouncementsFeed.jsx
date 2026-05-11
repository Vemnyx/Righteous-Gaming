import { useCallback, useEffect, useState } from "react";
import { AnnouncementExpandedLayout } from "./AnnouncementExpandedLayout";

/** @param {string | undefined | null} iso */
function formatPublishedDate(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/**
 * @param {{ isLight: boolean, active: boolean }} props
 */
export function AnnouncementsFeed({ isLight, active }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedId, setExpandedId] = useState(/** @type {number | null} */ (null));

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/announcements");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        const list = Array.isArray(data.announcements) ? data.announcements : [];
        setItems(list);
        setExpandedId(list.length > 0 ? list[0].id : null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const toggleRow = useCallback((id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const cardShell = isLight
    ? "border border-white/[0.12] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.55)] shadow-[0_12px_40px_rgba(0,0,0,0.35)]";

  const rowHeaderBtn = isLight
    ? "hover:bg-white/[0.04] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/40"
    : "hover:bg-white/[0.05] focus-visible:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/35";

  return (
    <div className="-mx-8 -mt-4 flex min-h-0 flex-1 flex-col gap-2 px-3 text-left sm:-mx-10 sm:-mt-6 sm:px-4">
      {error ? (
        <p className="rounded-lg border border-red-400/35 bg-red-950/40 px-3 py-2 text-[0.85rem] text-red-100">
          {error}
        </p>
      ) : null}
      {loading ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/65">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-[0.9rem] text-[#f4f0fa]/60">No announcements yet.</p>
      ) : (
        <ul className="m-0 flex w-full list-none flex-col gap-2 p-0">
          {items.map((row) => {
            const expanded = expandedId === row.id;
            return (
              <li key={row.id} className="w-full">
                <div
                  className={`rounded-2xl ${cardShell} ${
                    expanded ? "overflow-x-hidden overflow-y-visible" : "overflow-hidden"
                  }`}
                >
                  {!expanded ? (
                    <button
                      type="button"
                      onClick={() => toggleRow(row.id)}
                      aria-expanded={false}
                      className={`flex w-full min-h-[6.75rem] overflow-hidden p-0 text-left transition-colors sm:min-h-[7.5rem] ${rowHeaderBtn}`}
                    >
                      <div
                        className="relative w-32 shrink-0 self-stretch overflow-hidden sm:w-40 md:w-44 lg:w-48"
                        aria-hidden={!row.image_url}
                      >
                        {row.image_url ? (
                          <img
                            src={row.image_url}
                            alt=""
                            className="absolute inset-0 h-full w-full object-cover object-center"
                          />
                        ) : (
                          <div className="absolute inset-0 bg-white/[0.07]" />
                        )}
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-5 py-4 sm:px-6 sm:py-5">
                        <h3 className="m-0 text-lg font-semibold leading-snug text-white sm:text-xl md:text-2xl">
                          {row.title}
                        </h3>
                        <p className="m-0 text-[0.95rem] text-[#f4f0fa]/55 sm:text-base md:text-[1.05rem]">
                          {formatPublishedDate(row.published_at)}
                        </p>
                      </div>
                    </button>
                  ) : (
                    <div role="region" aria-label={row.title}>
                      <AnnouncementExpandedLayout
                        title={row.title}
                        publishedAtIso={row.published_at}
                        bodyHtml={row.body_html ?? ""}
                        youtubeUrl={row.youtube_url}
                        imageUrl={row.image_url}
                        unpublishedLabel="—"
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
