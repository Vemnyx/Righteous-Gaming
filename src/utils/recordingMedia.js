import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "./youtube";

/**
 * @typedef {{ kind: "none" }} RecordingPlaybackNone
 * @typedef {{ kind: "youtube", videoId: string, startSeconds?: number }} RecordingPlaybackYoutube
 * @typedef {{ kind: "video", src: string }} RecordingPlaybackVideo
 * @typedef {{ kind: "iframe", src: string }} RecordingPlaybackIframe
 * @typedef {RecordingPlaybackNone | RecordingPlaybackYoutube | RecordingPlaybackVideo | RecordingPlaybackIframe} RecordingPlayback
 */

/** @param {string | undefined | null} raw @param {number | null | undefined} [startSeconds] @returns {RecordingPlayback} */
export function resolveRecordingPlayback(raw, startSeconds) {
  const url = String(raw ?? "").trim();
  if (!url) return { kind: "none" };

  const videoId = youtubeVideoIdFromInput(url);
  if (videoId) {
    const start =
      startSeconds != null && Number.isFinite(startSeconds) && startSeconds > 0
        ? Math.floor(startSeconds)
        : undefined;
    return { kind: "youtube", videoId, startSeconds: start };
  }

  if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url)) {
    return { kind: "video", src: url };
  }

  return { kind: "iframe", src: url };
}

export { youtubeEmbedSrc };
