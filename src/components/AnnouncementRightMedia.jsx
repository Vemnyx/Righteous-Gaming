import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "../utils/youtube";

/**
 * Hero media for announcements: YouTube embed when `youtubeUrl` is set, else cover `imageUrl`.
 *
 * @param {{
 *   youtubeUrl?: string | null,
 *   imageUrl?: string | null,
 *   className?: string,
 *   emptyLabel?: string,
 *   flush?: boolean,
 * }} props
 */
export function AnnouncementRightMedia({
  youtubeUrl,
  imageUrl,
  className = "",
  emptyLabel = "No media",
  flush = false,
}) {
  const vid = youtubeVideoIdFromInput(youtubeUrl ?? "");

  const cardShell = `flex w-full max-w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-black/35 ${className}`.trim();
  const flushShell = `relative flex min-h-[12rem] h-full w-full max-w-full min-w-0 flex-1 flex-col overflow-hidden border-l border-white/[0.1] bg-black/35 lg:min-h-0 ${className}`.trim();

  if (vid) {
    if (flush) {
      return (
        <div className={flushShell}>
          <div className="absolute inset-0 min-h-[12rem] min-w-0 max-w-full overflow-hidden lg:min-h-0">
            <iframe
              className="h-full w-full min-w-0 max-w-full border-0"
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
      return (
        <div className={flushShell}>
          <img
            src={imageUrl}
            alt=""
            className="absolute inset-0 box-border h-full max-h-full w-full max-w-full min-h-0 min-w-0 object-cover object-center"
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
      className={`flex min-h-[12rem] w-full max-w-full min-w-0 flex-1 items-center justify-center border border-dashed border-white/[0.18] bg-black/20 text-center text-[0.85rem] text-[#f4f0fa]/45 lg:min-h-0 ${
        flush ? "rounded-none border-y-0 border-r-0 border-l" : "rounded-xl"
      } ${className}`}
    >
      {emptyLabel}
    </div>
  );
}
