package domain

import "strconv"

// CardTalent identifies a talent tag (persisted as smallint values in cards.talents).
// Values must stay in sync with frontend `src/constants/cardTalent.js`.
type CardTalent int16

const (
	CardTalentChaos      CardTalent = 0
	CardTalentDraconic   CardTalent = 1
	CardTalentEarth      CardTalent = 2
	CardTalentElemental  CardTalent = 3
	CardTalentIce        CardTalent = 4
	CardTalentLight      CardTalent = 5
	CardTalentLightning  CardTalent = 6
	CardTalentMystic     CardTalent = 7
	CardTalentRevered    CardTalent = 8
	CardTalentReviled    CardTalent = 9
	CardTalentRoyal      CardTalent = 10
	CardTalentShadow     CardTalent = 11
)

var cardTalentNames = map[CardTalent]string{
	CardTalentChaos:      "Chaos",
	CardTalentDraconic:   "Draconic",
	CardTalentEarth:      "Earth",
	CardTalentElemental:  "Elemental",
	CardTalentIce:        "Ice",
	CardTalentLight:      "Light",
	CardTalentLightning:  "Lightning",
	CardTalentMystic:     "Mystic",
	CardTalentRevered:    "Revered",
	CardTalentReviled:    "Reviled",
	CardTalentRoyal:      "Royal",
	CardTalentShadow:     "Shadow",
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
		CardTalentChaos,
		CardTalentDraconic,
		CardTalentEarth,
		CardTalentElemental,
		CardTalentIce,
		CardTalentLight,
		CardTalentLightning,
		CardTalentMystic,
		CardTalentRevered,
		CardTalentReviled,
		CardTalentRoyal,
		CardTalentShadow,
	}
}
