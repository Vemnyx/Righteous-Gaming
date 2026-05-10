package domain

import "strconv"

// CardTalent identifies a talent tag (persisted as smallint values in cards.talents).
// Values must stay in sync with frontend `src/constants/cardTalent.js`.
type CardTalent int16

const (
	CardTalentDraconic  CardTalent = 0
	CardTalentEarth     CardTalent = 1
	CardTalentElemental CardTalent = 2
	CardTalentIce       CardTalent = 3
	CardTalentLight     CardTalent = 4
	CardTalentLightning CardTalent = 5
	CardTalentRoyal     CardTalent = 6
	CardTalentShadow    CardTalent = 7
)

var cardTalentNames = map[CardTalent]string{
	CardTalentDraconic:  "Draconic",
	CardTalentEarth:     "Earth",
	CardTalentElemental: "Elemental",
	CardTalentIce:       "Ice",
	CardTalentLight:     "Light",
	CardTalentLightning: "Lightning",
	CardTalentRoyal:     "Royal",
	CardTalentShadow:    "Shadow",
}

// Valid reports whether t is a defined CardTalent constant.
func (t CardTalent) Valid() bool {
	_, ok := cardTalentNames[t]
	return ok
}

// String returns the wire/display name or "CardTalent("+decimal+")" if unknown.
func (t CardTalent) String() string {
	if name, ok := cardTalentNames[t]; ok {
		return name
	}
	return "CardTalent(" + strconv.FormatInt(int64(t), 10) + ")"
}

// CardTalents returns every defined talent in ascending ID order.
func CardTalents() []CardTalent {
	return []CardTalent{
		CardTalentDraconic,
		CardTalentEarth,
		CardTalentElemental,
		CardTalentIce,
		CardTalentLight,
		CardTalentLightning,
		CardTalentRoyal,
		CardTalentShadow,
	}
}
