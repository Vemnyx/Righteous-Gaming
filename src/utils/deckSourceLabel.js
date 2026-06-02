/**
 * Display label for a deck's source. Member decks show the owner's username (or email).
 *
 * @param {{ source?: string, owner_username?: string | null, owner_email?: string | null }} deck
 * @returns {string}
 */
export function deckSourceLabel(deck) {
  const src = deck.source != null ? String(deck.source).trim() : "";
  if (src.toLowerCase() === "member") {
    const username = deck.owner_username != null ? String(deck.owner_username).trim() : "";
    if (username !== "") return username;
    const email = deck.owner_email != null ? String(deck.owner_email).trim() : "";
    if (email !== "") return email;
    return "Member";
  }
  return src || "—";
}
