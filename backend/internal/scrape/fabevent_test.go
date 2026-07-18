package scrape_test

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	"righteous-gaming/backend/internal/scrape"
)

func TestCleanHeroNameStripsMarkupNoise(t *testing.T) {
	cases := map[string]string{
		">Fai, Rising Rebellion": "Fai, Rising Rebellion",
		"\\>Bravo, Showstopper":  "Bravo, Showstopper",
		"<i>Fai</i>":             "Fai",
		"  >  Ira  ":             "Ira",
	}
	for in, want := range cases {
		if got := scrape.CleanHeroName(in); got != want {
			t.Fatalf("CleanHeroName(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestValidHeroName(t *testing.T) {
	cases := map[string]bool{
		"Fai, Rising Rebellion": true,
		"N/A":                   false,
		"":                      false,
		"TBD":                   false,
	}
	for in, want := range cases {
		if got := scrape.ValidHeroName(in); got != want {
			t.Fatalf("ValidHeroName(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestValidPlayerName(t *testing.T) {
	cases := map[string]bool{
		"Alice Smith": true,
		"N/A":         false,
		"n/a":         false,
		"NA":          false,
		"TBD":         false,
		"-":           false,
		"":            false,
		"   ":         false,
		"Player 1":    false,
		"Player 2":    false,
		"player 2":    false,
	}
	for in, want := range cases {
		if got := scrape.ValidPlayerName(in); got != want {
			t.Fatalf("ValidPlayerName(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestRoundLabelIndicatesDraft(t *testing.T) {
	cases := map[string]bool{
		"Round 6 - Booster Draft":      true,
		"Round 5 - Classic Constructed": false,
		"Round 8 - Booster Draft":      true,
		"":                             false,
		"Draft":                        true,
	}
	for in, want := range cases {
		if got := scrape.RoundLabelIndicatesDraft(in); got != want {
			t.Fatalf("RoundLabelIndicatesDraft(%q) = %v, want %v", in, got, want)
		}
	}
}

func TestParseCoverageRoundsIncludesBoosterDraft(t *testing.T) {
	html := `
<table>
<tr><td class="rounds">Round 5 - Classic Constructed</td>
<td><a href="https://fabtcg.com/coverage/pro-tour-las-vegas/pairings/5/">View</a></td>
<td><a href="https://fabtcg.com/coverage/pro-tour-las-vegas/results/5/">View</a></td>
<td><a href="https://fabtcg.com/coverage/pro-tour-las-vegas/standings/5/">View</a></td></tr>
<tr><td class="rounds">Round 6 - Booster Draft</td>
<td><a href="https://fabtcg.com/coverage/pro-tour-las-vegas/pairings/6/">View</a></td>
<td><a href="https://fabtcg.com/coverage/pro-tour-las-vegas/results/6/">View</a></td>
<td><a href="https://fabtcg.com/coverage/pro-tour-las-vegas/standings/6/">View</a></td></tr>
</table>`
	rounds := scrape.ParseCoverageRounds(html, "pro-tour-las-vegas")
	if len(rounds) != 2 {
		t.Fatalf("rounds=%d want 2", len(rounds))
	}
	if rounds[1].Number != 6 || rounds[1].Label != "Round 6 - Booster Draft" {
		t.Fatalf("draft round: %+v", rounds[1])
	}
	if !scrape.RoundLabelIndicatesDraft(rounds[1].Label) {
		t.Fatal("expected draft label")
	}
}

func TestFilterStoredResultsJSON(t *testing.T) {
	raw := `[{"player1":"Alice","player2":"Bob","hero1":"Fai","hero2":"Ira","winner_side":"Player 1","winner_name":"Alice"}]`
	var rows []scrape.ResultRow
	if err := json.Unmarshal([]byte(raw), &rows); err != nil {
		t.Fatal(err)
	}
	if len(rows) != 1 || rows[0].Player1 != "Alice" {
		t.Fatalf("unmarshal: %+v", rows)
	}
	filtered := scrape.FilterValidResultRows(rows)
	if len(filtered) != 1 {
		t.Fatalf("filtered: %d, want 1", len(filtered))
	}
}

func TestFilterResultRowsSkipsUndecided(t *testing.T) {
	rows := []scrape.ResultRow{
		{Player1: "Alice", Player2: "Bob"},
		{Player1: "Cara", Player2: "Dan", WinnerSide: "Player 1", WinnerName: "Cara"},
	}
	filtered := scrape.FilterResultRows(rows)
	if len(filtered) != 1 {
		t.Fatalf("filtered: %d, want 1", len(filtered))
	}
	if filtered[0].Player1 != "Cara" {
		t.Fatalf("player1: %q", filtered[0].Player1)
	}
}

func TestParseResultsSkipsNAPlayers(t *testing.T) {
	html := `<tr class="match-row">
		<td><div class="player-text"><strong>N/A</strong><br>Fai, Rising Rebellion</div></td>
		<td><div class="player-text"><strong>Bob</strong><br>Ira, Scarlet Revenger</div></td>
		<td><span class="winner-pill">Player 2</span></td>
	</tr>
	<tr class="match-row">
		<td><div class="player-text"><strong>Alice</strong><br>Fai, Rising Rebellion</div></td>
		<td><div class="player-text"><strong>Cara</strong><br>Ira, Scarlet Revenger</div></td>
		<td><span class="winner-pill">Player 1</span></td>
	</tr>`
	rows := scrape.ParseResults(html)
	if len(rows) != 1 {
		t.Fatalf("rows: %d, want 1", len(rows))
	}
	if rows[0].Player1 != "Alice" || rows[0].Player2 != "Cara" {
		t.Fatalf("players: %q vs %q", rows[0].Player1, rows[0].Player2)
	}
}

func TestParseEventPageMetadataWithoutCoverage(t *testing.T) {
	html := `<meta property="og:title" content="Pro Tour Osaka - Flesh and Blood TCG"/>
	<meta property="og:image" content="https://example.com/banner.jpg"/>
	<div class="quick-details"><strong>Date:</strong> June 20-22, 2026</div>`
	parsed := scrape.ParseEventPage(html)
	if parsed.Title == "" {
		t.Fatal("expected title")
	}
	if len(parsed.CoverageLinks) != 0 {
		t.Fatalf("expected no coverage links, got %d", len(parsed.CoverageLinks))
	}
}

func TestParsePairingsHeroNames(t *testing.T) {
	html := `<tr class="match-row">
		<td class="table-number"><span>1</span></td>
		<td><div class="player-text"><strong>Alice</strong><br>Fai, Rising Rebellion</div></td>
		<td><div class="player-text"><strong>Bob</strong><br>>Ira, Scarlet Revenger</div></td>
	</tr>`
	rows := scrape.ParsePairings(html)
	if len(rows) != 1 {
		t.Fatalf("rows: %d", len(rows))
	}
	if rows[0].Hero1 != "Fai, Rising Rebellion" {
		t.Fatalf("hero1: %q", rows[0].Hero1)
	}
	if rows[0].Hero2 != "Ira, Scarlet Revenger" {
		t.Fatalf("hero2: %q", rows[0].Hero2)
	}
}

func TestParseEventPageMemphisDates(t *testing.T) {
	html := `<div class="quick-details">
		<strong>Date:</strong> January 31 – February 2nd, 2025
		<strong>Venue:</strong> Renasant Convention Center, Memphis, TN
	</div>
	<a href="https://fabtcg.com/en/coverage/calling-memphis-a/"><h3>Calling</h3></a>`
	parsed := scrape.ParseEventPage(html)
	if parsed.DateText != "January 31 – February 2nd, 2025" {
		t.Fatalf("date_text: %q", parsed.DateText)
	}
	if parsed.Venue == "" || !strings.Contains(parsed.Venue, "Renasant") {
		t.Fatalf("venue: %q", parsed.Venue)
	}
}

func TestParseEventPageFormat(t *testing.T) {
	html := `<div class="quick-details">
		<strong>Date:</strong> June 14-15, 2025
		<strong>Format:</strong> Classic Constructed
		<strong>Entry Fee:</strong> 75€ EUR
	</div>
	<a href="https://fabtcg.com/en/coverage/calling-bologna/"><h3>Calling</h3></a>`
	parsed := scrape.ParseEventPage(html)
	if parsed.FormatText != "Classic Constructed" {
		t.Fatalf("format_text: %q", parsed.FormatText)
	}
}

func TestParseEventPagePlainFormat(t *testing.T) {
	html := `Date: June 14-15, 2025Format: Classic ConstructedEntry Fee: 75€ EUR`
	parsed := scrape.ParseEventPage(html)
	if parsed.FormatText != "Classic Constructed" {
		t.Fatalf("format_text: %q", parsed.FormatText)
	}
}

func TestParseEventPageMemphisPlainDate(t *testing.T) {
	html := `Date: January 31 – February 2nd, 2025Venue: Renasant Convention Center`
	parsed := scrape.ParseEventPage(html)
	if parsed.DateText == "" {
		t.Fatal("expected date_text from plain Date: line")
	}
	if !strings.Contains(parsed.DateText, "January 31") {
		t.Fatalf("date_text: %q", parsed.DateText)
	}
}

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

func TestFetchEventPageDataYokohama(t *testing.T) {
	if testing.Short() {
		t.Skip("network")
	}
	ctx := context.Background()
	c := scrape.NewClient()
	parsed, err := c.FetchEventPageData(ctx, "https://fabtcg.com/organised-play/2026/pro-tour-yokohama/")
	if err != nil {
		t.Fatalf("FetchEventPageData: %v", err)
	}
	if parsed.Title == "" {
		t.Fatal("expected title")
	}
	if len(parsed.CoverageLinks) < 3 {
		t.Fatalf("expected coverage links, got %d", len(parsed.CoverageLinks))
	}
}
