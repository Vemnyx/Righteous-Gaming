package eventusers

import (
	"testing"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
)

var testHeroRows = []repository.HeroMatchRow{
	{ID: 10, Name: "Fai, Rising Rebellion", Young: false},
	{ID: 11, Name: "Fai", Young: true},
	{ID: 20, Name: "Bravo, Showstopper", Young: false},
}

func TestHeroMatcherFullAndBase(t *testing.T) {
	m := NewHeroMatcher(testHeroRows, nil)
	cases := []struct {
		in   string
		want int
	}{
		{"Fai, Rising Rebellion", 10},
		{"fai", 10},
		{"Bravo, Showstopper", 20},
		{"Bravo", 20},
	}
	for _, c := range cases {
		got := m.Match(c.in)
		if got == nil || *got != c.want {
			t.Fatalf("Match(%q) = %v, want %d", c.in, got, c.want)
		}
	}
}

func TestHeroMatcherExactFirstPrefersFullName(t *testing.T) {
	rows := []repository.HeroMatchRow{
		{ID: 30, Name: "Arakni, Marionette", Young: false},
		{ID: 31, Name: "Arakni, 5L!p3d 7hRu 7h3 cR4X", Young: false},
	}
	m := NewHeroMatcher(rows, nil)
	if got := m.MatchExactFirst("Arakni, Marionette"); got == nil || *got != 30 {
		t.Fatalf("MatchExactFirst(Marionette) = %v, want 30", got)
	}
	if got := m.MatchExactFirst("Arakni, 5L!p3d 7hRu 7h3 cR4X"); got == nil || *got != 31 {
		t.Fatalf("MatchExactFirst(Slip) = %v, want 31", got)
	}
	// Base-only label still resolves via fallback.
	if got := m.Match("Arakni"); got == nil {
		t.Fatal("Match(Arakni) expected id")
	}
}

func TestHeroMatcherUnknown(t *testing.T) {
	m := NewHeroMatcher(nil, nil)
	if m.Match("Unknown Hero") != nil {
		t.Fatal("expected nil")
	}
}

func TestHeroMatcherClassicConstructedPrefersAdult(t *testing.T) {
	format := int16(domain.CardFormatClassicConstruction)
	m := NewHeroMatcher(testHeroRows, &format)
	if got := m.Match("fai"); got == nil || *got != 10 {
		t.Fatalf("Match(fai) = %v, want 10", got)
	}
}

func TestHeroMatcherSilverAgePrefersYoung(t *testing.T) {
	format := int16(domain.CardFormatSilverAge)
	m := NewHeroMatcher(testHeroRows, &format)
	if got := m.Match("fai"); got == nil || *got != 11 {
		t.Fatalf("Match(fai) = %v, want 11", got)
	}
}

func TestHeroMatcherLimitedPrefersYoung(t *testing.T) {
	format := int16(domain.CardFormatLimited)
	m := NewHeroMatcher(testHeroRows, &format)
	if got := m.Match("fai"); got == nil || *got != 11 {
		t.Fatalf("Match(fai) = %v, want 11", got)
	}
}
