import { youtubeEmbedSrc, youtubeVideoIdFromInput } from "./youtube";

/**
 * @typedef {{ kind: "none" }} RecordingPlaybackNone
 * @typedef {{ kind: "youtube", videoId: string }} RecordingPlaybackYoutube
 * @typedef {{ kind: "video", src: string }} RecordingPlaybackVideo
 * @typedef {{ kind: "iframe", src: string }} RecordingPlaybackIframe
 * @typedef {RecordingPlaybackNone | RecordingPlaybackYoutube | RecordingPlaybackVideo | RecordingPlaybackIframe} RecordingPlayback
 */

/** @param {string | undefined | null} raw @returns {RecordingPlayback} */
export function resolveRecordingPlayback(raw) {
  const url = String(raw ?? "").trim();
  if (!url) return { kind: "none" };

  const videoId = youtubeVideoIdFromInput(url);
  if (videoId) return { kind: "youtube", videoId };

  if (/\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i.test(url)) {
    return { kind: "video", src: url };
  }

  return { kind: "iframe", src: url };
}

export { youtubeEmbedSrc };
