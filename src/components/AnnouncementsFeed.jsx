import { useCallback, useEffect, useState } from "react";
import DOMPurify from "dompurify";

const announcementTextAlignStyle = /^\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*$/i;

/** Must match backend `announcementYoutubeEmbedSrcPattern` (TipTap youtube embed URLs). */
const announcementYoutubeEmbedSrc =
  /^https:\/\/(www\.youtube-nocookie\.com|www\.youtube\.com|youtube\.com)\/embed\/(?:videoseries|[\w-]+)(?:\?[\w&=%.\-]*)?$/i;

let announcementPurifyHooksInstalled = false;
function ensureAnnouncementPurifyHooks() {
  if (announcementPurifyHooksInstalled) return;
  announcementPurifyHooksInstalled = true;
  DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
    if (data.attrName !== "style") return;
    const v = String(data.attrValue ?? "").trim();
    if (!announcementTextAlignStyle.test(v)) {
      data.keepAttr = false;
    }
  });
  DOMPurify.addHook("uponSanitizeElement", (node) => {
    if (node.nodeName !== "IFRAME") return;
    const src = node.getAttribute("src")?.trim() ?? "";
    if (!announcementYoutubeEmbedSrc.test(src)) {
      node.textContent = "";
      node.remove();
    }
  });
}

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
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const openDetail = useCallback(
    async (id) => {
      setDetailLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/announcements/${id}`);
        if (!res.ok) throw new Error(await res.text());
        const row = await res.json();
        setDetail(row);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load announcement");
        setDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const back = useCallback(() => {
    setDetail(null);
  }, []);

  const cardShell = isLight
    ? "border border-white/[0.12] bg-gradient-to-b from-[#434054] to-[#2d2a38] shadow-[0_12px_40px_rgba(0,0,0,0.25)]"
    : "border border-white/[0.2] bg-[rgba(12,6,22,0.55)] shadow-[0_12px_40px_rgba(0,0,0,0.35)]";

  if (detail || detailLoading) {
    ensureAnnouncementPurifyHooks();
    const html = detail?.body_html
      ? DOMPurify.sanitize(detail.body_html, {
          USE_PROFILES: { html: true },
          ADD_TAGS: ["iframe"],
          ADD_ATTR: [
            "style",
            "data-youtube-video",
            "data-text-align",
            "src",
            "width",
            "height",
            "title",
            "frameborder",
            "allowfullscreen",
            "allow",
            "referrerpolicy",
            "loading",
          ],
        })
      : "";
    return (
      <div className="-mx-8 -mt-4 flex min-h-0 flex-1 flex-col gap-3 px-3 text-left sm:-mx-10 sm:-mt-6 sm:px-4">
        <button
          type="button"
          onClick={back}
          disabled={detailLoading}
          className={`self-start rounded-lg border px-3 py-1.5 text-[0.8125rem] font-semibold transition-colors disabled:opacity-50 ${
            isLight
              ? "border-white/25 bg-black/25 text-[#f4f0fa] hover:bg-black/35"
              : "border-white/[0.28] bg-black/25 text-[#f4f0fa] hover:bg-black/35"
          }`}
        >
          ← All announcements
        </button>
        {detailLoading ? (
          <p className="text-[0.9rem] text-[#f4f0fa]/70">Loading…</p>
        ) : detail ? (
          <article className={`rounded-2xl p-6 sm:p-8 ${cardShell}`}>
            {detail.thumbnail_url ? (
              <img
                src={detail.thumbnail_url}
                alt=""
                className="mb-5 max-h-56 w-full rounded-xl object-cover object-center"
              />
            ) : null}
            <h1 className="m-0 mb-3 text-2xl font-bold tracking-tight text-white">{detail.title}</h1>
            <p className="mb-6 text-[0.8rem] text-[#f4f0fa]/50">
              {formatDateTime(detail.published_at)}
            </p>
            <div
              className="announcement-body max-w-none text-[0.95rem] leading-relaxed text-[#f4f0fa]/92 [&_a]:text-violet-300 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-semibold [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img[data-text-align=center]]:mx-auto [&_img[data-text-align=right]]:ml-auto [&_img[data-text-align=right]]:mr-0 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_[data-youtube-video]]:my-5 [&_[data-youtube-video]]:w-full [&_[data-youtube-video]]:max-w-[min(100%,40rem)] [&_[data-youtube-video]_iframe]:aspect-video [&_[data-youtube-video]_iframe]:h-auto [&_[data-youtube-video]_iframe]:w-full [&_[data-youtube-video]_iframe]:rounded-lg [&_[data-youtube-video]_iframe]:border-0"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </article>
        ) : null}
      </div>
    );
  }

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
          {items.map((row) => (
            <li key={row.id} className="w-full">
              <button
                type="button"
                onClick={() => openDetail(row.id)}
                className={`flex w-full overflow-hidden rounded-2xl p-0 text-left transition-colors ${cardShell} hover:border-white/30`}
              >
                <div
                  className="relative w-32 shrink-0 self-stretch min-h-[6.75rem] overflow-hidden rounded-l-2xl sm:min-h-[7.5rem] sm:w-40 md:w-44 lg:w-48"
                  aria-hidden={!row.thumbnail_url}
                >
                  {row.thumbnail_url ? (
                    <img
                      src={row.thumbnail_url}
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
