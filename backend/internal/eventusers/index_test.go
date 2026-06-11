package eventusers

import (
	"encoding/json"
	"testing"
)

func TestFormatDetailStanding(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"rank": 4, "hero": "Fai", "wins": 3})
	got := FormatDetail(KindStanding, payload)
	if got != "Rank 4 · Fai · 3 wins" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatDetailPairing(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"table": 12, "opponent": "Jane Doe", "hero": "Ira"})
	got := FormatDetail(KindPairing, payload)
	if got != "Table 12 vs Jane Doe · Ira" {
		t.Fatalf("got %q", got)
	}
}

func TestFormatDetailResultWin(t *testing.T) {
	payload, _ := json.Marshal(map[string]any{"outcome": "win", "winner_side": "Player 1"})
	got := FormatDetail(KindResult, payload)
	if got != "Win · Player 1" {
		t.Fatalf("got %q", got)
	}
}
