package fabrary

// Enum string keys match fabrary / @flesh-and-blood TypeScript enum member names (e.g. Subtype.TwoHanded -> "TwoHanded").
// Values must stay aligned with backend/internal/domain and backend/scripts/omens-to-api-batch.mjs.

var fabSubtypeKeyToSmallint = map[string]int16{
	"OneHanded": 0, "TwoHanded": 1, "Affliction": 2, "Ally": 3, "Angel": 4, "Arms": 5, "Arrow": 6, "Ash": 7,
	"Attack": 8, "Aura": 9, "Axe": 10, "Base": 11, "Book": 12, "Bow": 13, "Cannon": 14, "Chest": 15, "Chi": 16,
	"Claw": 17, "Club": 18, "Construct": 19, "Dagger": 20, "Demon": 21, "Dragon": 22, "Evo": 23, "Fiddle": 24,
	"Figment": 25, "Flail": 26, "Gem": 27, "Gun": 28, "Hammer": 29, "Head": 30, "Invocation": 31, "Item": 32,
	"Landmark": 33, "Log": 34, "Lute": 35, "Legs": 36, "NonAttack": 37, "OffHand": 38, "Orb": 39, "Pistol": 40,
	"PitFighter": 41, "Polearm": 42, "Quiver": 43, "Rock": 44, "Shuriken": 45, "Scepter": 46, "Scroll": 47,
	"Scythe": 48, "Song": 49, "Staff": 50, "Sword": 51, "Trap": 52, "Wrench": 53, "Young": 54,
}

var fabTalentKeyToSmallint = map[string]int16{
	"Chaos": 0, "Draconic": 1, "Earth": 2, "Elemental": 3, "Ice": 4, "Light": 5, "Lightning": 6, "Mystic": 7,
	"Revered": 8, "Reviled": 9, "Royal": 10, "Shadow": 11,
}

var fabRarityKeyToSmallint = map[string]int16{
	"Basic": 0, "Token": 1, "Common": 2, "Rare": 3, "SuperRare": 4, "Majestic": 5, "Marvel": 6, "Legendary": 7, "Fabled": 8, "Promo": 9,
}

// fabTypeKeyToSmallint maps FAB `types[0]` string (Type.Action etc. -> "Action") after stripping Type. prefix.
var fabTypeKeyToSmallint = map[string]int16{
	"Weapon":             14,
	"Hero":               8,
	"Instant":            9,
	"Equipment":          7,
	"Token":              13,
	"DefenseReaction":    5,
	"Macro":              10,
	"AttackReaction":     2,
	"Block":              3,
	"Companion":          4,
	"DemiHero":           6,
	"Mentor":             11,
	"Resource":           12,
	"NonAttackAction": 0,
	"AttackAction":    1,
	"Scheme":          0, // treat as non-attack action if encountered
}

var fabFormatKeyToSmallint = map[string]int16{
	"Draft": 0, "Sealed": 0, "ClassicConstructed": 3, "GoldenAge": 2, "LivingLegend": 4, "SilverAge": 1,
}

var fabKeywordKeyToSmallint = map[string]int16{
	"Ambush": 0, "Amp": 1, "ArcaneBarrier": 2, "ArcaneShelter": 3, "Awaken": 4, "Battleworn": 5,
	"BeatChest": 6, "BladeBreak": 7, "BloodDebt": 8, "Boost": 9, "Bond": 10, "Channel": 11, "Charge": 12,
	"Clash": 13, "Cloaked": 14, "Combo": 15, "Contract": 16, "Crank": 17, "TheCrowdBoos": 18,
	"TheCrowdCheers": 19, "Crush": 20, "Decompose": 21, "Dominate": 22, "Ephemeral": 23, "Essence": 24,
	"EvoUpgrade": 25, "Flow": 26, "Freeze": 27, "Fusion": 28, "Galvanize": 29, "GoAgain": 30, "GoFish": 31,
	"Guardwell": 32, "Heave": 33, "Heavy": 34, "HighTide": 35, "Intimidate": 36, "Legendary": 37,
	"Mark": 38, "Material": 39, "Meld": 40, "Modular": 41, "Mirage": 42, "Negate": 43, "Opt": 44,
	"Overpower": 45, "Pairs": 46, "Piercing": 47, "Phantasm": 48, "Protect": 49, "Quell": 50,
	"Quickstrike": 51, "Reload": 52, "Reprise": 53, "Retrieve": 54, "RuneGate": 55, "Rupture": 56,
	"Scrap": 57, "Sharpen": 58, "Solflare": 59, "Specialization": 60, "Spectra": 61, "Spellvoid": 62,
	"Starfall": 63, "Steal": 64, "Stealth": 65, "Surge": 66, "Suspense": 67, "Temper": 68, "Tower": 69,
	"Transform": 70, "Transcend": 71, "Unlimited": 72, "Universal": 73, "Unfreeze": 74, "Unity": 75,
	"Wager": 76, "Ward": 77, "WateryGrave": 78,
}
