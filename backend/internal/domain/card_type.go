package domain

import "strconv"

// CardType identifies a card type line (persisted as smallint on cards.type).
// Values must stay in sync with frontend `src/constants/cardType.js`.
type CardType int16

const (
	CardTypeNonAttackAction CardType = iota
	CardTypeAttackAction
	CardTypeAttackReaction
	CardTypeBlock
	CardTypeCompanion
	CardTypeDefenseReaction
	CardTypeDemiHero
	CardTypeEquipment
	CardTypeHero
	CardTypeInstant
	CardTypeMacro
	CardTypeMentor
	CardTypeResource
	CardTypeToken
	CardTypeWeapon
)

var cardTypeNames = map[CardType]string{
	CardTypeNonAttackAction: "Non-Attack Action",
	CardTypeAttackAction:    "Attack Action",
	CardTypeAttackReaction:  "Attack Reaction",
	CardTypeBlock:           "Block",
	CardTypeCompanion:       "Companion",
	CardTypeDefenseReaction: "Defense Reaction",
	CardTypeDemiHero:        "Demi-Hero",
	CardTypeEquipment:       "Equipment",
	CardTypeHero:            "Hero",
	CardTypeInstant:         "Instant",
	CardTypeMacro:           "Macro",
	CardTypeMentor:          "Mentor",
	CardTypeResource:        "Resource",
	CardTypeToken:           "Token",
	CardTypeWeapon:          "Weapon",
}

// Valid reports whether t is a defined CardType constant.
func (t CardType) Valid() bool {
	_, ok := cardTypeNames[t]
	return ok
}

// String returns the display name or "CardType("+decimal+")" if unknown.
func (t CardType) String() string {
	if name, ok := cardTypeNames[t]; ok {
		return name
	}
	return "CardType(" + strconv.FormatInt(int64(t), 10) + ")"
}

// CardTypes returns every defined type in ascending ID order.
func CardTypes() []CardType {
	return []CardType{
		CardTypeNonAttackAction,
		CardTypeAttackAction,
		CardTypeAttackReaction,
		CardTypeBlock,
		CardTypeCompanion,
		CardTypeDefenseReaction,
		CardTypeDemiHero,
		CardTypeEquipment,
		CardTypeHero,
		CardTypeInstant,
		CardTypeMacro,
		CardTypeMentor,
		CardTypeResource,
		CardTypeToken,
		CardTypeWeapon,
	}
}
