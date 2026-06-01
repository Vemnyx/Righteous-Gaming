package fabrary

import "testing"

func TestParseDeckURL(t *testing.T) {
	tests := []struct {
		in       string
		wantID   string
		wantLink string
		wantErr  bool
	}{
		{
			in:       "https://fabrary.net/decks/01KJZY83F7HCDBG59CQRPCDRCK",
			wantID:   "01KJZY83F7HCDBG59CQRPCDRCK",
			wantLink: "https://fabrary.net/decks/01KJZY83F7HCDBG59CQRPCDRCK",
		},
		{
			in:       "01KJZY83F7HCDBG59CQRPCDRCK",
			wantID:   "01KJZY83F7HCDBG59CQRPCDRCK",
			wantLink: "https://fabrary.net/decks/01KJZY83F7HCDBG59CQRPCDRCK",
		},
		{in: "", wantErr: true},
		{in: "https://example.com/decks/abc", wantErr: true},
	}
	for _, tc := range tests {
		id, link, err := ParseDeckURL(tc.in)
		if tc.wantErr {
			if err == nil {
				t.Fatalf("ParseDeckURL(%q) expected error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("ParseDeckURL(%q): %v", tc.in, err)
		}
		if id != tc.wantID || link != tc.wantLink {
			t.Fatalf("ParseDeckURL(%q) = %q, %q; want %q, %q", tc.in, id, link, tc.wantID, tc.wantLink)
		}
	}
}

func TestFormatFromFabrary(t *testing.T) {
	id, err := FormatFromFabrary("Classic Constructed")
	if err != nil || id != 3 {
		t.Fatalf("FormatFromFabrary: got %d, %v", id, err)
	}
}

func TestHeroFromIdentifier(t *testing.T) {
	id, err := HeroFromIdentifier("arakni-huntsman")
	if err != nil || id != 0 {
		t.Fatalf("HeroFromIdentifier arakni-huntsman: got %d, %v", id, err)
	}
}
