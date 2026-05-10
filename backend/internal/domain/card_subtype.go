package domain

import "strconv"

// CardSubtype identifies a card subtype token (persisted as smallint in cards.subtypes).
// Token strings match the legacy TypeScript enum values ("1H", "Non-Attack", …).
// Values must stay in sync with frontend `src/constants/cardSubtype.js`.
type CardSubtype int16

const (
	CardSubtypeOneHanded CardSubtype = iota
	CardSubtypeTwoHanded
	CardSubtypeAffliction
	CardSubtypeAlly
	CardSubtypeAngel
	CardSubtypeArms
	CardSubtypeArrow
	CardSubtypeAsh
	CardSubtypeAttack
	CardSubtypeAura
	CardSubtypeAxe
	CardSubtypeBase
	CardSubtypeBook
	CardSubtypeBow
	CardSubtypeCannon
	CardSubtypeChest
	CardSubtypeChi
	CardSubtypeClaw
	CardSubtypeClub
	CardSubtypeConstruct
	CardSubtypeDagger
	CardSubtypeDemon
	CardSubtypeDragon
	CardSubtypeEvo
	CardSubtypeFiddle
	CardSubtypeFigment
	CardSubtypeFlail
	CardSubtypeGem
	CardSubtypeGun
	CardSubtypeHammer
	CardSubtypeHead
	CardSubtypeInvocation
	CardSubtypeItem
	CardSubtypeLandmark
	CardSubtypeLog
	CardSubtypeLute
	CardSubtypeLegs
	CardSubtypeNonAttack
	CardSubtypeOffHand
	CardSubtypeOrb
	CardSubtypePistol
	CardSubtypePitFighter
	CardSubtypePolearm
	CardSubtypeQuiver
	CardSubtypeRock
	CardSubtypeShuriken
	CardSubtypeScepter
	CardSubtypeScroll
	CardSubtypeScythe
	CardSubtypeSong
	CardSubtypeStaff
	CardSubtypeSword
	CardSubtypeTrap
	CardSubtypeWrench
	CardSubtypeYoung
)

var cardSubtypeNames = map[CardSubtype]string{
	CardSubtypeOneHanded:  "1H",
	CardSubtypeTwoHanded:  "2H",
	CardSubtypeAffliction: "Affliction",
	CardSubtypeAlly:       "Ally",
	CardSubtypeAngel:      "Angel",
	CardSubtypeArms:       "Arms",
	CardSubtypeArrow:      "Arrow",
	CardSubtypeAsh:        "Ash",
	CardSubtypeAttack:     "Attack",
	CardSubtypeAura:       "Aura",
	CardSubtypeAxe:        "Axe",
	CardSubtypeBase:       "Base",
	CardSubtypeBook:       "Book",
	CardSubtypeBow:        "Bow",
	CardSubtypeCannon:     "Cannon",
	CardSubtypeChest:      "Chest",
	CardSubtypeChi:        "Chi",
	CardSubtypeClaw:       "Claw",
	CardSubtypeClub:       "Club",
	CardSubtypeConstruct:  "Construct",
	CardSubtypeDagger:     "Dagger",
	CardSubtypeDemon:      "Demon",
	CardSubtypeDragon:     "Dragon",
	CardSubtypeEvo:        "Evo",
	CardSubtypeFiddle:     "Fiddle",
	CardSubtypeFigment:    "Figment",
	CardSubtypeFlail:      "Flail",
	CardSubtypeGem:        "Gem",
	CardSubtypeGun:        "Gun",
	CardSubtypeHammer:     "Hammer",
	CardSubtypeHead:       "Head",
	CardSubtypeInvocation: "Invocation",
	CardSubtypeItem:       "Item",
	CardSubtypeLandmark:   "Landmark",
	CardSubtypeLog:        "Log",
	CardSubtypeLute:       "Lute",
	CardSubtypeLegs:       "Legs",
	CardSubtypeNonAttack:  "Non-Attack",
	CardSubtypeOffHand:    "Off-Hand",
	CardSubtypeOrb:        "Orb",
	CardSubtypePistol:     "Pistol",
	CardSubtypePitFighter: "Pit-Fighter",
	CardSubtypePolearm:    "Polearm",
	CardSubtypeQuiver:     "Quiver",
	CardSubtypeRock:       "Rock",
	CardSubtypeShuriken:   "Shuriken",
	CardSubtypeScepter:    "Scepter",
	CardSubtypeScroll:     "Scroll",
	CardSubtypeScythe:     "Scythe",
	CardSubtypeSong:       "Song",
	CardSubtypeStaff:      "Staff",
	CardSubtypeSword:      "Sword",
	CardSubtypeTrap:       "Trap",
	CardSubtypeWrench:     "Wrench",
	CardSubtypeYoung:      "Young",
}

var cardSubtypeByToken map[string]CardSubtype

func init() {
	cardSubtypeByToken = make(map[string]CardSubtype, len(cardSubtypeNames))
	for id, tok := range cardSubtypeNames {
		cardSubtypeByToken[tok] = id
	}
}

// Valid reports whether s is a defined CardSubtype constant.
func (s CardSubtype) Valid() bool {
	_, ok := cardSubtypeNames[s]
	return ok
}

// Token returns the legacy subtype string ("1H", "Non-Attack", …) or "" if unknown.
func (s CardSubtype) Token() string {
	return cardSubtypeNames[s]
}

// String satisfies fmt.Stringer; echoes Token() for defined values.
func (s CardSubtype) String() string {
	if t := s.Token(); t != "" {
		return t
	}
	return "CardSubtype(" + strconv.FormatInt(int64(s), 10) + ")"
}

// CardSubtypeFromToken maps an import/display token to its numeric ID (e.g. "1H", "Non-Attack").
func CardSubtypeFromToken(tok string) (CardSubtype, bool) {
	sub, ok := cardSubtypeByToken[tok]
	return sub, ok
}

// CardSubtypes returns IDs 0..CardSubtypeYoung in order.
func CardSubtypes() []CardSubtype {
	out := make([]CardSubtype, 0, len(cardSubtypeNames))
	for s := CardSubtype(0); s <= CardSubtypeYoung; s++ {
		out = append(out, s)
	}
	return out
}
