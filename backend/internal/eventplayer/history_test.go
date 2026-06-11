package eventplayer

import (
	"encoding/json"
	"testing"

	"righteous-gaming/backend/internal/repository"
)

func TestBuildHistoryFromResultsAndPairings(t *testing.T) {
	results, _ := json.Marshal([]map[string]any{
		{
			"player1": "Alice Smith", "player2": "Bob Jones",
			"hero1": "Fai", "hero2": "Dromai",
			"winner_name": "Alice Smith", "winner_side": "Player 1",
		},
	})
	pairings, _ := json.Marshal([]map[string]any{
		{
			"table": 5,
			"player1": "Alice Smith", "player2": "Cara Lee",
			"hero1": "Fai", "hero2": "Iyslander",
		},
	})

	rounds := []repository.EventRound{
		{RoundNumber: 1, Results: results},
		{RoundNumber: 2, Pairings: pairings},
	}

	hist := BuildHistory(rounds, "Alice Smith")
	if hist.Wins != 1 || hist.Losses != 0 {
		t.Fatalf("record = %d-%d, want 1-0", hist.Wins, hist.Losses)
	}
	if len(hist.Rows) != 2 {
		t.Fatalf("rows = %d, want 2", len(hist.Rows))
	}
	if hist.Rows[0].Result != "win" || hist.Rows[0].Opponent != "Bob Jones" {
		t.Fatalf("round 1 = %+v", hist.Rows[0])
	}
	if hist.Rows[1].Result != "pending" || hist.Rows[1].Opponent != "Cara Lee" {
		t.Fatalf("round 2 = %+v", hist.Rows[1])
	}
}
