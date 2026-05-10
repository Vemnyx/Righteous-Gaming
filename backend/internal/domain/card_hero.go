package domain

import "strconv"

// CardHero identifies a hero (persisted as smallint on cards.hero).
// Values must stay in sync with frontend `src/constants/cardHero.js`.
type CardHero int16

const (
	CardHeroArakni CardHero = iota
	CardHeroAurora
	CardHeroAurora2
	CardHeroAzalea
	CardHeroBenji
	CardHeroBetsy
	CardHeroBlaze
	CardHeroBolfar
	CardHeroBoltyn
	CardHeroBravo
	CardHeroBrevant
	CardHeroBriar
	CardHeroBrutus
	CardHeroChane
	CardHeroCindra
	CardHeroCrackni
	CardHeroCrix
	CardHeroDash
	CardHeroDataDoll
	CardHeroDorinthea
	CardHeroDromai
	CardHeroEmperor
	CardHeroEnigma
	CardHeroFai
	CardHeroFang
	CardHeroFlorian
	CardHeroFrankie
	CardHeroGenis
	CardHeroGravyBones
	CardHeroHala
	CardHeroIra
	CardHeroIyslander
	CardHeroJarl
	CardHeroKano
	CardHeroKassai
	CardHeroKatsu
	CardHeroKavdaen
	CardHeroKayo
	CardHeroKox
	CardHeroLevia
	CardHeroLexi
	CardHeroLibrarian
	CardHeroLyath
	CardHeroMarlynn
	CardHeroMaxx
	CardHeroMelody
	CardHeroNuu
	CardHeroOldhim
	CardHeroOlympia
	CardHeroOscilio
	CardHeroBroscilio
	CardHeroPleiades
	CardHeroPrism
	CardHeroPuffin
	CardHeroReya
	CardHeroRhinar
	CardHeroRiptide
	CardHeroRKO
	CardHeroRuudi
	CardHeroShiyana
	CardHeroSlippy
	CardHeroSquizzy
	CardHeroScurv
	CardHeroStarvo
	CardHeroTaipanis
	CardHeroTaylor
	CardHeroTeklovossen
	CardHeroTerra
	CardHeroTheryon
	CardHeroTuffnut
	CardHeroUzuri
	CardHeroValda
	CardHeroVerdance
	CardHeroVictor
	CardHeroVynnset
	CardHeroViserai
	CardHeroYorick
	CardHeroYoji
	CardHeroZen
	CardHeroZyggy
)

