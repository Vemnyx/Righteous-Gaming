package eventmeta

import (
	"encoding/json"
	"testing"

	"righteous-gaming/backend/internal/eventusers"
	"righteous-gaming/backend/internal/repository"
)

func TestBuildMetaShareAndWinRates(t *testing.T) {
	standings, _ := json.Marshal([]map[string]any{
		{"rank": 1, "player": "Alice", "hero": "Fai", "wins": 3},
		{"rank": 2, "player": "Bob", "hero": "Fai", "wins": 2},
		{"rank": 3, "player": "Cara", "hero": "Dromai", "wins": 2},
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
		Standings:   standings,
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

	if snap.Overall.TotalDecks != 3 {
		t.Fatalf("total decks = %d, want 3", snap.Overall.TotalDecks)
	}
	if len(snap.Overall.Heroes) != 2 {
		t.Fatalf("meta heroes = %d, want 2", len(snap.Overall.Heroes))
	}
	if snap.Overall.Heroes[0].Count != 2 || snap.Overall.Heroes[0].Pct != 66.7 {
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
	standings, _ := json.Marshal([]map[string]any{
		{"rank": 1, "player": "P1", "hero": "Arakni, Marionette", "wins": 3},
		{"rank": 2, "player": "P2", "hero": "Arakni, 5L!p3d 7hRu 7h3 cR4X", "wins": 2},
	})
	rounds := []repository.EventRound{{RoundNumber: 5, Standings: standings}}

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
	day1Standings, _ := json.Marshal([]map[string]any{
		{"rank": 1, "player": "Alice", "hero": "Fai", "wins": 1},
	})
	day2Standings, _ := json.Marshal([]map[string]any{
		{"rank": 1, "player": "Alice", "hero": "Dromai", "wins": 2},
	})

	rounds := []repository.EventRound{
		{RoundNumber: 8, Standings: day1Standings, Results: day1Results},
		{RoundNumber: 9, Standings: day2Standings, Results: day2Results},
	}

	matcher := eventusers.NewHeroMatcher([]repository.HeroMatchRow{
		{ID: 1, Name: "Fai, Dracai of Aegis", Young: false},
		{ID: 2, Name: "Dromai, Ash Artist", Young: false},
	}, nil)
	catalog := map[int]HeroCatalog{
		1: {Name: "Fai, Dracai of Aegis"},
		2: {Name: "Dromai, Ash Artist"},
	}

	day2 := Build(rounds, 9, 9, nil, catalog, matcher)
	if day2.Overall.TotalDecks != 1 {
		t.Fatalf("day2 decks = %d, want 1", day2.Overall.TotalDecks)
	}
	if day2.Overall.Heroes[0].Name != "Dromai, Ash Artist" {
		t.Fatalf("day2 hero = %q, want Dromai", day2.Overall.Heroes[0].Name)
	}
	if len(day2.HeroWinRates) != 2 {
		t.Fatalf("day2 win rate rows = %d, want 2", len(day2.HeroWinRates))
	}
}
