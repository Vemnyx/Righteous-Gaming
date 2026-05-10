package domain

import "strconv"

// CardHero identifies a hero (persisted as smallint on cards.hero).
// Values must stay in sync with frontend `src/constants/cardHero.js`.
type CardHero int16

const (
	CardHeroArakni          CardHero = 0
	CardHeroAzalea          CardHero = 1
	CardHeroBenji           CardHero = 2
	CardHeroBoltyn          CardHero = 3
	CardHeroBravo           CardHero = 4
	CardHeroBriar           CardHero = 5
	CardHeroChane           CardHero = 6
	CardHeroDash            CardHero = 7
	CardHeroDataDoll        CardHero = 8
	CardHeroDorinthea       CardHero = 9
	CardHeroEmperor         CardHero = 10
	CardHeroGenisWotchuneed CardHero = 11
	CardHeroIra             CardHero = 12
	CardHeroIyslander       CardHero = 13
	CardHeroKano            CardHero = 14
	CardHeroKassai          CardHero = 15
	CardHeroKatsu           CardHero = 16
	CardHeroKavdaen         CardHero = 17
	CardHeroKayo            CardHero = 18
	CardHeroLevia           CardHero = 19
	CardHeroLexi            CardHero = 20
	CardHeroOldhim          CardHero = 21
	CardHeroPrism           CardHero = 22
	CardHeroRhinar          CardHero = 23
	CardHeroRuudi           CardHero = 24
	CardHeroShiyana         CardHero = 25
	CardHeroTaylor          CardHero = 26
	CardHeroValda           CardHero = 27
	CardHeroViserai         CardHero = 28
	CardHeroYorick          CardHero = 29
)

var cardHeroNames = map[CardHero]string{
	CardHeroArakni:          "Arakni",
	CardHeroAzalea:          "Azalea",
	CardHeroBenji:           "Benji",
	CardHeroBoltyn:          "Boltyn",
	CardHeroBravo:           "Bravo",
	CardHeroBriar:           "Briar",
	CardHeroChane:           "Chane",
	CardHeroDash:            "Dash",
	CardHeroDataDoll:        "Data Doll",
	CardHeroDorinthea:       "Dorinthea",
	CardHeroEmperor:         "Emperor",
	CardHeroGenisWotchuneed: "Genis Wotchuneed",
	CardHeroIra:             "Ira",
	CardHeroIyslander:       "Iyslander",
	CardHeroKano:            "Kano",
	CardHeroKassai:          "Kassai",
	CardHeroKatsu:           "Katsu",
	CardHeroKavdaen:         "Kavdaen",
	CardHeroKayo:            "Kayo",
	CardHeroLevia:           "Levia",
	CardHeroLexi:            "Lexi",
	CardHeroOldhim:          "Oldhim",
	CardHeroPrism:           "Prism",
	CardHeroRhinar:          "Rhinar",
	CardHeroRuudi:           "Ruu'di",
	CardHeroShiyana:         "Shiyana",
	CardHeroTaylor:          "Taylor",
	CardHeroValda:           "Valda",
	CardHeroViserai:         "Viserai",
	CardHeroYorick:          "Yorick",
}

// Valid reports whether h is a defined CardHero constant.
func (h CardHero) Valid() bool {
	_, ok := cardHeroNames[h]
	return ok
}

// String returns the display name or "CardHero("+decimal+")" if unknown.
func (h CardHero) String() string {
	if name, ok := cardHeroNames[h]; ok {
		return name
	}
	return "CardHero(" + strconv.FormatInt(int64(h), 10) + ")"
}

// CardHeroes returns every defined hero constant in ascending ID order.
func CardHeroes() []CardHero {
	return []CardHero{
		CardHeroArakni,
		CardHeroAzalea,
		CardHeroBenji,
		CardHeroBoltyn,
		CardHeroBravo,
		CardHeroBriar,
		CardHeroChane,
		CardHeroDash,
		CardHeroDataDoll,
		CardHeroDorinthea,
		CardHeroEmperor,
		CardHeroGenisWotchuneed,
		CardHeroIra,
		CardHeroIyslander,
		CardHeroKano,
		CardHeroKassai,
		CardHeroKatsu,
		CardHeroKavdaen,
		CardHeroKayo,
		CardHeroLevia,
		CardHeroLexi,
		CardHeroOldhim,
		CardHeroPrism,
		CardHeroRhinar,
		CardHeroRuudi,
		CardHeroShiyana,
		CardHeroTaylor,
		CardHeroValda,
		CardHeroViserai,
		CardHeroYorick,
	}
}
