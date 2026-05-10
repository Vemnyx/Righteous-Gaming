#!/usr/bin/env node
/**
 * Maps Omens card source JSON -> POST /api/cards/batch payload.
 * Source schema: see omens_source.json entries.
 *
 * Enum smallints must stay aligned with:
 *   - backend/internal/domain/card_type.go, card_talent.go, card_rarity.go, …
 *   - src/constants/cardType.js, cardTalent.js, cardRarity.js, …
 *
 * Card type (rule 7 in backend/cardmappingrules.txt):
 *   - FAB `Action` + subtype `Attack`  -> CardType.AttackAction (1)
 *   - FAB `Action` without `Attack`    -> CardType.NonAttackAction (0)
 *   - Other FAB type strings map 1:1 to their CardType ids (Weapon=14, Instant=9, …).
 *
 * Rarity / talents (aligned with domain + src/constants/cardRarity.js, cardTalent.js):
 *   - Basic, Marvel, … -> CardRarity smallints 0..9 (see Rarity constant below).
 *   - Talent `Reviled` -> 9 (`reviled` accepted as alias).
 *
 * Pipeline: merge chunks first, then batch:
 *   node backend/scripts/merge-omens-chunks.mjs && node backend/scripts/omens-to-api-batch.mjs
 *
 * Usage:
 *   node backend/scripts/omens-to-api-batch.mjs [path/to/omens_source.json]
 *
 * Defaults to backend/data/omens_source.json → backend/data/omens_cards_api_batch.json
 */

import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "../..");

// --- Enum ids (must match src/constants/*.js and backend/internal/domain/*.go) ---
const Class = {
  NotClassed: 0, Generic: 1, Adjudicator: 2, Assassin: 3, Bard: 4, Brute: 5, Guardian: 6,
  Illusionist: 7, Mechanologist: 8, Merchant: 9, Necromancer: 10, Ninja: 11, Pirate: 12,
  Ranger: 13, Runeblade: 14, Shapeshifter: 15, Thief: 16, Warrior: 17, Wizard: 18,
};

const Subtype = {
  OneHanded: 0, TwoHanded: 1, Affliction: 2, Ally: 3, Angel: 4, Arms: 5, Arrow: 6, Ash: 7,
  Attack: 8, Aura: 9, Axe: 10, Base: 11, Book: 12, Bow: 13, Cannon: 14, Chest: 15, Chi: 16,
  Claw: 17, Club: 18, Construct: 19, Dagger: 20, Demon: 21, Dragon: 22, Evo: 23, Fiddle: 24,
  Figment: 25, Flail: 26, Gem: 27, Gun: 28, Hammer: 29, Head: 30, Invocation: 31, Item: 32,
  Landmark: 33, Log: 34, Lute: 35, Legs: 36, NonAttack: 37, OffHand: 38, Orb: 39, Pistol: 40,
  PitFighter: 41, Polearm: 42, Quiver: 43, Rock: 44, Shuriken: 45, Scepter: 46, Scroll: 47,
  Scythe: 48, Song: 49, Staff: 50, Sword: 51, Trap: 52, Wrench: 53, Young: 54,
};

/** Card line `type` smallints — order matches backend/internal/domain/card_type.go / src/constants/cardType.js */
const CardType = {
  NonAttackAction: 0,
  AttackAction: 1,
  AttackReaction: 2,
  Block: 3,
  Companion: 4,
  DefenseReaction: 5,
  DemiHero: 6,
  Equipment: 7,
  Hero: 8,
  Instant: 9,
  Macro: 10,
  Mentor: 11,
  Resource: 12,
  Token: 13,
  Weapon: 14,
};

const Talent = {
  Chaos: 0,
  Draconic: 1,
  Earth: 2,
  Elemental: 3,
  Ice: 4,
  Light: 5,
  Lightning: 6,
  Mystic: 7,
  Revered: 8,
  Reviled: 9,
  Royal: 10,
  Shadow: 11,
};

const Keyword = {
  Ambush: 0, Amp: 1, ArcaneBarrier: 2, ArcaneShelter: 3, Awaken: 4, Battleworn: 5,
  BeatChest: 6, BladeBreak: 7, BloodDebt: 8, Boost: 9, Bond: 10, Channel: 11, Charge: 12,
  Clash: 13, Cloaked: 14, Combo: 15, Contract: 16, Crank: 17, TheCrowdBoos: 18,
  TheCrowdCheers: 19, Crush: 20, Decompose: 21, Dominate: 22, Ephemeral: 23, Essence: 24,
  EvoUpgrade: 25, Flow: 26, Freeze: 27, Fusion: 28, Galvanize: 29, GoAgain: 30, GoFish: 31,
  Guardwell: 32, Heave: 33, Heavy: 34, HighTide: 35, Intimidate: 36, Legendary: 37,
  Mark: 38, Material: 39, Meld: 40, Modular: 41, Mirage: 42, Negate: 43, Opt: 44,
  Overpower: 45, Pairs: 46, Piercing: 47, Phantasm: 48, Protect: 49, Quell: 50,
  Quickstrike: 51, Reload: 52, Reprise: 53, Retrieve: 54, RuneGate: 55, Rupture: 56,
  Scrap: 57, Sharpen: 58, Solflare: 59, Specialization: 60, Spectra: 61, Spellvoid: 62,
  Starfall: 63, Steal: 64, Stealth: 65, Surge: 66, Suspense: 67, Temper: 68, Tower: 69,
  Transform: 70, Transcend: 71, Unlimited: 72, Universal: 73, Unfreeze: 74, Unity: 75,
  Wager: 76, Ward: 77, WateryGrave: 78,
};

