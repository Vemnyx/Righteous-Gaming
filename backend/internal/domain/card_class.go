package domain

import "strconv"

// CardClass identifies a hero class (persisted as smallint values and in smallint arrays on cards).
// Values must stay in sync with frontend `src/constants/cardClass.js`.
type CardClass int16

const (
	CardClassNotClassed    CardClass = 0
	CardClassGeneric       CardClass = 1
	CardClassAdjudicator   CardClass = 2
	CardClassBard          CardClass = 3
	CardClassBrute         CardClass = 4
	CardClassGuardian      CardClass = 5
	CardClassIllusionist   CardClass = 6
	CardClassMechanologist CardClass = 7
	CardClassMerchant      CardClass = 8
	CardClassNinja         CardClass = 9
	CardClassRanger        CardClass = 10
	CardClassRuneblade     CardClass = 11
	CardClassShapeshifter  CardClass = 12
	CardClassWarrior       CardClass = 13
	CardClassWizard        CardClass = 14
)

var cardClassNames = map[CardClass]string{
	CardClassNotClassed:    "NotClassed",
	CardClassGeneric:       "Generic",
	CardClassAdjudicator:   "Adjudicator",
	CardClassBard:          "Bard",
	CardClassBrute:         "Brute",
	CardClassGuardian:      "Guardian",
	CardClassIllusionist:   "Illusionist",
	CardClassMechanologist: "Mechanologist",
	CardClassMerchant:      "Merchant",
	CardClassNinja:         "Ninja",
	CardClassRanger:        "Ranger",
	CardClassRuneblade:     "Runeblade",
	CardClassShapeshifter:  "Shapeshifter",
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
		CardClassBard,
		CardClassBrute,
		CardClassGuardian,
		CardClassIllusionist,
		CardClassMechanologist,
		CardClassMerchant,
		CardClassNinja,
		CardClassRanger,
		CardClassRuneblade,
		CardClassShapeshifter,
		CardClassWarrior,
		CardClassWizard,
	}
}
