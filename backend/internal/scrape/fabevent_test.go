package scrape_test

import (
	"os"
	"testing"

	"righteous-gaming/backend/internal/scrape"
)

func TestParseEventPageYokohama(t *testing.T) {
	html, err := os.ReadFile("/tmp/fab-event.html")
	if err != nil {
		t.Skip("sample HTML not available")
	}
	parsed := scrape.ParseEventPage(string(html))
	if parsed.Title == "" {
		t.Fatal("expected title")
	}
	if len(parsed.CoverageLinks) < 3 {
		t.Fatalf("expected >=3 coverage links, got %d", len(parsed.CoverageLinks))
	}
	if parsed.CoverageLinks[0].Slug != "pro-tour-yokohama" {
		t.Fatalf("unexpected slug %q", parsed.CoverageLinks[0].Slug)
	}
}

func TestParseCoverageYokohama(t *testing.T) {
	html, err := os.ReadFile("/tmp/fab-coverage-pt2.html")
	if err != nil {
		t.Skip("sample HTML not available")
	}
	rounds := scrape.ParseCoverageRounds(string(html), "pro-tour-yokohama")
	if len(rounds) < 5 {
		t.Fatalf("expected rounds, got %d", len(rounds))
	}
	if scrape.LatestRound(rounds) < 5 {
		t.Fatalf("unexpected latest round %d", scrape.LatestRound(rounds))
	}
}
