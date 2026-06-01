package fabrary

import "testing"

func TestHeroShortNameFromIdentifier(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"arakni-huntsman", "Arakni, Huntsman"},
		{"ARAKNI-HUNTSMAN", "Arakni, Huntsman"},
		{"dash-io", "Dash IO"},
		{"professor-teklovossen", "Professor"},
		{"unknown-hero-xyz", ""},
		{"", ""},
	}
	for _, tt := range tests {
		got := HeroShortNameFromIdentifier(tt.in)
		if got != tt.want {
			t.Errorf("HeroShortNameFromIdentifier(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}
