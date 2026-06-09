package scrape

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"golang.org/x/net/html"
)

const fabBrowserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

var (
	reDateLine       = regexp.MustCompile(`(?is)<b>Date:</b>\s*([^<]+)`)
	reVenueLine      = regexp.MustCompile(`(?is)<b>Venue:</b>\s*([^<]+)`)
	reCoverageHref   = regexp.MustCompile(`(?is)<a[^>]+href=["'](https://fabtcg\.com(?:/en)?/coverage/[^"'#?]+/?)["'][^>]*>.*?<h3[^>]*>([^<]+)</h3>`)
	reCoverageSlug   = regexp.MustCompile(`(?i)/coverage/([^/"'#?]+)`)
	reRoundRow       = regexp.MustCompile(`(?is)<tr>\s*<td[^>]*class=["']rounds["'][^>]*>([^<]+)</td>.*?pairings/(\d+)/.*?results/(\d+)/.*?standings/(\d+)/`)
	reYouTuBePath    = regexp.MustCompile(`(?i)youtu\.be/([a-zA-Z0-9_-]{11})(?:[?#&/]|$)`)
	reYouTubeV       = regexp.MustCompile(`(?i)[?&]v=([a-zA-Z0-9_-]{11})(?:[&#]|$)`)
	reYouTubeEmbed   = regexp.MustCompile(`(?i)youtube\.com/embed/([a-zA-Z0-9_-]{11})(?:[?#&/]|$)`)
	reYouTubeShorts  = regexp.MustCompile(`(?i)youtube\.com/shorts/([a-zA-Z0-9_-]{11})(?:[?#&/]|$)`)
	reMatchRow       = regexp.MustCompile(`(?is)<tr\s+class=["']match-row["'][^>]*>(.*?)</tr>`)
	reTableNumber    = regexp.MustCompile(`(?is)<td[^>]*class=["']table-number["'][^>]*>.*?(?:</span>\s*)?(\d+)\s*</td>`)
	rePlayerText     = regexp.MustCompile(`(?is)<div\s+class=["']player-text["'][^>]*>(.*?)</div>`)
	reWinnerPill     = regexp.MustCompile(`(?is)<span\s+class=["']winner-pill["'][^>]*>([^<]+)</span>`)
	reStandingRow    = regexp.MustCompile(`(?is)<tr>\s*<td\s+class=["']rank["'][^>]*>\s*(\d+)\s*</td>.*?<span\s+class=["']player-name["'][^>]*>([^<]+)</span>.*?<span\s+class=["']hero-name["'][^>]*>([^<]+)</span>.*?<td\s+class=["']wins["'][^>]*>\s*(\d+)\s*</td>`)
	reWhitespace     = regexp.MustCompile(`\s+`)
	reStripTags      = regexp.MustCompile(`(?s)<[^>]+>`)
)

type CoverageLink struct {
	URL   string
	Label string
	Slug  string
}

type EventPageData struct {
	Title         string
	ImageURL      string
	DateText      string
	Venue         string
	CoverageLinks []CoverageLink
}

type RoundLinks struct {
	Number    int
	Label     string
	Pairings  string
	Results   string
	Standings string
}

type PairingRow struct {
	Table   int
	Player1 string
	Player2 string
	Hero1   string
	Hero2   string
}

type StandingRow struct {
	Rank   int
	Player string
	Hero   string
	Wins   int
}

type ResultRow struct {
	Player1    string
	Player2    string
	Hero1      string
	Hero2      string
	WinnerSide string
	WinnerName string
}

type Client struct {
	httpClient *http.Client
}

func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *Client) FetchHTML(ctx context.Context, rawURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", fabBrowserUA)
	req.Header.Set("Accept", "text/html,application/xhtml+xml")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("fetch %s: HTTP %d", rawURL, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return "", err
	}
	return string(body), nil
}

