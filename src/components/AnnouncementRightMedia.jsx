import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "../utils/youtube";

/**
 * Hero media for announcements: YouTube embed when `youtubeUrl` is set, else cover `imageUrl`.
 *
 * @param {{
 *   youtubeUrl?: string | null,
 *   imageUrl?: string | null,
 *   className?: string,
 *   emptyLabel?: string,
 * }} props
 */
export function AnnouncementRightMedia({
  youtubeUrl,
  imageUrl,
  className = "",
  emptyLabel = "No media",
}) {
  const vid = youtubeVideoIdFromInput(youtubeUrl ?? "");
  const shell = `flex w-full flex-1 flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-black/35 ${className}`;

  if (vid) {
    return (
      <div className={shell}>
        <iframe
          className="aspect-video h-auto min-h-0 w-full border-0"
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
    return (
      <div className={`${shell} min-h-[12rem]`}>
        <img
          src={imageUrl}
          alt=""
          className="h-full min-h-[12rem] w-full flex-1 object-cover object-center"
        />
      </div>
    );
  }

  return (
    <div
      className={`flex min-h-[12rem] w-full flex-1 items-center justify-center rounded-xl border border-dashed border-white/[0.18] bg-black/20 text-center text-[0.85rem] text-[#f4f0fa]/45 ${className}`}
    >
      {emptyLabel}
    </div>
  );
}
