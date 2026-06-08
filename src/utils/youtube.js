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

/** @param {string | undefined | null} raw */
export function youtubeStartSecondsFromInput(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return 0;

  let m = s.match(/[?&#]start=(\d+)(?:[&#]|$)/i);
  if (m) return parseInt(m[1], 10);

  m = s.match(/[?&#]t=(\d+)(?:s\b|[&#]|$)/i);
  if (m) return parseInt(m[1], 10);

  m = s.match(/[?&#]t=(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s?)(?:[&#]|$)/i);
  if (m) {
    const h = parseInt(m[1] || "0", 10);
    const min = parseInt(m[2] || "0", 10);
    const sec = parseInt(m[3] || "0", 10);
    if (h > 0 || min > 0 || sec > 0) return h * 3600 + min * 60 + sec;
  }

  return 0;
}

/** @param {string} videoId @param {number | null | undefined} [startSeconds] */
export function youtubeEmbedSrc(videoId, startSeconds) {
  const id = encodeURIComponent(videoId);
  const start =
    startSeconds != null && Number.isFinite(startSeconds) && startSeconds > 0
      ? Math.floor(startSeconds)
      : 0;
  if (start > 0) {
    return `https://www.youtube-nocookie.com/embed/${id}?start=${start}`;
  }
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

/** @param {string} videoId */
export function youtubeThumbnailDefault(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
