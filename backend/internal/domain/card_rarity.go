package domain

import "strconv"

// CardRarity identifies a card rarity (persisted as smallint on cards).
// Values must stay in sync with frontend `src/constants/cardRarity.js`.
type CardRarity int16

const (
	CardRarityToken     CardRarity = 0
	CardRarityCommon    CardRarity = 1
	CardRarityRare      CardRarity = 2
	CardRaritySuperRare CardRarity = 3
	CardRarityMajestic  CardRarity = 4
	CardRarityLegendary CardRarity = 5
	CardRarityFabled    CardRarity = 6
	CardRarityPromo     CardRarity = 7
)

var cardRarityNames = map[CardRarity]string{
	CardRarityToken:     "Token",
	CardRarityCommon:    "Common",
	CardRarityRare:      "Rare",
	CardRaritySuperRare: "Super Rare",
	CardRarityMajestic:  "Majestic",
	CardRarityLegendary: "Legendary",
	CardRarityFabled:    "Fabled",
	CardRarityPromo:     "Promo",
}

// Valid reports whether r is a defined CardRarity constant.
func (r CardRarity) Valid() bool {
	_, ok := cardRarityNames[r]
	return ok
}

// String returns the wire/display name ("Token", "Super Rare", …) or "CardRarity("+decimal+")" if unknown.
func (r CardRarity) String() string {
	if name, ok := cardRarityNames[r]; ok {
		return name
	}
	return "CardRarity(" + strconv.FormatInt(int64(r), 10) + ")"
}

// CardRarities returns every defined rarity constant in ascending ID order.
func CardRarities() []CardRarity {
	return []CardRarity{
		CardRarityToken,
		CardRarityCommon,
		CardRarityRare,
		CardRaritySuperRare,
		CardRarityMajestic,
		CardRarityLegendary,
		CardRarityFabled,
		CardRarityPromo,
	}
}
