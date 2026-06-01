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
 * Table/list display name for a deck. Limited-family formats with a set show "{Set Name} Draft|Limited|Sealed".
 *
 * @param {{ name: string, format: number, set_id?: number | null, fabrary_format?: string | null }} deck
 * @param {Record<number, string>} setNameById
 * @returns {string}
 */
export function deckDisplayName(deck, setNameById) {
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
  return deck.name;
}
