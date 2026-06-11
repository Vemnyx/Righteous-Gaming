package eventusers

import (
	"testing"

	"righteous-gaming/backend/internal/repository"
)

func TestHeroMatcherFullAndBase(t *testing.T) {
	m := NewHeroMatcher([]repository.HeroMatchRow{
		{ID: 10, Name: "Fai, Rising Rebellion", Young: false},
		{ID: 11, Name: "Fai", Young: true},
		{ID: 20, Name: "Bravo, Showstopper", Young: false},
	})
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

func TestHeroMatcherUnknown(t *testing.T) {
	m := NewHeroMatcher(nil)
	if m.Match("Unknown Hero") != nil {
		t.Fatal("expected nil")
	}
}