/** Matches backend/internal/domain/card_rarity.go / src/constants/cardRarity.js */
const Rarity = {
  Basic: 0,
  Token: 1,
  Common: 2,
  Rare: 3,
  SuperRare: 4,
  Majestic: 5,
  Marvel: 6,
  Legendary: 7,
  Fabled: 8,
  Promo: 9,
};

/** FAB / export strings that do not match the `Rarity` object key spelling */
const RARITY_KEY_ALIASES = {
  "Super Rare": "SuperRare",
};

const Format = {
  Limited: 0, SilverAge: 1, GoldenAge: 2, ClassicConstruction: 3, LivingLegend: 4,
};

const Hero = {
  Arakni: 0, Aurora: 1, Aurora2: 2, Azalea: 3, Benji: 4, Betsy: 5, Blaze: 6, Bolfar: 7,
  Boltyn: 8, Bravo: 9, Brevant: 10, Briar: 11, Brutus: 12, Chane: 13, Cindra: 14,
  Crackni: 15, Crix: 16, Dash: 17, DataDoll: 18, Dorinthea: 19, Dromai: 20, Emperor: 21,
  Enigma: 22, Fai: 23, Fang: 24, Florian: 25, Frankie: 26, Genis: 27, GravyBones: 28, Hala: 29,
  Ira: 30, Iyslander: 31, Jarl: 32, Kano: 33, Kassai: 34, Katsu: 35, Kavdaen: 36, Kayo: 37,
  Kox: 38, Levia: 39, Lexi: 40, Librarian: 41, Lyath: 42, Marlynn: 43, Maxx: 44, Melody: 45,
  Nuu: 46, Oldhim: 47, Olympia: 48, Oscilio: 49, Broscilio: 50, Pleiades: 51, Prism: 52,
  Puffin: 53, Reya: 54, Rhinar: 55, Riptide: 56, RKO: 57, Ruudi: 58, Shiyana: 59, Slippy: 60,
  Squizzy: 61, Scurv: 62, Starvo: 63, Taipanis: 64, Taylor: 65, Teklovossen: 66, Terra: 67,
  Theryon: 68, Tuffnut: 69, Uzuri: 70, Valda: 71, Verdance: 72, Victor: 73, Vynnset: 74,
  Viserai: 75, Yorick: 76, Yoji: 77, Zen: 78, Zyggy: 79,
};

const FAB_TO_FORMAT = {
  Draft: Format.Limited,
  Sealed: Format.Limited,
  ClassicConstructed: Format.ClassicConstruction,
  GoldenAge: Format.GoldenAge,
  LivingLegend: Format.LivingLegend,
  SilverAge: Format.SilverAge,
  // dropped (no enum): Blitz, Clash, Open, UltimatePitFight
};

/** @param {string} src @param {string[]} issues @param {string} cardId */
function mapRarity(src, issues, cardId) {
  if (src == null || src === "") {
    issues.push(`${cardId}: empty rarity, omitted`);
    return null;
  }
  const key = RARITY_KEY_ALIASES[src] ?? src;
  const id = Rarity[key];
  if (id === undefined) {
    issues.push(`${cardId}: unknown rarity "${src}", omitted`);
    return null;
  }
  return id;
}

function mapFormats(fabs) {
  if (!Array.isArray(fabs)) return [];
  const out = new Set();
  for (const f of fabs) {
    const id = FAB_TO_FORMAT[f];
    if (id !== undefined && id !== null) out.add(id);
  }
  return [...out].sort((a, b) => a - b);
}

/** FAB source uses PascalCase subtype keys matching Subtype enum names; Attack => attack actions. */
function isFabAttackAction(subtypes) {
  return new Set(subtypes || []).has("Attack");
}

/**
 * Map FAB `types[0]` + subtypes -> cards.type smallint.
 * Attack vs non-attack actions: backend/cardmappingrules.txt §7.
 */
function mapType(types, subtypes, issues, cardId) {
  const t = types?.[0];
  const attackAction = isFabAttackAction(subtypes);

  switch (t) {
    case "Weapon":
      return CardType.Weapon;
    case "Hero":
      return CardType.Hero;
    case "Instant":
      return CardType.Instant;
    case "Equipment":
      return CardType.Equipment;
    case "Token":
      return CardType.Token;
    case "DefenseReaction":
      return CardType.DefenseReaction;
    case "Macro":
      return CardType.Macro;
    case "Action":
      return attackAction ? CardType.AttackAction : CardType.NonAttackAction;
    case undefined:
    case null:
    case "":
      issues.push(`${cardId}: missing types[0]; using Non-Attack Action`);
      return CardType.NonAttackAction;
    default:
      issues.push(`${cardId}: unknown FAB type "${t}"; using Non-Attack Action`);
      return CardType.NonAttackAction;
  }
}

