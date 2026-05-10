/**
 * Hero enum IDs (smallint on cards.hero). Must match `backend/internal/domain/card_hero.go`.
 * @readonly
 */
export const CardHero = Object.freeze({
  Arakni: 0,
  Azalea: 1,
  Benji: 2,
  Boltyn: 3,
  Bravo: 4,
  Briar: 5,
  Chane: 6,
  Dash: 7,
  DataDoll: 8,
  Dorinthea: 9,
  Emperor: 10,
  GenisWotchuneed: 11,
  Ira: 12,
  Iyslander: 13,
  Kano: 14,
  Kassai: 15,
  Katsu: 16,
  Kavdaen: 17,
  Kayo: 18,
  Levia: 19,
  Lexi: 20,
  Oldhim: 21,
  Prism: 22,
  Rhinar: 23,
  Ruudi: 24,
  Shiyana: 25,
  Taylor: 26,
  Valda: 27,
  Viserai: 28,
  Yorick: 29,
});

/** Ordered display names for each ID 0..29. */
export const CARD_HERO_NAMES = Object.freeze([
  "Arakni",
  "Azalea",
  "Benji",
  "Boltyn",
  "Bravo",
  "Briar",
  "Chane",
  "Dash",
  "Data Doll",
  "Dorinthea",
  "Emperor",
  "Genis Wotchuneed",
  "Ira",
  "Iyslander",
  "Kano",
  "Kassai",
  "Katsu",
  "Kavdaen",
  "Kayo",
  "Levia",
  "Lexi",
  "Oldhim",
  "Prism",
  "Rhinar",
  "Ruu'di",
  "Shiyana",
  "Taylor",
  "Valda",
  "Viserai",
  "Yorick",
]);

/**
 * @param {number} id
 * @returns {string | undefined}
 */
export function cardHeroName(id) {
  return CARD_HERO_NAMES[id];
}

/**
 * @param {number} id
 * @returns {boolean}
 */
export function isValidCardHeroId(id) {
  return Number.isInteger(id) && id >= 0 && id < CARD_HERO_NAMES.length;
}
