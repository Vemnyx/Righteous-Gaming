package domain

import "strconv"

// CardKeyword identifies a keyword (persisted as smallint values in cards.keywords).
// Values must stay in sync with frontend `src/constants/cardKeyword.js`.
type CardKeyword int16

const (
	CardKeywordAmbush CardKeyword = iota
	CardKeywordAmp
	CardKeywordArcaneBarrier
	CardKeywordArcaneShelter
	CardKeywordAwaken
	CardKeywordBattleworn
	CardKeywordBeatChest
	CardKeywordBladeBreak
	CardKeywordBloodDebt
	CardKeywordBoost
	CardKeywordBond
	CardKeywordChannel
	CardKeywordCharge
	CardKeywordClash
	CardKeywordCloaked
	CardKeywordCombo
	CardKeywordContract
	CardKeywordCrank
	CardKeywordTheCrowdBoos
	CardKeywordTheCrowdCheers
	CardKeywordCrush
	CardKeywordDecompose
	CardKeywordDominate
	CardKeywordEphemeral
	CardKeywordEssence
	CardKeywordEvoUpgrade
	CardKeywordFlow
	CardKeywordFreeze
	CardKeywordFusion
	CardKeywordGalvanize
	CardKeywordGoAgain
	CardKeywordGoFish
	CardKeywordGuardwell
	CardKeywordHeave
	CardKeywordHeavy
	CardKeywordHighTide
	CardKeywordIntimidate
	CardKeywordLegendary
	CardKeywordMark
	CardKeywordMaterial
	CardKeywordMeld
	CardKeywordModular
	CardKeywordMirage
	CardKeywordNegate
	CardKeywordOpt
	CardKeywordOverpower
	CardKeywordPairs
	CardKeywordPiercing
	CardKeywordPhantasm
	CardKeywordProtect
	CardKeywordQuell
	CardKeywordQuickstrike
	CardKeywordReload
	CardKeywordReprise
	CardKeywordRetrieve
	CardKeywordRuneGate
	CardKeywordRupture
	CardKeywordScrap
	CardKeywordSharpen
	CardKeywordSolflare
	CardKeywordSpecialization
	CardKeywordSpectra
	CardKeywordSpellvoid
	CardKeywordStarfall
	CardKeywordSteal
	CardKeywordStealth
	CardKeywordSurge
	CardKeywordSuspense
	CardKeywordTemper
	CardKeywordTower
	CardKeywordTransform
	CardKeywordTranscend
	CardKeywordUnlimited
	CardKeywordUniversal
	CardKeywordUnfreeze
	CardKeywordUnity
	CardKeywordWager
	CardKeywordWard
	CardKeywordWateryGrave
)

var cardKeywordNames = map[CardKeyword]string{
	CardKeywordAmbush:         "Ambush",
	CardKeywordAmp:            "Amp",
	CardKeywordArcaneBarrier:  "Arcane Barrier",
	CardKeywordArcaneShelter:  "Arcane Shelter",
	CardKeywordAwaken:         "Awaken",
	CardKeywordBattleworn:     "Battleworn",
	CardKeywordBeatChest:      "Beat Chest",
	CardKeywordBladeBreak:     "Blade Break",
	CardKeywordBloodDebt:      "Blood Debt",
	CardKeywordBoost:          "Boost",
	CardKeywordBond:           "Bond",
	CardKeywordChannel:        "Channel",
	CardKeywordCharge:         "Charge",
	CardKeywordClash:          "Clash",
	CardKeywordCloaked:        "Cloaked",
	CardKeywordCombo:          "Combo",
	CardKeywordContract:       "Contract",
	CardKeywordCrank:          "Crank",
	CardKeywordTheCrowdBoos:   "The Crowd Boos",
	CardKeywordTheCrowdCheers: "The Crowd Cheers",
	CardKeywordCrush:          "Crush",
	CardKeywordDecompose:      "Decompose",
	CardKeywordDominate:       "Dominate",
	CardKeywordEphemeral:      "Ephemeral",
	CardKeywordEssence:        "Essence",
	CardKeywordEvoUpgrade:     "Evo Upgrade",
	CardKeywordFlow:           "Flow",
	CardKeywordFreeze:         "Freeze",
	CardKeywordFusion:         "Fusion",
	CardKeywordGalvanize:      "Galvanize",
	CardKeywordGoAgain:        "Go again",
	CardKeywordGoFish:         "Go Fish",
	CardKeywordGuardwell:      "Guardwell",
	CardKeywordHeave:          "Heave",
	CardKeywordHeavy:          "Heavy",
	CardKeywordHighTide:       "High Tide",
	CardKeywordIntimidate:     "Intimidate",
	CardKeywordLegendary:      "Legendary",
	CardKeywordMark:           "Mark",
	CardKeywordMaterial:       "Material",
	CardKeywordMeld:           "Meld",
	CardKeywordModular:        "Modular",
	CardKeywordMirage:         "Mirage",
	CardKeywordNegate:         "Negate",
	CardKeywordOpt:            "Opt",
	CardKeywordOverpower:      "Overpower",
	CardKeywordPairs:          "Pairs",
	CardKeywordPiercing:       "Piercing",
	CardKeywordPhantasm:       "Phantasm",
	CardKeywordProtect:        "Protect",
	CardKeywordQuell:          "Quell",
	CardKeywordQuickstrike:    "Quickstrike",
	CardKeywordReload:         "Reload",
	CardKeywordReprise:        "Reprise",
	CardKeywordRetrieve:       "Retrieve",
	CardKeywordRuneGate:       "Rune Gate",
	CardKeywordRupture:        "Rupture",
	CardKeywordScrap:          "Scrap",
	CardKeywordSharpen:        "Sharpen",
	CardKeywordSolflare:       "Solflare",
	CardKeywordSpecialization: "Specialization",
	CardKeywordSpectra:        "Spectra",
	CardKeywordSpellvoid:      "Spellvoid",
	CardKeywordStarfall:       "Starfall",
	CardKeywordSteal:          "Steal",
	CardKeywordStealth:        "Stealth",
	CardKeywordSurge:          "Surge",
	CardKeywordSuspense:       "Suspense",
	CardKeywordTemper:         "Temper",
	CardKeywordTower:          "Tower",
	CardKeywordTransform:      "Transform",
	CardKeywordTranscend:      "Transcend",
	CardKeywordUnlimited:      "Unlimited",
	CardKeywordUniversal:      "Universal",
	CardKeywordUnfreeze:       "Unfreeze",
	CardKeywordUnity:          "Unity",
	CardKeywordWager:          "Wager",
	CardKeywordWard:           "Ward",
	CardKeywordWateryGrave:    "Watery Grave",
}