var cardHeroNames = map[CardHero]string{
	CardHeroArakni:      "Arakni",
	CardHeroAurora:      "Aurora",
	CardHeroAurora2:     "Aurora2",
	CardHeroAzalea:      "Azalea",
	CardHeroBenji:       "Benji",
	CardHeroBetsy:       "Betsy",
	CardHeroBlaze:       "Blaze",
	CardHeroBolfar:      "Bolfar",
	CardHeroBoltyn:      "Boltyn",
	CardHeroBravo:       "Bravo",
	CardHeroBrevant:     "Brevant",
	CardHeroBriar:       "Briar",
	CardHeroBrutus:      "Brutus",
	CardHeroChane:       "Chane",
	CardHeroCindra:      "Cindra",
	CardHeroCrackni:     "Crackni",
	CardHeroCrix:        "Crix",
	CardHeroDash:        "Dash",
	CardHeroDataDoll:    "Data Doll",
	CardHeroDorinthea:   "Dorinthea",
	CardHeroDromai:      "Dromai",
	CardHeroEmperor:     "Emperor",
	CardHeroEnigma:      "Enigma",
	CardHeroFai:         "Fai",
	CardHeroFang:        "Fang",
	CardHeroFlorian:     "Florian",
	CardHeroFrankie:     "Frankie",
	CardHeroGenis:       "Genis",
	CardHeroGravyBones:  "Gravy Bones",
	CardHeroHala:        "Hala",
	CardHeroIra:         "Ira",
	CardHeroIyslander:   "Iyslander",
	CardHeroJarl:        "Jarl",
	CardHeroKano:        "Kano",
	CardHeroKassai:      "Kassai",
	CardHeroKatsu:       "Katsu",
	CardHeroKavdaen:     "Kavdaen",
	CardHeroKayo:        "Kayo",
	CardHeroKox:         "Kox",
	CardHeroLevia:       "Levia",
	CardHeroLexi:        "Lexi",
	CardHeroLibrarian:   "Librarian",
	CardHeroLyath:       "Lyath",
	CardHeroMarlynn:     "Marlynn",
	CardHeroMaxx:        "Maxx",
	CardHeroMelody:      "Melody",
	CardHeroNuu:         "Nuu",
	CardHeroOldhim:      "Oldhim",
	CardHeroOlympia:     "Olympia",
	CardHeroOscilio:     "Oscilio",
	CardHeroBroscilio:   "Broscilio",
	CardHeroPleiades:    "Pleiades",
	CardHeroPrism:       "Prism",
	CardHeroPuffin:      "Puffin",
	CardHeroReya:        "Reya",
	CardHeroRhinar:      "Rhinar",
	CardHeroRiptide:     "Riptide",
	CardHeroRKO:         "RKO",
	CardHeroRuudi:       "Ruu'di",
	CardHeroShiyana:     "Shiyana",
	CardHeroSlippy:      "Slippy",
	CardHeroSquizzy:     "Squizzy",
	CardHeroScurv:       "Scurv",
	CardHeroStarvo:      "Starvo",
	CardHeroTaipanis:    "Taipanis",
	CardHeroTaylor:      "Taylor",
	CardHeroTeklovossen: "Teklovossen",
	CardHeroTerra:       "Terra",
	CardHeroTheryon:     "Theryon",
	CardHeroTuffnut:     "Tuffnut",
	CardHeroUzuri:       "Uzuri",
	CardHeroValda:       "Valda",
	CardHeroVerdance:    "Verdance",
	CardHeroVictor:      "Victor",
	CardHeroVynnset:     "Vynnset",
	CardHeroViserai:     "Viserai",
	CardHeroYorick:      "Yorick",
	CardHeroYoji:        "Yoji",
	CardHeroZen:         "Zen",
	CardHeroZyggy:       "Zyggy",
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
		CardHeroAurora,
		CardHeroAurora2,
		CardHeroAzalea,
		CardHeroBenji,
		CardHeroBetsy,
		CardHeroBlaze,
		CardHeroBolfar,
		CardHeroBoltyn,
		CardHeroBravo,
		CardHeroBrevant,
		CardHeroBriar,
		CardHeroBrutus,
		CardHeroChane,
		CardHeroCindra,
		CardHeroCrackni,
		CardHeroCrix,
		CardHeroDash,
		CardHeroDataDoll,
		CardHeroDorinthea,
		CardHeroDromai,
		CardHeroEmperor,
		CardHeroEnigma,
		CardHeroFai,
		CardHeroFang,
		CardHeroFlorian,
		CardHeroFrankie,
		CardHeroGenis,
		CardHeroGravyBones,
		CardHeroHala,
		CardHeroIra,
		CardHeroIyslander,
		CardHeroJarl,
		CardHeroKano,
		CardHeroKassai,
		CardHeroKatsu,
		CardHeroKavdaen,
		CardHeroKayo,
		CardHeroKox,
		CardHeroLevia,
		CardHeroLexi,
		CardHeroLibrarian,
		CardHeroLyath,
		CardHeroMarlynn,
		CardHeroMaxx,
		CardHeroMelody,
		CardHeroNuu,
		CardHeroOldhim,
		CardHeroOlympia,
		CardHeroOscilio,
		CardHeroBroscilio,
		CardHeroPleiades,
		CardHeroPrism,
		CardHeroPuffin,
		CardHeroReya,
		CardHeroRhinar,
		CardHeroRiptide,
		CardHeroRKO,
		CardHeroRuudi,
		CardHeroShiyana,
		CardHeroSlippy,
		CardHeroSquizzy,
		CardHeroScurv,
		CardHeroStarvo,
		CardHeroTaipanis,
		CardHeroTaylor,
		CardHeroTeklovossen,
		CardHeroTerra,
		CardHeroTheryon,
		CardHeroTuffnut,
		CardHeroUzuri,
		CardHeroValda,
		CardHeroVerdance,
		CardHeroVictor,
		CardHeroVynnset,
		CardHeroViserai,
		CardHeroYorick,
		CardHeroYoji,
		CardHeroZen,
		CardHeroZyggy,
	}
}
