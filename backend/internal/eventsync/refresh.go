package eventsync

import (
	"encoding/json"
	"strings"

	"righteous-gaming/backend/internal/repository"
)

func jsonArrayLen(raw json.RawMessage) int {
	if len(raw) == 0 {
		return 0
	}
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return 0
	}
	var arr []json.RawMessage
	if err := json.Unmarshal(raw, &arr); err != nil {
		return 0
	}
	return len(arr)
}

// roundNeedsRefresh reports whether a stored round should be re-scraped.
// The latest round is always refreshed so live results and standings stay current.
func roundNeedsRefresh(er repository.EventRound, isLatest bool) bool {
	if isLatest {
		return true
	}
	pairings := jsonArrayLen(er.Pairings)
	results := jsonArrayLen(er.Results)
	standings := jsonArrayLen(er.Standings)
	if pairings > 0 && results == 0 {
		return true
	}
	if pairings > 0 && results < pairings {
		return true
	}
	if results > 0 && standings == 0 {
		return true
	}
	return false
}
