import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnnouncementRightMedia } from "./AnnouncementRightMedia";
import { announcementBodyClassName, sanitizeAnnouncementBodyHtml } from "../utils/announcementDomPurify";
import { youtubeVideoIdFromInput } from "../utils/youtube";

/** @param {string | undefined | null} iso */
function formatDateTime(iso) {
  if (iso == null || iso === "") return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Expanded announcement layout (public tab): title + datetime + body on the left; hero media on the right. At lg+, columns share width evenly (50/50).
 *
 * @param {{
 *   title: string,
 *   publishedAtIso?: string | null,
 *   bodyHtml: string,
 *   youtubeUrl?: string | null,
 *   imageUrl?: string | null,
 *   unpublishedLabel?: string,
 * }} props
 */
export function AnnouncementExpandedLayout({
  title,
  publishedAtIso,
  bodyHtml,
  youtubeUrl,
  imageUrl,
  unpublishedLabel = "Not published yet",
}) {
  const safeBody = sanitizeAnnouncementBodyHtml(bodyHtml ?? "");
  const dateLine =
    publishedAtIso != null && String(publishedAtIso).trim() !== ""
      ? formatDateTime(publishedAtIso)
      : unpublishedLabel;

  const youtubeFlush = youtubeVideoIdFromInput(youtubeUrl ?? "") != null;
  const heroImageSrc =
    !youtubeFlush && imageUrl != null && String(imageUrl).trim() !== "" ? String(imageUrl).trim() : null;

  /** @type {[{ src: string, alt: string } | null, (v: { src: string, alt: string } | null) => void]} */
  const [lightbox, setLightbox] = useState(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox]);

  const onBodyClick = useCallback((e) => {
    if (!(e.target instanceof HTMLImageElement)) return;
    const src = e.target.currentSrc || e.target.getAttribute("src") || "";
    if (!src.trim()) return;
    e.preventDefault();
    setLightbox({ src: src.trim(), alt: (e.target.alt || "").trim() });
  }, []);

  const openHeroLightbox = useCallback(() => {
    if (!heroImageSrc) return;
    const altBase = (title || "").trim() || "Announcement";
    setLightbox({ src: heroImageSrc, alt: `${altBase} — hero image` });
  }, [heroImageSrc, title]);

  return (
    <>
      <div className="flex min-h-[min(28rem,72vh)] flex-col lg:min-h-[min(24rem,62vh)] lg:flex-row lg:items-stretch lg:overflow-visible">
        <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-5 sm:px-6 sm:py-6 lg:basis-0 lg:py-7 xl:px-8">
          <div className="min-w-0">
            <h2 className="m-0 text-xl font-bold tracking-tight text-white sm:text-2xl">
              {title.trim() || "Untitled"}
            </h2>
            <p className="mb-0 mt-1.5 text-[0.8rem] text-[#f4f0fa]/50">{dateLine}</p>
          </div>
          <div
            className={announcementBodyClassName}
            role="presentation"
            onClick={onBodyClick}
            dangerouslySetInnerHTML={{ __html: safeBody }}
          />
        </div>
        <div
          className={`relative flex w-full min-w-0 max-w-full flex-1 flex-col overflow-x-hidden lg:basis-0 lg:self-stretch lg:min-h-0 ${
            youtubeFlush ? "overflow-y-hidden" : "overflow-y-visible"
          }`}
        >
          <AnnouncementRightMedia
            flush
            youtubeUrl={youtubeUrl}
            imageUrl={youtubeUrl ? null : imageUrl}
            emptyLabel="No image or video"
            onFlushImageClick={heroImageSrc ? openHeroLightbox : undefined}
          />
        </div>
      </div>

      {lightbox && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[10001] cursor-default bg-black/80 p-3 sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-label={lightbox.alt ? `Image: ${lightbox.alt}` : "Announcement image"}
              onClick={closeLightbox}
            >
              {/* pointer-events-none so clicks beside the image hit the backdrop and close; image subtree is pointer-events-auto */}
              <div className="pointer-events-none flex h-full w-full items-center justify-center">
                <div
                  className="pointer-events-auto flex max-h-[85vh] max-w-[min(100%,96vw)] items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={lightbox.src}
                    alt={lightbox.alt || "Announcement image"}
                    className="max-h-[85vh] max-w-full object-contain select-none"
                    draggable={false}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
