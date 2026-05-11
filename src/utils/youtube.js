/** @param {string | undefined | null} raw */
export function youtubeVideoIdFromInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  let m = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})(?=[?&#/]|$)/);
  if (m) return m[1];
  m = s.match(/[?&]v=([a-zA-Z0-9_-]{11})(?=[&#]|$)/);
  if (m) return m[1];
  m = s.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})(?=[?&#]|$)/);
  if (m) return m[1];
  m = s.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})(?=[?&#/]|$)/);
  if (m) return m[1];
  return null;
}

/** @param {string} videoId */
export function youtubeWatchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

/** @param {string} videoId */
export function youtubeEmbedSrc(videoId) {
  return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`;
}

/** @param {string} videoId */
export function youtubeThumbnailDefault(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
