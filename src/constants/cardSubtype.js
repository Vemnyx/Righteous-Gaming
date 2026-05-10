/**
 * Card subtype enum IDs (smallint in `subtypes` arrays).
 * Matches `backend/internal/domain/card_subtype.go` and legacy TS `Subtype` string values (`CardSubtype.OneHanded` → `"1H"` via `cardSubtypeToken(0)`).
 * @readonly
 */
export const CardSubtype = Object.freeze({
  OneHanded: 0,
  TwoHanded: 1,
  Affliction: 2,
  Ally: 3,
  Angel: 4,
  Arms: 5,
  Arrow: 6,
  Ash: 7,
  Attack: 8,
  Aura: 9,
  Axe: 10,
  Base: 11,
  Book: 12,
  Bow: 13,
  Cannon: 14,
  Chest: 15,
  Chi: 16,
  Claw: 17,
  Club: 18,
  Construct: 19,
  Dagger: 20,
  Demon: 21,
  Dragon: 22,
  Evo: 23,
  Fiddle: 24,
  Figment: 25,
  Flail: 26,
  Gem: 27,
  Gun: 28,
  Hammer: 29,
  Head: 30,
  Invocation: 31,
  Item: 32,
  Landmark: 33,
  Log: 34,
  Lute: 35,
  Legs: 36,
  NonAttack: 37,
  OffHand: 38,
  Orb: 39,
  Pistol: 40,
  PitFighter: 41,
  Polearm: 42,
  Quiver: 43,
  Rock: 44,
  Shuriken: 45,
  Scepter: 46,
  Scroll: 47,
  Scythe: 48,
  Song: 49,
  Staff: 50,
  Sword: 51,
  Trap: 52,
  Wrench: 53,
  Young: 54,
});

/** Legacy string token for each ID 0..54 (`Subtype` enum values in TypeScript). */
export const CARD_SUBTYPE_TOKENS = Object.freeze([
  "1H",
  "2H",
  "Affliction",
  "Ally",
  "Angel",
  "Arms",
  "Arrow",
  "Ash",
  "Attack",
  "Aura",
  "Axe",
  "Base",
  "Book",
  "Bow",
  "Cannon",
  "Chest",
  "Chi",
  "Claw",
  "Club",
  "Construct",
  "Dagger",
  "Demon",
  "Dragon",
  "Evo",
  "Fiddle",
  "Figment",
  "Flail",
  "Gem",
  "Gun",
  "Hammer",
  "Head",
  "Invocation",
  "Item",
  "Landmark",
  "Log",
  "Lute",
  "Legs",
  "Non-Attack",
  "Off-Hand",
  "Orb",
  "Pistol",
  "Pit-Fighter",
  "Polearm",
  "Quiver",
  "Rock",
  "Shuriken",
  "Scepter",
  "Scroll",
  "Scythe",
  "Song",
  "Staff",
  "Sword",
  "Trap",
  "Wrench",
  "Young",
]);

/** @readonly */
export const CARD_SUBTYPE_ID_BY_TOKEN = Object.freeze(
  Object.fromEntries(CARD_SUBTYPE_TOKENS.map((t, i) => [t, i])),
);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardSubtypeToken(id) {
  return CARD_SUBTYPE_TOKENS[id];
}

/**
 * @param {string} token legacy subtype string, e.g. `"1H"` or `"Non-Attack"`
 * @returns {number | undefined}
 */
export function cardSubtypeFromToken(token) {
  const n = CARD_SUBTYPE_ID_BY_TOKEN[token];
  return typeof n === "number" ? n : undefined;
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardSubtypeId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_SUBTYPE_TOKENS.length;
}
