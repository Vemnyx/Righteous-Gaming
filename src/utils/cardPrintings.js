/** @typedef {{ image_url?: string | null } | null | undefined} CardPrintingLike */

/**
 * @typedef {{
 *   id?: number,
 *   set_code?: string,
 *   set_num?: number,
 *   set_name?: string | null,
 *   rarity?: number | null,
 *   image_url?: string | null,
 * } | null | undefined} CardPrintingRow
 */

/** FAB-style collector number: OMN001 */
export function formatCollectorCode(setCode, setNum) {
  const code = String(setCode ?? "").trim();
  const n = Math.max(0, Number(setNum) || 0);
  return `${code}${String(n).padStart(3, "0")}`;
}

/** @param {{ printings?: CardPrintingRow[] | null } | null | undefined} card */
export function cardPrintings(card) {
  return Array.isArray(card?.printings) ? card.printings : [];
}

/** @param {CardPrintingRow} printing */
export function printingImageUrl(printing) {
  const url = printing?.image_url;
  if (url == null) return null;
  const trimmed = String(url).trim();
  return trimmed !== "" ? trimmed : null;
}

/**
 * Image URL from the first printing on a card payload, if any.
 * @param {{ printings?: CardPrintingLike[] | null } | null | undefined} card
 * @returns {string | null}
 */
export function cardImageUrl(card) {
  return printingImageUrl(cardPrintings(card)[0]);
}

/**
 * Full set display name for a printing (API set_name, then sets lookup by code, else code).
 * @param {CardPrintingRow} printing
 * @param {Record<string, string>} [setNameByCode]
 * @returns {string}
 */
export function resolvePrintingSetName(printing, setNameByCode = {}) {
  const direct = printing?.set_name?.trim();
  if (direct) return direct;

  const code = printing?.set_code?.trim();
  if (code) {
    const fromMap = setNameByCode[code]?.trim();
    if (fromMap) return fromMap;
    const lower = code.toLowerCase();
    for (const [key, value] of Object.entries(setNameByCode)) {
      if (key.toLowerCase() === lower && String(value ?? "").trim()) {
        return String(value).trim();
      }
    }
    return code;
  }

  return "Unknown set";
}

/**
 * @param {CardPrintingRow} printing
 * @param {Record<string, string>} [setNameByCode]
 * @returns {string}
 */
export function printingSetLabel(printing, setNameByCode) {
  return resolvePrintingSetName(printing, setNameByCode);
}

/**
 * @param {CardPrintingRow} printing
 * @param {Record<string, string>} [setNameByCode]
 * @returns {string}
 */
export function printingSummary(printing, setNameByCode) {
  const label = resolvePrintingSetName(printing, setNameByCode);
  const code = formatCollectorCode(printing?.set_code, printing?.set_num);
  return `${label} · ${code}`;
}

/**
 * @param {CardPrintingRow[] | null | undefined} printings
 * @param {number | null | undefined} selectedId
 * @returns {CardPrintingRow | null}
 */
export function selectedPrinting(printings, selectedId) {
  const rows = Array.isArray(printings) ? printings : [];
  if (rows.length === 0) return null;
  if (selectedId != null) {
    const match = rows.find((p) => p && p.id === selectedId);
    if (match) return match;
  }
  return rows[0] ?? null;
}
