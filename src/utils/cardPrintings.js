/** @typedef {{ image_url?: string | null } | null | undefined} CardPrintingLike */

/**
 * Image URL from the first printing on a card payload, if any.
 * @param {{ printings?: CardPrintingLike[] | null } | null | undefined} card
 * @returns {string | null}
 */
export function cardImageUrl(card) {
  const url = card?.printings?.[0]?.image_url;
  if (url == null) return null;
  const trimmed = String(url).trim();
  return trimmed !== "" ? trimmed : null;
}
