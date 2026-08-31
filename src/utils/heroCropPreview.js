/** Matches backend herocrop.PortraitBanner */
export const PORTRAIT_BANNER = {
  x: 0.13,
  w: 0.74,
  h: 0.2,
  fallbackCenterY: 0.3,
};

/**
 * Normalized crop rect (0–1) for a portrait banner centered on a point.
 * Mirrors backend herocrop.BannerSpec.Bounds logic.
 *
 * @param {number} centerX
 * @param {number} centerY
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
export function bannerRectForCenter(centerX, centerY) {
  const { x: frameX, w, h } = PORTRAIT_BANNER;
  let x0 = centerX - w / 2;
  let y0 = centerY - h / 2;

  if (x0 < frameX) x0 = frameX;
  const maxX = 1 - w;
  if (x0 > maxX) x0 = maxX;
  if (x0 < 0) x0 = 0;

  if (y0 < 0) y0 = 0;
  const maxY = 1 - h;
  if (y0 > maxY) y0 = maxY;

  return { x: x0, y: y0, w, h };
}

/**
 * Map a click on an object-contain image to normalized card coordinates.
 *
 * @param {MouseEvent | React.MouseEvent} event
 * @param {HTMLImageElement} imgEl
 * @returns {{ x: number, y: number } | null}
 */
export function clickToNormalizedImagePoint(event, imgEl) {
  if (!imgEl || !imgEl.naturalWidth || !imgEl.naturalHeight) return null;

  const rect = imgEl.getBoundingClientRect();
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;
  const scale = Math.min(rect.width / nw, rect.height / nh);
  const renderedW = nw * scale;
  const renderedH = nh * scale;
  const offsetX = (rect.width - renderedW) / 2;
  const offsetY = (rect.height - renderedH) / 2;

  const clickX = event.clientX - rect.left - offsetX;
  const clickY = event.clientY - rect.top - offsetY;
  if (clickX < 0 || clickY < 0 || clickX > renderedW || clickY > renderedH) return null;

  return { x: clickX / renderedW, y: clickY / renderedH };
}
