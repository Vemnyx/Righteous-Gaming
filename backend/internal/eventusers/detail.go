package eventusers

import (
	"encoding/json"
	"strconv"
)

// FormatDetail renders a human-readable summary from a stored payload.
func FormatDetail(kind string, payload json.RawMessage) string {
	switch kind {
	case KindStanding:
		var row struct {
			Rank int    `json:"rank"`
			Hero string `json:"hero"`
			Wins int    `json:"wins"`
		}
		if json.Unmarshal(payload, &row) != nil {
			return ""
		}
		return "Rank " + strconv.Itoa(row.Rank) + " · " + row.Hero + " · " + strconv.Itoa(row.Wins) + " wins"
	case KindPairing:
		var row struct {
			Table    int    `json:"table"`
			Opponent string `json:"opponent"`
			Hero     string `json:"hero"`
		}
		if json.Unmarshal(payload, &row) != nil {
			return ""
		}
		return "Table " + strconv.Itoa(row.Table) + " vs " + row.Opponent + " · " + row.Hero
	case KindResult:
		var row struct {
			Outcome    string `json:"outcome"`
			WinnerSide string `json:"winner_side"`
		}
		if json.Unmarshal(payload, &row) != nil {
			return ""
		}
		outcome := row.Outcome
		if outcome == "win" {
			outcome = "Win"
		} else if outcome == "loss" {
			outcome = "Loss"
		}
		return outcome + " · " + row.WinnerSide
	default:
		return ""
	}
}
