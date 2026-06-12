package domain

import "testing"

func TestEventTypeFromCoverageLabel(t *testing.T) {
	tests := []struct {
		label string
		want  EventType
		ok    bool
	}{
		{"Pro Tour", EventTypeProTour, true},
		{"Nationals", EventTypeNationals, true},
		{"National Championship", EventTypeNationals, true},
		{"USA National Championship", EventTypeNationals, true},
		{"Calling", EventTypeCalling, true},
		{"Showdown", EventTypeShowdown, true},
		{"World Championship Qualifier", 0, false},
	}
	for _, tc := range tests {
		got, ok := EventTypeFromCoverageLabel(tc.label)
		if ok != tc.ok || got != tc.want {
			t.Errorf("EventTypeFromCoverageLabel(%q) = (%v, %v), want (%v, %v)", tc.label, got, ok, tc.want, tc.ok)
		}
	}
}
