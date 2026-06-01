import { cardHeroName } from "../constants/cardHero";

/**
 * Display label for a deck's hero (Fabrary short name when stored, else enum name).
 *
 * @param {{ hero: number, hero_name?: string | null }} deck
 * @returns {string}
 */
export function deckHeroLabel(deck) {
  const custom = deck.hero_name != null ? String(deck.hero_name).trim() : "";
  if (custom !== "") return custom;
  return cardHeroName(deck.hero) ?? String(deck.hero);
}
