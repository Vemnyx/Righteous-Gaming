package handler

import (
	"fmt"
	"testing"
	"time"

	"righteous-gaming/backend/internal/repository"
)

func TestFormatSessionWhenForDiscord_now(t *testing.T) {
	got := formatSessionWhenForDiscord(&repository.PlayTestingSession{})
	if got != "Now" {
		t.Fatalf("got %q want Now", got)
	}
}

func TestFormatSessionWhenForDiscord_range(t *testing.T) {
	start := time.Date(2026, 9, 1, 15, 0, 0, 0, time.UTC)
	end := start.Add(2 * time.Hour)
	got := formatSessionWhenForDiscord(&repository.PlayTestingSession{
		Timeframes: []repository.PlayTestingSessionTimeframe{
			{StartsAt: start, EndsAt: &end},
		},
	})
	want := fmt.Sprintf("<t:%d:f> – <t:%d:f>", start.Unix(), end.Unix())
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestHeroNamesForSide(t *testing.T) {
	heroes := []repository.PlayTestingSessionHero{
		{Side: repository.PlayTestingHeroSideWith, Name: " Bravo "},
		{Side: repository.PlayTestingHeroSideAgainst, Name: "Kayo"},
		{Side: repository.PlayTestingHeroSideWith, Name: "Ira"},
	}
	got := heroNamesForSide(heroes, repository.PlayTestingHeroSideWith)
	if got != "Bravo, Ira" {
		t.Fatalf("got %q", got)
	}
	if heroNamesForSide(heroes, 99) != "Any / unspecified" {
		t.Fatal("expected any/unspecified for empty side")
	}
}
