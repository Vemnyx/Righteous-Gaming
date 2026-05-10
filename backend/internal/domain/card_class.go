package domain

import "strconv"

// CardClass identifies a hero class (persisted as smallint values and in smallint arrays on cards).
// Values must stay in sync with frontend `src/constants/cardClass.js`.
type CardClass int16

const (
	CardClassNotClassed CardClass = iota
	CardClassGeneric
	CardClassAdjudicator
	CardClassAssassin
	CardClassBard
	CardClassBrute
	CardClassGuardian
	CardClassIllusionist
	CardClassMechanologist
	CardClassMerchant
	CardClassNecromancer
	CardClassNinja
	CardClassPirate
	CardClassRanger
	CardClassRuneblade
	CardClassShapeshifter
	CardClassThief
	CardClassWarrior
	CardClassWizard
)

var cardClassNames = map[CardClass]string{
	CardClassNotClassed:    "NotClassed",
	CardClassGeneric:       "Generic",
	CardClassAdjudicator:   "Adjudicator",
	CardClassAssassin:      "Assassin",
	CardClassBard:          "Bard",
	CardClassBrute:         "Brute",
	CardClassGuardian:      "Guardian",
	CardClassIllusionist:   "Illusionist",
	CardClassMechanologist: "Mechanologist",
	CardClassMerchant:      "Merchant",
	CardClassNecromancer:   "Necromancer",
	CardClassNinja:         "Ninja",
	CardClassPirate:        "Pirate",
	CardClassRanger:        "Ranger",
	CardClassRuneblade:     "Runeblade",
	CardClassShapeshifter:  "Shapeshifter",
	CardClassThief:         "Thief",
	CardClassWarrior:       "Warrior",
	CardClassWizard:        "Wizard",
}

// Valid reports whether c is a defined CardClass constant.
func (c CardClass) Valid() bool {
	_, ok := cardClassNames[c]
	return ok
}

// String returns the wire/display name ("NotClassed", "Generic", …) or "CardClass("+decimal+")" if unknown.
func (c CardClass) String() string {
	if name, ok := cardClassNames[c]; ok {
		return name
	}
	return "CardClass(" + strconv.FormatInt(int64(c), 10) + ")"
}

// CardClasses returns every defined class constant in ascending ID order (for loops, selects, migrations).
func CardClasses() []CardClass {
	return []CardClass{
		CardClassNotClassed,
		CardClassGeneric,
		CardClassAdjudicator,
		CardClassAssassin,
		CardClassBard,
		CardClassBrute,
		CardClassGuardian,
		CardClassIllusionist,
		CardClassMechanologist,
		CardClassMerchant,
		CardClassNecromancer,
		CardClassNinja,
		CardClassPirate,
		CardClassRanger,
		CardClassRuneblade,
		CardClassShapeshifter,
		CardClassThief,
		CardClassWarrior,
		CardClassWizard,
	}
}