// Valid reports whether k is a defined CardKeyword constant.
func (k CardKeyword) Valid() bool {
	_, ok := cardKeywordNames[k]
	return ok
}

// String returns the display name or "CardKeyword("+decimal+")" if unknown.
func (k CardKeyword) String() string {
	if name, ok := cardKeywordNames[k]; ok {
		return name
	}
	return "CardKeyword(" + strconv.FormatInt(int64(k), 10) + ")"
}

// CardKeywords returns every defined keyword in ascending ID order.
func CardKeywords() []CardKeyword {
	return []CardKeyword{
		CardKeywordAmbush,
		CardKeywordAmp,
		CardKeywordArcaneBarrier,
		CardKeywordArcaneShelter,
		CardKeywordAwaken,
		CardKeywordBattleworn,
		CardKeywordBeatChest,
		CardKeywordBladeBreak,
		CardKeywordBloodDebt,
		CardKeywordBoost,
		CardKeywordBond,
		CardKeywordChannel,
		CardKeywordCharge,
		CardKeywordClash,
		CardKeywordCloaked,
		CardKeywordCombo,
		CardKeywordContract,
		CardKeywordCrank,
		CardKeywordTheCrowdBoos,
		CardKeywordTheCrowdCheers,
		CardKeywordCrush,
		CardKeywordDecompose,
		CardKeywordDominate,
		CardKeywordEphemeral,
		CardKeywordEssence,
		CardKeywordEvoUpgrade,
		CardKeywordFlow,
		CardKeywordFreeze,
		CardKeywordFusion,
		CardKeywordGalvanize,
		CardKeywordGoAgain,
		CardKeywordGoFish,
		CardKeywordGuardwell,
		CardKeywordHeave,
		CardKeywordHeavy,
		CardKeywordHighTide,
		CardKeywordIntimidate,
		CardKeywordLegendary,
		CardKeywordMark,
		CardKeywordMaterial,
		CardKeywordMeld,
		CardKeywordModular,
		CardKeywordMirage,
		CardKeywordNegate,
		CardKeywordOpt,
		CardKeywordOverpower,
		CardKeywordPairs,
		CardKeywordPiercing,
		CardKeywordPhantasm,
		CardKeywordProtect,
		CardKeywordQuell,
		CardKeywordQuickstrike,
		CardKeywordReload,
		CardKeywordReprise,
		CardKeywordRetrieve,
		CardKeywordRuneGate,
		CardKeywordRupture,
		CardKeywordScrap,
		CardKeywordSharpen,
		CardKeywordSolflare,
		CardKeywordSpecialization,
		CardKeywordSpectra,
		CardKeywordSpellvoid,
		CardKeywordStarfall,
		CardKeywordSteal,
		CardKeywordStealth,
		CardKeywordSurge,
		CardKeywordSuspense,
		CardKeywordTemper,
		CardKeywordTower,
		CardKeywordTransform,
		CardKeywordTranscend,
		CardKeywordUnlimited,
		CardKeywordUniversal,
		CardKeywordUnfreeze,
		CardKeywordUnity,
		CardKeywordWager,
		CardKeywordWard,
		CardKeywordWateryGrave,
	}
}
