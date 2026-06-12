package scrape

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"golang.org/x/net/html"
)

const fabBrowserUA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

var (
	reDateLine       = regexp.MustCompile(`(?is)(?:<b>|<strong>)\s*Date:\s*</(?:b|strong)>\s*([^<]+)`)
	reDateLinePlain  = regexp.MustCompile(`(?is)Date:\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)[^<\n]*?\d{4})`)
	reVenueLine      = regexp.MustCompile(`(?is)(?:<b>|<strong>)\s*Venue:\s*</(?:b|strong)>\s*([^<]+)`)
	reVenueLinePlain = regexp.MustCompile(`(?is)Venue:\s*([^<\n]+)`)
	reFormatLine     = regexp.MustCompile(`(?is)(?:<b>|<strong>)\s*Format:\s*</(?:b|strong)>\s*([^<]+)`)
	reFormatLinePlain = regexp.MustCompile(`(?is)Format:\s*([A-Za-z][A-Za-z0-9\s\-]+?)(?:Entry|Eligibility|Rules|Venue|Date|Hosted|Registration|<|\n|$)`)
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
	reBrSplit        = regexp.MustCompile(`(?i)<br\s*/?>`)
	reHeroNoise      = regexp.MustCompile(`[<>\\]+`)
	reWPTournamentAPI = regexp.MustCompile(`(?i)href=["'](https://fabtcg\.com/api/wp/v2/tournament/\d+)["']`)
	reWhitespace     = regexp.MustCompile(`\s+`)
	reStripTags      = regexp.MustCompile(`(?s)<[^>]+>`)
)

const fabHomeURL = "https://fabtcg.com/"

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
	FormatText    string
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

