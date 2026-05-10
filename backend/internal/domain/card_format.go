package domain

import "strconv"

// CardFormat identifies a format legality tag (persisted as smallint values in cards.formats).
// Values must stay in sync with frontend `src/constants/cardFormat.js`.
type CardFormat int16

const (
	CardFormatLimited             CardFormat = 0
	CardFormatSilverAge           CardFormat = 1
	CardFormatGoldenAge           CardFormat = 2
	CardFormatClassicConstruction CardFormat = 3
	CardFormatLivingLegend        CardFormat = 4
)

var cardFormatNames = map[CardFormat]string{
	CardFormatLimited:             "Limited",
	CardFormatSilverAge:           "Silver Age",
	CardFormatGoldenAge:           "Golden Age",
	CardFormatClassicConstruction: "Classic Construction",
	CardFormatLivingLegend:        "Living Legend",
}

// Valid reports whether f is a defined CardFormat constant.
func (f CardFormat) Valid() bool {
	_, ok := cardFormatNames[f]
	return ok
}

// String returns the display name or "CardFormat("+decimal+")" if unknown.
func (f CardFormat) String() string {
	if name, ok := cardFormatNames[f]; ok {
		return name
	}
	return "CardFormat(" + strconv.FormatInt(int64(f), 10) + ")"
}

// CardFormats returns every defined format in ascending ID order.
func CardFormats() []CardFormat {
	return []CardFormat{
		CardFormatLimited,
		CardFormatSilverAge,
		CardFormatGoldenAge,
		CardFormatClassicConstruction,
		CardFormatLivingLegend,
	}
}
