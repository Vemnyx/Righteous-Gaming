package domain

import "strconv"

// CardRarity identifies a card rarity (persisted as smallint on cards).
// Values must stay in sync with frontend `src/constants/cardRarity.js`.
type CardRarity int16

const (
	CardRarityBasic CardRarity = iota
	CardRarityToken
	CardRarityCommon
	CardRarityRare
	CardRaritySuperRare
	CardRarityMajestic
	CardRarityMarvel
	CardRarityLegendary
	CardRarityFabled
	CardRarityPromo
)

var cardRarityNames = map[CardRarity]string{
	CardRarityBasic:     "Basic",
	CardRarityToken:     "Token",
	CardRarityCommon:    "Common",
	CardRarityRare:      "Rare",
	CardRaritySuperRare: "Super Rare",
	CardRarityMajestic:  "Majestic",
	CardRarityMarvel:    "Marvel",
	CardRarityLegendary: "Legendary",
	CardRarityFabled:    "Fabled",
	CardRarityPromo:     "Promo",
}

// Valid reports whether r is a defined CardRarity constant.
func (r CardRarity) Valid() bool {
	_, ok := cardRarityNames[r]
	return ok
}

// String returns the wire/display name or "CardRarity("+decimal+")" if unknown.
func (r CardRarity) String() string {
	if name, ok := cardRarityNames[r]; ok {
		return name
	}
	return "CardRarity(" + strconv.FormatInt(int64(r), 10) + ")"
}

// CardRarities returns every defined rarity constant in ascending ID order.
func CardRarities() []CardRarity {
	return []CardRarity{
		CardRarityBasic,
		CardRarityToken,
		CardRarityCommon,
		CardRarityRare,
		CardRaritySuperRare,
		CardRarityMajestic,
		CardRarityMarvel,
		CardRarityLegendary,
		CardRarityFabled,
		CardRarityPromo,
	}
}
