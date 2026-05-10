package domain

import "strconv"

// CardFusion identifies a fusion tag (persisted as smallint values in cards.fusions).
// Values must stay in sync with frontend `src/constants/cardFusion.js`.
type CardFusion int16

const (
	CardFusionEarth CardFusion = iota
	CardFusionIce
	CardFusionLightning
)

var cardFusionNames = map[CardFusion]string{
	CardFusionEarth:     "Earth",
	CardFusionIce:       "Ice",
	CardFusionLightning: "Lightning",
}

// Valid reports whether f is a defined CardFusion constant.
func (f CardFusion) Valid() bool {
	_, ok := cardFusionNames[f]
	return ok
}

// String returns the display name or "CardFusion("+decimal+")" if unknown.
func (f CardFusion) String() string {
	if name, ok := cardFusionNames[f]; ok {
		return name
	}
	return "CardFusion(" + strconv.FormatInt(int64(f), 10) + ")"
}

// CardFusions returns every fusion constant in ascending ID order.
func CardFusions() []CardFusion {
	return []CardFusion{
		CardFusionEarth,
		CardFusionIce,
		CardFusionLightning,
	}
}
