import { CardFormat } from "../constants/cardFormat";

/**
 * @param {string | null | undefined} fabraryFormat
 * @returns {"Draft" | "Limited" | "Sealed" | null}
 */
function limitedFormatSuffix(fabraryFormat) {
  const f = fabraryFormat != null ? String(fabraryFormat).trim() : "";
  if (f === "Draft" || f === "Limited" || f === "Sealed") return f;
  return null;
}

/**
 * Table/list display name for a deck. Prefer the stored deck name (e.g. Fabrary import title).
 *
 * @param {{ name: string, format: number, set_id?: number | null, fabrary_format?: string | null }} deck
 * @param {Record<number, string>} setNameById
 * @returns {string}
 */
export function deckDisplayName(deck, setNameById) {
  const name = deck.name != null ? String(deck.name).trim() : "";
  if (name) return name;

  const suffix = limitedFormatSuffix(deck.fabrary_format);
  if (
    deck.format === CardFormat.Limited &&
    deck.set_id != null &&
    typeof deck.set_id === "number" &&
    suffix
  ) {
    const setName = setNameById[deck.set_id];
    if (setName) {
      return `${setName} ${suffix}`;
    }
  }
  return name;
}
