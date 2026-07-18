package eventsync

import (
	"encoding/json"
	"testing"

	"righteous-gaming/backend/internal/repository"
)

func TestRoundNeedsRefresh(t *testing.T) {
	pairings := json.RawMessage(`[{"table":1}]`)
	results := json.RawMessage(`[{"player1":"A","player2":"B"}]`)
	standings := json.RawMessage(`[{"rank":1}]`)

	cases := []struct {
		name     string
		er       repository.EventRound
		isLatest bool
		want     bool
	}{
		{
			name: "latest round always refreshes",
			er: repository.EventRound{
				Pairings: pairings, Results: results, Standings: standings,
			},
			isLatest: true,
			want:     true,
		},
		{
			name: "pairings without results",
			er: repository.EventRound{
				Pairings: pairings, Results: json.RawMessage(`[]`), Standings: json.RawMessage(`[]`),
			},
			want: true,
		},
		{
			name: "partial results",
			er: repository.EventRound{
				Pairings:  json.RawMessage(`[{},{}]`),
				Results:   json.RawMessage(`[{}]`),
				Standings: json.RawMessage(`[]`),
			},
			want: true,
		},
		{
			name: "results without standings",
			er: repository.EventRound{
				Pairings: pairings, Results: results, Standings: json.RawMessage(`[]`),
			},
			want: true,
		},
		{
			name: "empty pairings refreshes",
			er: repository.EventRound{
				Pairings: json.RawMessage(`[]`), Results: json.RawMessage(`[]`), Standings: json.RawMessage(`[]`),
			},
			want: true,
		},
		{
			name: "complete older round",
			er: repository.EventRound{
				Pairings: pairings, Results: results, Standings: standings,
			},
			want: false,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := roundNeedsRefresh(tc.er, tc.isLatest); got != tc.want {
				t.Fatalf("roundNeedsRefresh() = %v, want %v", got, tc.want)
			}
		})
	}
}
