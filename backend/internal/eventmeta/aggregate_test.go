package eventmeta

import (
	"encoding/json"
	"testing"

	"righteous-gaming/backend/internal/eventusers"
	"righteous-gaming/backend/internal/repository"
)

func TestBuildMetaShareAndWinRates(t *testing.T) {
	pairings, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice", "player2": "Cara",
			"hero1": "Fai", "hero2": "Dromai",
		},
		{
			"player1": "Bob", "player2": "Dan",
			"hero1": "Fai", "hero2": "Fai",
		},
	})
	results, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice", "player2": "Cara",
			"hero1": "Fai", "hero2": "Dromai",
			"winner_name": "Alice", "winner_side": "Player 1",
		},
		{
			"player1": "Bob", "player2": "Cara",
			"hero1": "Fai", "hero2": "Dromai",
			"winner_name": "Cara", "winner_side": "Player 2",
		},
	})

	rounds := []repository.EventRound{{
		RoundNumber: 1,
		Pairings:    pairings,
		Results:     results,
	}}

	matcher := eventusers.NewHeroMatcher([]repository.HeroMatchRow{
		{ID: 1, Name: "Fai, Dracai of Aegis", Young: false},
		{ID: 2, Name: "Dromai, Ash Artist", Young: false},
	}, nil)

	catalog := map[int]HeroCatalog{
		1: {Name: "Fai, Dracai of Aegis"},
		2: {Name: "Dromai, Ash Artist"},
	}

	snap := Build(rounds, 1, 1, nil, catalog, matcher)

	if snap.Overall.TotalDecks != 4 {
		t.Fatalf("total decks = %d, want 4", snap.Overall.TotalDecks)
	}
	if snap.Overall.SourceRound != 1 {
		t.Fatalf("source round = %d, want 1", snap.Overall.SourceRound)
	}
	if len(snap.Overall.Heroes) != 2 {
		t.Fatalf("meta heroes = %d, want 2", len(snap.Overall.Heroes))
	}
	if snap.Overall.Heroes[0].Count != 3 || snap.Overall.Heroes[0].Pct != 75 {
		t.Fatalf("Fai share = %+v", snap.Overall.Heroes[0])
	}
	if len(snap.HeroWinRates) != 2 {
		t.Fatalf("win rate rows = %d, want 2", len(snap.HeroWinRates))
	}
	if len(snap.MatchupHeroes) != 2 {
		t.Fatalf("matchup heroes = %d, want 2", len(snap.MatchupHeroes))
	}
	if snap.MatchupMatrix[0][1] == nil || *snap.MatchupMatrix[0][1] != 50 {
		t.Fatalf("Fai vs Dromai win rate = %v, want 50", snap.MatchupMatrix[0][1])
	}
}

func TestBuildMetaShareSeparatesArakniVariants(t *testing.T) {
	pairings, _ := json.Marshal([]map[string]any{
		{
			"player1": "P1", "player2": "P2",
			"hero1": "Arakni, Marionette", "hero2": "Arakni, 5L!p3d 7hRu 7h3 cR4X",
		},
	})
	rounds := []repository.EventRound{{RoundNumber: 1, Pairings: pairings}}

	matcher := eventusers.NewHeroMatcher([]repository.HeroMatchRow{
		{ID: 30, Name: "Arakni, Marionette", Young: false},
		{ID: 31, Name: "Arakni, 5L!p3d 7hRu 7h3 cR4X", Young: false},
	}, nil)
	catalog := map[int]HeroCatalog{
		30: {Name: "Arakni, Marionette"},
		31: {Name: "Arakni, 5L!p3d 7hRu 7h3 cR4X"},
	}

	snap := Build(rounds, 1, 5, nil, catalog, matcher)
	if len(snap.Overall.Heroes) != 2 {
		t.Fatalf("meta heroes = %d, want 2 distinct Arakni variants", len(snap.Overall.Heroes))
	}
}

func TestBuildFiltersRoundRange(t *testing.T) {
	day1Results, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice", "player2": "Bob",
			"hero1": "Fai", "hero2": "Fai",
			"winner_name": "Alice", "winner_side": "Player 1",
		},
	})
	day2Results, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice", "player2": "Cara",
			"hero1": "Fai", "hero2": "Dromai",
			"winner_name": "Cara", "winner_side": "Player 2",
		},
	})
	day1Pairings, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice", "player2": "Bob",
			"hero1": "Fai", "hero2": "Fai",
		},
	})
	day2Pairings, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice", "player2": "Cara",
			"hero1": "Dromai", "hero2": "Fai",
		},
	})

	rounds := []repository.EventRound{
		{RoundNumber: 1, Pairings: day1Pairings, Results: day1Results},
		{RoundNumber: 9, Pairings: day2Pairings, Results: day2Results},
	}

	matcher := eventusers.NewHeroMatcher([]repository.HeroMatchRow{
		{ID: 1, Name: "Fai, Dracai of Aegis", Young: false},
		{ID: 2, Name: "Dromai, Ash Artist", Young: false},
	}, nil)
	catalog := map[int]HeroCatalog{
		1: {Name: "Fai, Dracai of Aegis"},
		2: {Name: "Dromai, Ash Artist"},
	}

	day1 := Build(rounds, 1, 8, nil, catalog, matcher)
	if day1.Overall.SourceRound != 1 {
		t.Fatalf("day1 source round = %d, want 1", day1.Overall.SourceRound)
	}
	if day1.Overall.TotalDecks != 2 {
		t.Fatalf("day1 decks = %d, want 2", day1.Overall.TotalDecks)
	}

	day2 := Build(rounds, 9, 9, nil, catalog, matcher)
	if day2.Overall.SourceRound != 9 {
		t.Fatalf("day2 source round = %d, want 9", day2.Overall.SourceRound)
	}
	if day2.Overall.TotalDecks != 2 {
		t.Fatalf("day2 decks = %d, want 2", day2.Overall.TotalDecks)
	}
	if day2.Overall.Heroes[0].Name != "Dromai, Ash Artist" {
		t.Fatalf("day2 top hero = %q, want Dromai", day2.Overall.Heroes[0].Name)
	}
	if len(day2.HeroWinRates) != 2 {
		t.Fatalf("day2 win rate rows = %d, want 2", len(day2.HeroWinRates))
	}
}