func metaContent(htmlText, property string) string {
	pat := regexp.MustCompile(`(?is)<meta\s+[^>]*property=["']` + property + `["'][^>]*content=["']([^"']+)["']`)
	if m := pat.FindStringSubmatch(htmlText); len(m) > 1 {
		return html.UnescapeString(strings.TrimSpace(m[1]))
	}
	patAlt := regexp.MustCompile(`(?is)<meta\s+[^>]*content=["']([^"']+)["'][^>]*property=["']` + property + `["']`)
	if m := patAlt.FindStringSubmatch(htmlText); len(m) > 1 {
		return html.UnescapeString(strings.TrimSpace(m[1]))
	}
	return ""
}

func ParseEventPage(htmlText string) EventPageData {
	out := EventPageData{}
	out.Title = strings.TrimSuffix(metaContent(htmlText, "og:title"), " - Flesh and Blood TCG")
	if out.Title == "" {
		out.Title = textFromFirstTag(htmlText, "h1")
	}
	out.ImageURL = metaContent(htmlText, "og:image")
	if m := reDateLine.FindStringSubmatch(htmlText); len(m) > 1 {
		out.DateText = cleanInlineText(m[1])
	}
	if m := reVenueLine.FindStringSubmatch(htmlText); len(m) > 1 {
		out.Venue = cleanInlineText(m[1])
	}
	seen := map[string]struct{}{}
	for _, m := range reCoverageHref.FindAllStringSubmatch(htmlText, -1) {
		if len(m) < 3 {
			continue
		}
		u := strings.TrimSpace(m[1])
		if _, ok := seen[u]; ok {
			continue
		}
		slug := CoverageSlugFromURL(u)
		if slug == "" {
			continue
		}
		seen[u] = struct{}{}
		out.CoverageLinks = append(out.CoverageLinks, CoverageLink{
			URL:   u,
			Label: cleanInlineText(m[2]),
			Slug:  slug,
		})
	}
	return out
}

func CoverageSlugFromURL(rawURL string) string {
	m := reCoverageSlug.FindStringSubmatch(rawURL)
	if len(m) < 2 {
		return ""
	}
	return strings.Trim(m[1], "/")
}

func CoveragePageURL(slug string) string {
	return "https://fabtcg.com/en/coverage/" + slug + "/"
}

func PairingsPageURL(slug string, round int) string {
	return fmt.Sprintf("https://fabtcg.com/coverage/%s/pairings/%d/", slug, round)
}

func ResultsPageURL(slug string, round int) string {
	return fmt.Sprintf("https://fabtcg.com/coverage/%s/results/%d/", slug, round)
}

func StandingsPageURL(slug string, round int) string {
	return fmt.Sprintf("https://fabtcg.com/coverage/%s/standings/%d/", slug, round)
}

func ParseCoverageRounds(htmlText string, slug string) []RoundLinks {
	var out []RoundLinks
	for _, m := range reRoundRow.FindAllStringSubmatch(htmlText, -1) {
		if len(m) < 5 {
			continue
		}
		n := atoi(strings.TrimSpace(m[2]))
		if n <= 0 {
			continue
		}
		out = append(out, RoundLinks{
			Number:    n,
			Label:     cleanInlineText(m[1]),
			Pairings:  PairingsPageURL(slug, n),
			Results:   ResultsPageURL(slug, n),
			Standings: StandingsPageURL(slug, n),
		})
	}
	return out
}

func ParsePairings(htmlText string) []PairingRow {
	var out []PairingRow
	for _, block := range reMatchRow.FindAllStringSubmatch(htmlText, -1) {
		if len(block) < 2 {
			continue
		}
		rowHTML := block[1]
		table := 0
		if m := reTableNumber.FindStringSubmatch(rowHTML); len(m) > 1 {
			table = atoi(m[1])
		}
		texts := rePlayerText.FindAllStringSubmatch(rowHTML, -1)
		if len(texts) < 2 {
			continue
		}
		p1, h1 := parsePlayerTextBlock(texts[0][1])
		p2, h2 := parsePlayerTextBlock(texts[1][1])
		out = append(out, PairingRow{
			Table:   table,
			Player1: p1,
			Player2: p2,
			Hero1:   h1,
			Hero2:   h2,
		})
	}
	return out
}

