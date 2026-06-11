package domain_test

import (
	"testing"

	"righteous-gaming/backend/internal/domain"
)

func TestFormatUsesYoungHeroes(t *testing.T) {
	cases := []struct {
		format domain.CardFormat
		young  bool
		ok     bool
	}{
		{domain.CardFormatLimited, true, true},
		{domain.CardFormatSilverAge, true, true},
		{domain.CardFormatGoldenAge, false, true},
		{domain.CardFormatClassicConstruction, false, true},
		{domain.CardFormatLivingLegend, false, true},
		{domain.CardFormat(99), false, false},
	}
	for _, tc := range cases {
		gotYoung, gotOK := domain.FormatUsesYoungHeroes(tc.format)
		if gotYoung != tc.young || gotOK != tc.ok {
			t.Fatalf("FormatUsesYoungHeroes(%v) = (%v, %v), want (%v, %v)", tc.format, gotYoung, gotOK, tc.young, tc.ok)
		}
	}
}
