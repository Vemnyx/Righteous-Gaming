import { CardType } from "../constants/cardType";

/**
 * @typedef {{
 *   card_id: number,
 *   mainboard: boolean,
 *   count: number,
 *   card: {
 *     id: number,
 *     name: string,
 *     type: number,
 *     pitch?: number | null,
 *     card_identifier?: string | null,
 *     image_url?: string | null,
 *     printings?: { image_url?: string | null }[],
 *   },
 * }} DeckCardLine
 */

/**
 * @param {DeckCardLine[]} lines
 * @returns {number}
 */
export function sectionCardCount(lines) {
  let n = 0;
  for (const line of lines) {
    n += line.count > 0 ? line.count : 1;
  }
  return n;
}

/**
 * @param {DeckCardLine} a
 * @param {DeckCardLine} b
 * @returns {number}
 */
function sortByPitchThenName(a, b) {
  const pa = a.card?.pitch ?? 99;
  const pb = b.card?.pitch ?? 99;
  if (pa !== pb) return pa - pb;
  return String(a.card?.name ?? "").localeCompare(String(b.card?.name ?? ""), undefined, { sensitivity: "base" });
}

/**
 * @param {DeckCardLine} line
 * @returns {number}
 */
function heroArenaSortKey(line) {
  const t = line.card?.type;
  if (t === CardType.Hero || t === CardType.DemiHero) return 0;
  if (t === CardType.Equipment) return 1;
  if (t === CardType.Weapon) return 2;
  return 3;
}

/**
 * Splits deck lines into Fabrary-style sections.
 * Hero + arena: mainboard hero, equipment, and weapons.
 * Deck: other mainboard cards.
 * Inventory: sideboard non-tokens.
 * Tokens: all token-type cards.
 *
 * @param {DeckCardLine[]} lines
 */
export function partitionDeckCards(lines) {
  /** @type {DeckCardLine[]} */
  const heroArena = [];
  /** @type {DeckCardLine[]} */
  const deck = [];
  /** @type {DeckCardLine[]} */
  const inventory = [];
  /** @type {DeckCardLine[]} */
  const tokens = [];

  for (const line of lines) {
    const t = line.card?.type;
    if (t === CardType.Token) {
      tokens.push(line);
      continue;
    }
    if (line.mainboard) {
      if (t === CardType.Hero || t === CardType.DemiHero || t === CardType.Equipment || t === CardType.Weapon) {
        heroArena.push(line);
      } else {
        deck.push(line);
      }
    } else {
      inventory.push(line);
    }
  }

  heroArena.sort((a, b) => {
    const oa = heroArenaSortKey(a);
    const ob = heroArenaSortKey(b);
    if (oa !== ob) return oa - ob;
    return sortByPitchThenName(a, b);
  });
  deck.sort(sortByPitchThenName);
  inventory.sort(sortByPitchThenName);
  tokens.sort(sortByPitchThenName);

  return { heroArena, deck, inventory, tokens };
}