func ParseStandings(htmlText string) []StandingRow {
	var out []StandingRow
	for _, m := range reStandingRow.FindAllStringSubmatch(htmlText, -1) {
		if len(m) < 5 {
			continue
		}
		out = append(out, StandingRow{
			Rank:   atoi(m[1]),
			Player: cleanInlineText(m[2]),
			Hero:   cleanInlineText(m[3]),
			Wins:   atoi(m[4]),
		})
	}
	return out
}

func ParseResults(htmlText string) []ResultRow {
	var out []ResultRow
	for _, block := range reMatchRow.FindAllStringSubmatch(htmlText, -1) {
		if len(block) < 2 {
			continue
		}
		rowHTML := block[1]
		texts := rePlayerText.FindAllStringSubmatch(rowHTML, -1)
		if len(texts) < 2 {
			continue
		}
		p1, h1 := parsePlayerTextBlock(texts[0][1])
		p2, h2 := parsePlayerTextBlock(texts[1][1])
		winnerSide := ""
		if m := reWinnerPill.FindStringSubmatch(rowHTML); len(m) > 1 {
			winnerSide = cleanInlineText(m[1])
		}
		winner := ""
		lower := strings.ToLower(winnerSide)
		if strings.Contains(lower, "player 1") {
			winner = p1
		} else if strings.Contains(lower, "player 2") {
			winner = p2
		}
		out = append(out, ResultRow{
			Player1:    p1,
			Player2:    p2,
			Hero1:      h1,
			Hero2:      h2,
			WinnerSide: winnerSide,
			WinnerName: winner,
		})
	}
	return out
}

func FindYouTubeWatchURL(htmlText string) string {
	for _, re := range []*regexp.Regexp{reYouTuBePath, reYouTubeV, reYouTubeEmbed, reYouTubeShorts} {
		if m := re.FindStringSubmatch(htmlText); len(m) > 1 {
			return "https://www.youtube.com/watch?v=" + m[1]
		}
	}
	return ""
}

func NormalizeName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	return reWhitespace.ReplaceAllString(s, " ")
}

func NameMatches(first, last, player string) bool {
	playerN := NormalizeName(player)
	if playerN == "" {
		return false
	}
	full := NormalizeName(first + " " + last)
	if playerN == full {
		return true
	}
	comma := NormalizeName(last + ", " + first)
	if playerN == comma {
		return true
	}
	firstN := NormalizeName(first)
	lastN := NormalizeName(last)
	if firstN != "" && lastN != "" && strings.Contains(playerN, firstN) && strings.Contains(playerN, lastN) {
		return true
	}
	return false
}

func parsePlayerTextBlock(raw string) (player, hero string) {
	raw = regexp.MustCompile(`(?is)<strong[^>]*>(.*?)</strong>`).ReplaceAllString(raw, "$1")
	raw = regexp.MustCompile(`(?is)<i[^>]*class=["'][^"']*flag[^"']*["'][^>]*></i>`).ReplaceAllString(raw, "")
	parts := strings.Split(raw, "<br")
	if len(parts) == 0 {
		return cleanInlineText(raw), ""
	}
	player = cleanInlineText(stripTags(parts[0]))
	if len(parts) > 1 {
		hero = cleanInlineText(stripTags(parts[1]))
	}
	return player, hero
}

func stripTags(s string) string {
	return reStripTags.ReplaceAllString(s, "")
}

func textFromFirstTag(htmlText, tag string) string {
	re := regexp.MustCompile(`(?is)<` + tag + `[^>]*>([^<]+)</` + tag + `>`)
	if m := re.FindStringSubmatch(htmlText); len(m) > 1 {
		return cleanInlineText(m[1])
	}
	return ""
}

func cleanInlineText(s string) string {
	s = html.UnescapeString(s)
	s = stripTags(s)
	return reWhitespace.ReplaceAllString(strings.TrimSpace(s), " ")
}

func atoi(s string) int {
	s = strings.TrimSpace(s)
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			break
		}
		n = n*10 + int(r-'0')
	}
	return n
}

func LatestRound(rounds []RoundLinks) int {
	max := 0
	for _, r := range rounds {
		if r.Number > max {
			max = r.Number
		}
	}
	return max
}