function mapSubtypes(arr) {
  return (arr || []).map((k) => {
    const id = Subtype[k];
    if (id === undefined) throw new Error(`Unknown subtype: ${k}`);
    return id;
  });
}

function mapClasses(arr) {
  return (arr || []).map((k) => {
    const id = Class[k];
    if (id === undefined) throw new Error(`Unknown class: ${k}`);
    return id;
  });
}

/** FAB typos / alternate casing -> canonical Talent object key */
const TALENT_KEY_ALIASES = {
  reviled: "Reviled",
};

function normalizeTalentKey(k) {
  if (typeof k !== "string") return k;
  if (Talent[k] !== undefined) return k;
  return TALENT_KEY_ALIASES[k.toLowerCase()] ?? k;
}

function mapTalents(arr, issues, cardId) {
  const out = [];
  for (const k of arr || []) {
    const key = normalizeTalentKey(k);
    const id = Talent[key];
    if (id === undefined) {
      issues.push(`${cardId}: dropped unknown talent "${k}"`);
      continue;
    }
    out.push(id);
  }
  return out;
}

function mapKeywords(arr, issues, cardId) {
  const out = [];
  for (const k of arr || []) {
    const id = Keyword[k];
    if (id === undefined) {
      issues.push(`${cardId}: dropped unknown keyword "${k}"`);
      continue;
    }
    out.push(id);
  }
  return out;
}

function mapHeroes(arr, issues, cardId) {
  const out = [];
  for (const k of arr || []) {
    const id = Hero[k];
    if (id === undefined) {
      issues.push(`${cardId}: dropped unknown hero "${k}"`);
      continue;
    }
    out.push(id);
  }
  return out;
}

function mapSpecializations(arr, issues, cardId) {
  const out = [];
  for (const k of arr || []) {
    const id = Hero[k];
    if (id === undefined) {
      issues.push(`${cardId}: dropped unknown specialization hero "${k}"`);
      continue;
    }
    out.push(id);
  }
  return out;
}

function parseSetNum(setIdentifiers, defaultImage) {
  const list = setIdentifiers || [];
  const omn = list.find((s) => /^OMN\d+$/i.test(s));
  if (omn) {
    const n = parseInt(omn.slice(3), 10);
    if (!Number.isNaN(n)) return n;
  }
  const m = /^OMN(\d+)/i.exec(defaultImage || "");
  if (m) return parseInt(m[1], 10);
  return 0;
}

function toBatchRow(src, issues) {
  const id = src.cardIdentifier;
  const imageUrl = `https://content.fabrary.net/cards/${src.defaultImage}.webp`;
  const hybrid = id === "third-eye-of-the-sphinx";

  const row = {
    set_id: 1,
    name: src.name,
    card_identifier: id,
    image_url: imageUrl,
    functional_text: src.functionalText,
    rarity: mapRarity(src.rarity, issues, id),
    set_code: "OMN",
    set_num: parseSetNum(src.setIdentifiers, src.defaultImage),
    type: mapType(src.types, src.subtypes, issues, id),
    subtypes: mapSubtypes(src.subtypes),
    classes: mapClasses(src.classes),
    hybrid,
    talents: mapTalents(src.talents, issues, id),
    pitch: src.pitch ?? null,
    cost: src.cost ?? null,
    power: src.power ?? null,
    block: src.defense ?? null,
    heroes: mapHeroes(src.legalHeroes, issues, id),
    life: src.life ?? null,
    intellect: src.intellect ?? null,
    keywords: mapKeywords(src.keywords, issues, id),
    formats: mapFormats(src.formats),
    specializations: mapSpecializations(src.specializations || [], issues, id),
    fusions: src.fusions || [],
  };

  return row;
}

function main() {
  const inPath = process.argv[2] || join(root, "backend/data/omens_source.json");
  const outPath = join(root, "backend/data/omens_cards_api_batch.json");
  const raw = readFileSync(inPath, "utf8");
  const source = JSON.parse(raw);
  if (!Array.isArray(source)) {
    console.error("Expected JSON array at top level");
    process.exit(1);
  }
  const issues = [];
  const batch = source.map((s) => toBatchRow(s, issues));

  let nonAttackActions = 0;
  let attackActions = 0;
  for (const row of batch) {
    if (row.type === CardType.NonAttackAction) nonAttackActions++;
    else if (row.type === CardType.AttackAction) attackActions++;
  }

  writeFileSync(outPath, JSON.stringify(batch, null, 2) + "\n", "utf8");
  console.error(`Wrote ${batch.length} cards -> ${outPath}`);
  console.error(`Card types: Non-Attack Action=${nonAttackActions}, Attack Action=${attackActions}`);
  if (issues.length) {
    console.error("--- mapping notes ---");
    for (const line of issues) console.error(line);
  }
}

main();
