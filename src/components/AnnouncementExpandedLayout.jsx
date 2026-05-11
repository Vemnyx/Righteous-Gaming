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

  return (
    <div className="flex min-h-[min(28rem,72vh)] flex-col lg:min-h-[min(24rem,62vh)] lg:flex-row lg:items-stretch lg:overflow-visible">
      <div className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-5 sm:px-6 sm:py-6 lg:basis-0 lg:py-7 xl:px-8">
        <div className="min-w-0">
          <h2 className="m-0 text-xl font-bold tracking-tight text-white sm:text-2xl">
            {title.trim() || "Untitled"}
          </h2>
          <p className="mb-0 mt-1.5 text-[0.8rem] text-[#f4f0fa]/50">{dateLine}</p>
        </div>
        <div className={announcementBodyClassName} dangerouslySetInnerHTML={{ __html: safeBody }} />
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
        />
      </div>
    </div>
  );
}
