import { cardHeroName } from "../constants/cardHero";

/**
 * Display label for a deck's hero from the catalog hero enum.
 *
 * @param {{ hero: number }} deck
 * @returns {string}
 */
export function deckHeroLabel(deck) {
  return cardHeroName(deck.hero) ?? String(deck.hero);
}
