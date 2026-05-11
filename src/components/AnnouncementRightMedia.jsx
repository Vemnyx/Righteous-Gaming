import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "../utils/youtube";

/**
 * Hero media for announcements: YouTube embed when `youtubeUrl` is set, else image.
 * Flush mode: full column width. YouTube fills column height at lg+; images use intrinsic height (`object-contain`), vertically centered in the column when shorter than the row.
 *
 * @param {{
 *   youtubeUrl?: string | null,
 *   imageUrl?: string | null,
 *   className?: string,
 *   emptyLabel?: string,
 *   flush?: boolean,
 *   onFlushImageClick?: () => void,
 * }} props
 */
export function AnnouncementRightMedia({
  youtubeUrl,
  imageUrl,
  className = "",
  emptyLabel = "No media",
  flush = false,
  onFlushImageClick,
}) {
  const vid = youtubeVideoIdFromInput(youtubeUrl ?? "");

  const cardShell = `flex w-full max-w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-black/35 ${className}`.trim();
  /** Flush: width locked to column; height from media (aspect / intrinsic). Vertical may extend past shell; horizontal clipped. */
  const flushShell = `relative flex w-full max-w-full min-w-0 flex-col overflow-x-hidden overflow-y-visible border-l border-white/[0.1] bg-black/35 ${className}`.trim();

  if (vid) {
    if (flush) {
      const flushYoutubeShell = `${flushShell} max-lg:overflow-x-hidden max-lg:overflow-y-visible lg:flex-1 lg:min-h-0 lg:h-full lg:overflow-hidden`.trim();
      return (
        <div className={flushYoutubeShell}>
          <div className="relative w-full max-w-full min-w-0 max-lg:block lg:absolute lg:inset-0 lg:min-h-0">
            <iframe
              className="aspect-video h-auto w-full min-w-0 max-w-full border-0 lg:absolute lg:inset-0 lg:h-full lg:w-full lg:aspect-auto"
              src={youtubeEmbedSrc(vid)}
              title="YouTube video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </div>
      );
    }
    return (
      <div className={cardShell}>
        <iframe
          className="aspect-video h-auto min-h-0 w-full min-w-0 max-w-full border-0"
          src={youtubeEmbedSrc(vid)}
          title="YouTube video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  }

  if (imageUrl) {
    if (flush) {
      const flushImageShell = `${flushShell} flex-1 min-h-0 justify-center`.trim();
      const heroImgInteractive = Boolean(onFlushImageClick);
      return (
        <div className={flushImageShell}>
          <img
            src={imageUrl}
            alt=""
            role={heroImgInteractive ? "button" : undefined}
            tabIndex={heroImgInteractive ? 0 : undefined}
            onClick={onFlushImageClick}
            onKeyDown={
              heroImgInteractive
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onFlushImageClick();
                    }
                  }
                : undefined
            }
            className={`box-border block h-auto w-full max-w-full min-w-0 shrink-0 object-contain object-center ${
              heroImgInteractive ? "cursor-zoom-in outline-none focus-visible:ring-2 focus-visible:ring-purple-400/55" : ""
            }`}
          />
        </div>
      );
    }
    return (
      <div className={`${cardShell} min-h-[12rem]`}>
        <img
          src={imageUrl}
          alt=""
          className="h-full min-h-[12rem] w-full min-w-0 max-w-full flex-1 object-cover object-center"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[12rem] w-full max-w-full min-w-0 flex-1 items-center justify-center overflow-x-hidden overflow-y-visible border border-dashed border-white/[0.18] bg-black/20 text-center text-[0.85rem] text-[#f4f0fa]/45 lg:min-h-0 ${
        flush ? "rounded-none border-y-0 border-r-0 border-l" : "rounded-xl"
      } ${className}`}
    >
      {emptyLabel}
    </div>
  );
}