func (c *Client) warmFabSession(ctx context.Context) {
	_, _ = c.fetchHTML(ctx, fabHomeURL, "", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
}

func setFabBrowserHeaders(req *http.Request, accept string, referer string) {
	if accept == "" {
		accept = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8"
	}
	req.Header.Set("User-Agent", fabBrowserUA)
	req.Header.Set("Accept", accept)
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	req.Header.Set("Cache-Control", "no-cache")
	req.Header.Set("Pragma", "no-cache")
	req.Header.Set("Sec-Ch-Ua", `"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"`)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", `"macOS"`)
	if strings.Contains(accept, "application/json") {
		req.Header.Set("Sec-Fetch-Dest", "empty")
		req.Header.Set("Sec-Fetch-Mode", "cors")
		if referer != "" {
			req.Header.Set("Referer", referer)
			req.Header.Set("Sec-Fetch-Site", "same-origin")
		} else {
			req.Header.Set("Sec-Fetch-Site", "none")
		}
	} else {
		req.Header.Set("Sec-Fetch-Dest", "document")
		req.Header.Set("Sec-Fetch-Mode", "navigate")
		req.Header.Set("Sec-Fetch-Site", "none")
		req.Header.Set("Sec-Fetch-User", "?1")
		req.Header.Set("Upgrade-Insecure-Requests", "1")
		if referer != "" {
			req.Header.Set("Referer", referer)
			req.Header.Set("Sec-Fetch-Site", "same-origin")
		}
	}
}

// FetchHTML retrieves a FabTCG page using browser-like headers and a shared cookie jar.
func (c *Client) FetchHTML(ctx context.Context, rawURL string) (string, error) {
	return c.fetchHTML(ctx, rawURL, "", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
}

// FetchHTMLReferer retrieves a FabTCG page with an optional Referer header (helps avoid 403 on subpages).
func (c *Client) FetchHTMLReferer(ctx context.Context, rawURL, referer string) (string, error) {
	return c.fetchHTML(ctx, rawURL, referer, "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8")
}

func (c *Client) fetchHTML(ctx context.Context, rawURL, referer, accept string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", err
	}
	setFabBrowserHeaders(req, accept, referer)
	httpClient, err := c.ensureClient(ctx)
	if err != nil {
		return "", err
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	body, readErr := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if readErr != nil {
		return "", readErr
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", fmt.Errorf("fetch %s: HTTP %d", rawURL, resp.StatusCode)
	}
	return string(body), nil
}

// FetchEventPageData loads tournament metadata, falling back to the public WordPress JSON API
// when the HTML page is blocked (HTTP 403 from FabTCG edge rules).
func (c *Client) FetchEventPageData(ctx context.Context, eventURL string) (EventPageData, error) {
	c.warmFabSession(ctx)

	if htmlText, err := c.FetchHTMLReferer(ctx, eventURL, fabHomeURL); err == nil {
		parsed := ParseEventPage(htmlText)
		if parsed.Title == "" {
			parsed.Title = textFromFirstTag(htmlText, "h1")
		}
		if len(parsed.CoverageLinks) > 0 {
			return parsed, nil
		}
		if apiURL := wpTournamentAPIURLFromHTML(htmlText); apiURL != "" {
			if out, err := c.fetchEventPageFromTournamentAPI(ctx, apiURL, eventURL); err == nil {
				if len(out.CoverageLinks) > 0 || eventPageHasMetadata(out) {
					return out, nil
				}
			}
		}
		if eventPageHasMetadata(parsed) {
			return parsed, nil
		}
	}
	return c.fetchEventPageViaWordPress(ctx, eventURL)
}

func wpTournamentAPIURLFromHTML(htmlText string) string {
	if m := reWPTournamentAPI.FindStringSubmatch(htmlText); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func slugFromFabEventURL(rawURL string) string {
	u, err := url.Parse(strings.TrimSpace(rawURL))
	if err != nil {
		return ""
	}
	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		s := strings.TrimSpace(parts[i])
		if s != "" {
			return s
		}
	}
	return ""
}

type wpTournamentItem struct {
	Title struct {
		Rendered string `json:"rendered"`
	} `json:"title"`
	Content struct {
		Rendered string `json:"rendered"`
	} `json:"content"`
	Link string `json:"link"`
	Yoast struct {
		OGImage []struct {
			URL string `json:"url"`
		} `json:"og_image"`
		OGTitle string `json:"og_title"`
	} `json:"yoast_head_json"`
}

func parseWPTournamentBody(body []byte) (wpTournamentItem, error) {
	var rows []wpTournamentItem
	if err := json.Unmarshal(body, &rows); err == nil && len(rows) > 0 {
		return rows[0], nil
	}
	var single wpTournamentItem
	if err := json.Unmarshal(body, &single); err != nil {
		return wpTournamentItem{}, fmt.Errorf("parse wordpress tournament API: %w", err)
	}
	if strings.TrimSpace(single.Content.Rendered) == "" && strings.TrimSpace(single.Title.Rendered) == "" {
		return wpTournamentItem{}, fmt.Errorf("empty tournament API response")
	}
	return single, nil
}

func (c *Client) fetchEventPageViaWordPress(ctx context.Context, eventURL string) (EventPageData, error) {
	slug := slugFromFabEventURL(eventURL)
	if slug == "" {
		return EventPageData{}, fmt.Errorf("could not determine event slug from URL")
	}
	apiURLs := []string{
		"https://fabtcg.com/api/wp/v2/tournament?slug=" + url.QueryEscape(slug),
		"https://fabtcg.com/wp-json/wp/v2/tournament?slug=" + url.QueryEscape(slug),
	}
	var lastErr error
	for _, apiURL := range apiURLs {
		out, err := c.fetchEventPageFromTournamentAPI(ctx, apiURL, eventURL)
		if err == nil {
			return out, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = fmt.Errorf("tournament not found for slug %q", slug)
	}
	return EventPageData{}, fmt.Errorf("fetch wordpress tournament API: %w", lastErr)
}

func (c *Client) fetchEventPageFromTournamentAPI(ctx context.Context, apiURL, referer string) (EventPageData, error) {
	body, err := c.fetchHTML(ctx, apiURL, referer, "application/json")
	if err != nil {
		return EventPageData{}, err
	}
	item, err := parseWPTournamentBody([]byte(body))
	if err != nil {
		return EventPageData{}, err
	}
	contentHTML := item.Content.Rendered
	parsed := ParseEventPage(contentHTML)
	out := EventPageData{
		Title:         cleanInlineText(item.Title.Rendered),
		DateText:      parsed.DateText,
		Venue:         parsed.Venue,
		FormatText:    parsed.FormatText,
		CoverageLinks: parsed.CoverageLinks,
	}
	if out.Title == "" {
		out.Title = parsed.Title
	}
	if len(item.Yoast.OGImage) > 0 && strings.TrimSpace(item.Yoast.OGImage[0].URL) != "" {
		out.ImageURL = strings.TrimSpace(item.Yoast.OGImage[0].URL)
	} else {
		out.ImageURL = parsed.ImageURL
	}
	if out.ImageURL == "" {
		out.ImageURL = metaContent(contentHTML, "og:image")
	}
	if len(out.CoverageLinks) == 0 && !eventPageHasMetadata(out) {
		return EventPageData{}, fmt.Errorf("no event metadata found in tournament API response")
	}
	return out, nil
}

func eventPageHasMetadata(d EventPageData) bool {
	return strings.TrimSpace(d.Title) != "" ||
		strings.TrimSpace(d.DateText) != "" ||
		strings.TrimSpace(d.Venue) != "" ||
		strings.TrimSpace(d.ImageURL) != "" ||
		strings.TrimSpace(d.FormatText) != ""
}

func extractFabDateText(htmlText string) string {
	for _, re := range []*regexp.Regexp{reDateLine, reDateLinePlain} {
		if m := re.FindStringSubmatch(htmlText); len(m) > 1 {
			if s := cleanInlineText(m[1]); s != "" {
				return s
			}
		}
	}
	return ""
}

func extractFabVenueText(htmlText string) string {
	for _, re := range []*regexp.Regexp{reVenueLine, reVenueLinePlain} {
		if m := re.FindStringSubmatch(htmlText); len(m) > 1 {
			s := cleanInlineText(m[1])
			if i := strings.Index(strings.ToLower(s), "event hall:"); i > 0 {
				s = strings.TrimSpace(s[:i])
			}
			if s != "" {
				return s
			}
		}
	}
	return ""
}

func extractFabFormatText(htmlText string) string {
	for _, re := range []*regexp.Regexp{reFormatLine, reFormatLinePlain} {
		if m := re.FindStringSubmatch(htmlText); len(m) > 1 {
			if s := trimFormatSuffix(cleanInlineText(m[1])); s != "" {
				return s
			}
		}
	}
	return ""
}

func trimFormatSuffix(s string) string {
	for _, stop := range []string{"Entry Fee", "Eligibility", "Rules Enforcement", "Venue", "Date", "Hosted by", "Registration"} {
		if i := strings.Index(s, stop); i > 0 {
			s = strings.TrimSpace(s[:i])
		}
	}
	return strings.TrimSpace(s)
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
	out.DateText = extractFabDateText(htmlText)
	out.Venue = extractFabVenueText(htmlText)
	out.FormatText = extractFabFormatText(htmlText)
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
			Hero:   CleanHeroName(m[3]),
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
		} else 		if strings.Contains(lower, "player 2") {
			winner = p2
		}
		if !ValidMatchPlayers(p1, p2) {
			continue
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
	parts := reBrSplit.Split(raw, 2)
	if len(parts) == 0 {
		return cleanInlineText(raw), ""
	}
	player = cleanInlineText(stripTags(parts[0]))
	if len(parts) > 1 {
		hero = CleanHeroName(parts[1])
	}
	return player, hero
}

// CleanHeroName normalizes FabTCG hero labels scraped from coverage HTML.
func CleanHeroName(s string) string {
	s = cleanInlineText(s)
	s = reHeroNoise.ReplaceAllString(s, "")
	s = strings.Trim(s, ".,;:- ")
	return reWhitespace.ReplaceAllString(strings.TrimSpace(s), " ")
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

func isPlaceholderCoverageLabel(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "n/a", "na", "tbd", "-":
		return true
	default:
		return false
	}
}

// ValidPlayerName reports whether s is a real player name from FabTCG coverage.
func ValidPlayerName(s string) bool {
	s = cleanInlineText(s)
	if s == "" {
		return false
	}
	return !isPlaceholderCoverageLabel(s)
}

// ValidHeroName reports whether s is a real hero label from FabTCG coverage.
func ValidHeroName(s string) bool {
	s = CleanHeroName(s)
	if s == "" {
		return false
	}
	return !isPlaceholderCoverageLabel(s)
}

// ValidMatchPlayers reports whether both sides of a pairing/result row are real players.
func ValidMatchPlayers(player1, player2 string) bool {
	return ValidPlayerName(player1) && ValidPlayerName(player2)
}

// ResultRowDecided reports whether a result row has a declared winner.
func ResultRowDecided(row ResultRow) bool {
	if strings.TrimSpace(row.WinnerName) != "" {
		return true
	}
	lower := strings.ToLower(strings.TrimSpace(row.WinnerSide))
	return strings.Contains(lower, "player 1") || strings.Contains(lower, "player 2")
}

// FilterResultRows drops placeholder player names and undecided matches.
func FilterResultRows(rows []ResultRow) []ResultRow {
	if len(rows) == 0 {
		return rows
	}
	out := make([]ResultRow, 0, len(rows))
	for _, row := range rows {
		if ValidMatchPlayers(row.Player1, row.Player2) && ResultRowDecided(row) {
			out = append(out, row)
		}
	}
	return out
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
