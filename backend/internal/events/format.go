package events

import (
	"strings"

	"righteous-gaming/backend/internal/fabrary"
)

// ParseCardFormat maps FabTCG event format text to a domain CardFormat id (0–4).
// Returns nil when the text is empty or unrecognized.
func ParseCardFormat(raw string) *int16 {
	s := strings.TrimSpace(raw)
	if s == "" {
		return nil
	}
	if id, err := fabrary.FormatFromFabrary(s); err == nil {
		return &id
	}
	lower := strings.ToLower(s)
	for _, probe := range []struct {
		needle string
		id     int16
	}{
		{"classic constructed", 3},
		{"classic construction", 3},
		{"living legend", 4},
		{"silver age", 1},
		{"golden age", 2},
		{"sealed", 0},
		{"draft", 0},
		{"limited", 0},
	} {
		if strings.Contains(lower, probe.needle) {
			id := probe.id
			return &id
		}
	}
	return nil
}
