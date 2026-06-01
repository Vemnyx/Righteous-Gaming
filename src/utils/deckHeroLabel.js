/**
 * Display label for a deck's hero (from heroes.name via API).
 *
 * @param {{ hero_id?: number, hero_name?: string | null }} deck
 * @returns {string}
 */
export function deckHeroLabel(deck) {
  const name = deck.hero_name != null ? String(deck.hero_name).trim() : "";
  if (name !== "") return name;
  if (typeof deck.hero_id === "number" && deck.hero_id > 0) return `Hero #${deck.hero_id}`;
  return "";
}
