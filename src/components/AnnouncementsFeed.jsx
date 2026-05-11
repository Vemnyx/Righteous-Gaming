import { useCallback, useEffect, useState } from "react";
import { AnnouncementRightMedia } from "./AnnouncementRightMedia";
import { announcementBodyClassName, sanitizeAnnouncementBodyHtml } from "../utils/announcementDomPurify";

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

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
        setItems(Array.isArray(data.announcements) ? data.announcements : []);
        setExpandedId(null);
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
            const safeBody = sanitizeAnnouncementBodyHtml(row.body_html ?? "");
            return (
              <li key={row.id} className="w-full">
                <div className={`overflow-hidden rounded-2xl ${cardShell}`}>
                  <button
                    type="button"
                    onClick={() => toggleRow(row.id)}
                    aria-expanded={expanded}
                    className={`flex w-full overflow-hidden p-0 text-left transition-colors ${rowHeaderBtn}`}
                  >
                    <div
                      className="relative w-32 shrink-0 self-stretch min-h-[6.75rem] overflow-hidden sm:min-h-[7.5rem] sm:w-40 md:w-44 lg:w-48"
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
                    <div className="flex min-h-[6.75rem] min-w-0 flex-1 flex-col justify-center gap-1.5 px-5 py-4 sm:min-h-[7.5rem] sm:px-6 sm:py-5">
                      <h3 className="m-0 text-lg font-semibold leading-snug text-white sm:text-xl md:text-2xl">
                        {row.title}
                      </h3>
                      <p className="m-0 text-[0.95rem] text-[#f4f0fa]/55 sm:text-base md:text-[1.05rem]">
                        {formatPublishedDate(row.published_at)}
                      </p>
                    </div>
                  </button>
                  {expanded ? (
                    <div className="border-t border-white/[0.1] px-4 py-5 sm:px-6 sm:py-6">
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-stretch lg:gap-8">
                        <div className="min-w-0 flex-1 lg:max-w-[min(100%,42rem)]">
                          <h2 className="m-0 text-xl font-bold tracking-tight text-white sm:text-2xl">
                            {row.title}
                          </h2>
                          <p className="mb-4 mt-1.5 text-[0.8rem] text-[#f4f0fa]/50">
                            {formatDateTime(row.published_at)}
                          </p>
                          <div
                            className={announcementBodyClassName}
                            dangerouslySetInnerHTML={{ __html: safeBody }}
                          />
                        </div>
                        <div className="flex w-full shrink-0 flex-col lg:ml-auto lg:w-[min(100%,28rem)] lg:max-w-[50%] xl:w-[min(100%,32rem)]">
                          <AnnouncementRightMedia
                            youtubeUrl={row.youtube_url}
                            imageUrl={row.youtube_url ? null : row.image_url}
                            className="min-h-[12rem] lg:min-h-[14rem]"
                            emptyLabel="No image or video"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
