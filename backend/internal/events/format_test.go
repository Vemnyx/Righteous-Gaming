package events_test

import (
	"testing"

	"righteous-gaming/backend/internal/events"
)

func TestParseCardFormat(t *testing.T) {
	cc := int16(3)
	limited := int16(0)
	cases := []struct {
		in   string
		want *int16
	}{
		{"", nil},
		{"Classic Constructed", &cc},
		{"Format: Classic ConstructedEntry Fee", &cc},
		{"High Seas Sealed Deck", &limited},
		{"unknown format xyz", nil},
	}
	for _, tc := range cases {
		got := events.ParseCardFormat(tc.in)
		if tc.want == nil {
			if got != nil {
				t.Fatalf("ParseCardFormat(%q) = %v, want nil", tc.in, *got)
			}
			continue
		}
		if got == nil || *got != *tc.want {
			t.Fatalf("ParseCardFormat(%q) = %v, want %d", tc.in, got, *tc.want)
		}
	}
}
