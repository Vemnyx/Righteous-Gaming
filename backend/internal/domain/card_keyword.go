package domain

import "strconv"

// CardKeyword identifies a keyword (persisted as smallint values in cards.keywords).
// Values must stay in sync with frontend `src/constants/cardKeyword.js`.
type CardKeyword int16

const (
	CardKeywordArcaneBarrier  CardKeyword = 0
	CardKeywordBattleworn     CardKeyword = 1
	CardKeywordBladeBreak     CardKeyword = 2
	CardKeywordBloodDebt      CardKeyword = 3
	CardKeywordBoost          CardKeyword = 4
	CardKeywordChannel        CardKeyword = 5
	CardKeywordCharge         CardKeyword = 6
	CardKeywordCombo          CardKeyword = 7
	CardKeywordCrush          CardKeyword = 8
	CardKeywordDominate       CardKeyword = 9
	CardKeywordEssence        CardKeyword = 10
	CardKeywordFreeze         CardKeyword = 11
	CardKeywordFusion         CardKeyword = 12
	CardKeywordGoAgain        CardKeyword = 13
	CardKeywordHeave          CardKeyword = 14
	CardKeywordIntimidate     CardKeyword = 15
	CardKeywordLegendary      CardKeyword = 16
	CardKeywordMentor         CardKeyword = 17
	CardKeywordNegate         CardKeyword = 18
	CardKeywordOpt            CardKeyword = 19
	CardKeywordPhantasm       CardKeyword = 20
	CardKeywordReload         CardKeyword = 21
	CardKeywordReprise        CardKeyword = 22
	CardKeywordSpecialization CardKeyword = 23
	CardKeywordSpectra        CardKeyword = 24
	CardKeywordSpellvoid      CardKeyword = 25
	CardKeywordTemper         CardKeyword = 26
	CardKeywordThaw           CardKeyword = 27
	CardKeywordUnfreeze       CardKeyword = 28
)

var cardKeywordNames = map[CardKeyword]string{
	CardKeywordArcaneBarrier:  "Arcane Barrier",
	CardKeywordBattleworn:     "Battleworn",
	CardKeywordBladeBreak:     "Blade Break",
	CardKeywordBloodDebt:      "Blood Debt",
	CardKeywordBoost:          "Boost",
	CardKeywordChannel:        "Channel",
	CardKeywordCharge:         "Charge",
	CardKeywordCombo:          "Combo",
	CardKeywordCrush:          "Crush",
	CardKeywordDominate:       "Dominate",
	CardKeywordEssence:        "Essence",
	CardKeywordFreeze:         "Freeze",
	CardKeywordFusion:         "Fusion",
	CardKeywordGoAgain:        "Go Again",
	CardKeywordHeave:          "Heave",
	CardKeywordIntimidate:     "Intimidate",
	CardKeywordLegendary:      "Legendary",
	CardKeywordMentor:         "Mentor",
	CardKeywordNegate:         "Negate",
	CardKeywordOpt:            "Opt",
	CardKeywordPhantasm:       "Phantasm",
	CardKeywordReload:         "Reload",
	CardKeywordReprise:        "Reprise",
	CardKeywordSpecialization: "Specialization",
	CardKeywordSpectra:        "Spectra",
	CardKeywordSpellvoid:      "Spellvoid",
	CardKeywordTemper:         "Temper",
	CardKeywordThaw:           "Thaw",
	CardKeywordUnfreeze:       "Unfreeze",
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
		CardKeywordArcaneBarrier,
		CardKeywordBattleworn,
		CardKeywordBladeBreak,
		CardKeywordBloodDebt,
		CardKeywordBoost,
		CardKeywordChannel,
		CardKeywordCharge,
		CardKeywordCombo,
		CardKeywordCrush,
		CardKeywordDominate,
		CardKeywordEssence,
		CardKeywordFreeze,
		CardKeywordFusion,
		CardKeywordGoAgain,
		CardKeywordHeave,
		CardKeywordIntimidate,
		CardKeywordLegendary,
		CardKeywordMentor,
		CardKeywordNegate,
		CardKeywordOpt,
		CardKeywordPhantasm,
		CardKeywordReload,
		CardKeywordReprise,
		CardKeywordSpecialization,
		CardKeywordSpectra,
		CardKeywordSpellvoid,
		CardKeywordTemper,
		CardKeywordThaw,
		CardKeywordUnfreeze,
	}
}
