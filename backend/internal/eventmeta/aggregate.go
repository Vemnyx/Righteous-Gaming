package eventmeta

import (
	"encoding/json"
	"math"
	"sort"
	"strings"

	"righteous-gaming/backend/internal/eventusers"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/scrape"
)

type HeroCatalog struct {
	Name          string
	ArtImageURL   *string
	CardImageURL  *string
}

type HeroRef struct {
	ID            int     `json:"hero_id"`
	Name          string  `json:"name"`
	ArtImageURL   *string `json:"art_image_url,omitempty"`
	CardImageURL  *string `json:"card_image_url,omitempty"`
}

type MetaShareEntry struct {
	HeroRef
	Count int     `json:"count"`
	Pct   float64 `json:"pct"`
}

type OverallMetaShare struct {
	TotalDecks       int              `json:"total_decks"`
	SourceRound      int              `json:"source_round"`
	SourceRoundLabel *string          `json:"source_round_label,omitempty"`
	Heroes           []MetaShareEntry `json:"heroes"`
}

type HeroWinRate struct {
	HeroRef
	Wins    int     `json:"wins"`
	Losses  int     `json:"losses"`
	Games   int     `json:"games"`
	WinRate float64 `json:"win_rate"`
}

type Snapshot struct {
	Overall        OverallMetaShare `json:"overall"`
	FromRound      int              `json:"from_round"`
	ThroughRound   int              `json:"through_round"`
	HeroWinRates   []HeroWinRate    `json:"hero_win_rates"`
	MatchupHeroes  []HeroRef        `json:"matchup_heroes"`
	MatchupMatrix  [][]*float64     `json:"matchup_matrix"`
}

type pairingRow struct {
	Player1 string `json:"player1"`
	Player2 string `json:"player2"`
	Hero1   string `json:"hero1"`
	Hero2   string `json:"hero2"`
}

type resultRow struct {
	Player1    string `json:"player1"`
	Player2    string `json:"player2"`
	Hero1      string `json:"hero1"`
	Hero2      string `json:"hero2"`
	WinnerSide string `json:"winner_side"`
	WinnerName string `json:"winner_name"`
}

type fieldKey struct {
	id   int
	name string
}

type recordKey struct {
	id   int
	name string
}

// Build aggregates event meta from synced round JSON.
func Build(
	rounds []repository.EventRound,
	fromRound int,
	throughRound int,
	sharePhase MetaSharePhase,
	nationals bool,
	catalog map[int]HeroCatalog,
	shareMatcher *eventusers.HeroMatcher,
	matchupMatcher *eventusers.HeroMatcher,
) Snapshot {
	if fromRound <= 0 {
		fromRound = 1
	}
	if throughRound <= 0 {
		throughRound = maxRoundNumber(rounds)
	}
	if fromRound > throughRound {
		fromRound = throughRound
	}
	overall := buildOverallMetaShare(rounds, fromRound, nationals, sharePhase, shareMatcher, catalog)
	winRates, directed := buildWinRatesAndMatchups(rounds, fromRound, throughRound, matchupMatcher, catalog)

	matchupHeroes, matrix := buildMatchupMatrix(directed, catalog)

	return Snapshot{
		Overall:       overall,
		FromRound:     fromRound,
		ThroughRound:  throughRound,
		HeroWinRates:  winRates,
		MatchupHeroes: matchupHeroes,
		MatchupMatrix: matrix,
	}
}

func maxRoundNumber(rounds []repository.EventRound) int {
	max := 0
	for _, rr := range rounds {
		if rr.RoundNumber > max {
			max = rr.RoundNumber
		}
	}
	return max
}

const (
	metaShareDay1PairingsRound = 1
	metaShareDay2PairingsRound = 9
)

func metaSharePairingsRound(fromRound int, nationals bool, sharePhase MetaSharePhase) int {
	if nationals {
		return NationalsMetaSharePairingsRound(fromRound, sharePhase)
	}
	if fromRound >= metaShareDay2PairingsRound {
		return metaShareDay2PairingsRound
	}
	return metaShareDay1PairingsRound
}

func buildOverallMetaShare(
	rounds []repository.EventRound,
	fromRound int,
	nationals bool,
	sharePhase MetaSharePhase,
	matcher *eventusers.HeroMatcher,
	catalog map[int]HeroCatalog,
) OverallMetaShare {
	out := OverallMetaShare{Heroes: []MetaShareEntry{}}
	if len(rounds) == 0 {
		return out
	}

	sourceRound := metaSharePairingsRound(fromRound, nationals, sharePhase)
	var source *repository.EventRound
	for i := range rounds {
		if rounds[i].RoundNumber == sourceRound {
			source = &rounds[i]
			break
		}
	}
	if source == nil {
		return out
	}

	out.SourceRound = sourceRound
	if source.RoundLabel != nil {
		out.SourceRoundLabel = source.RoundLabel
	}

	// Each player counted once from the day's opening-round pairings (R1 or R9).
	playerHero := map[string]fieldKey{}
	var pairingRows []pairingRow
	_ = json.Unmarshal(source.Pairings, &pairingRows)
	for _, row := range pairingRows {
		recordPairingPlayer(playerHero, row.Player1, row.Hero1, matcher, catalog)
		recordPairingPlayer(playerHero, row.Player2, row.Hero2, matcher, catalog)
	}

	counts := map[fieldKey]int{}
	for _, key := range playerHero {
		counts[key]++
	}

	total := len(playerHero)
	out.TotalDecks = total
	if total == 0 {
		return out
	}

	keys := make([]fieldKey, 0, len(counts))
	for k := range counts {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		ci, cj := counts[keys[i]], counts[keys[j]]
		if ci != cj {
			return ci > cj
		}
		return keys[i].name < keys[j].name
	})

	for _, k := range keys {
		count := counts[k]
		out.Heroes = append(out.Heroes, MetaShareEntry{
			HeroRef: heroRef(k, catalog),
			Count:   count,
			Pct:     roundPct(count, total),
		})
	}
	return out
}

func buildWinRatesAndMatchups(
	rounds []repository.EventRound,
	fromRound int,
	throughRound int,
	matcher *eventusers.HeroMatcher,
	catalog map[int]HeroCatalog,
) ([]HeroWinRate, map[directedPair]int) {
	wins := map[recordKey]int{}
	losses := map[recordKey]int{}
	directed := map[directedPair]int{}

	for _, rr := range rounds {
		if rr.RoundNumber < fromRound || rr.RoundNumber > throughRound {
			continue
		}
		var rows []resultRow
		_ = json.Unmarshal(rr.Results, &rows)
		for _, row := range rows {
			if !scrape.ValidMatchPlayers(row.Player1, row.Player2) {
				continue
			}
			winner, loser := resultWinnerKeys(row, matcher, catalog)
			if winner.name == "" || loser.name == "" {
				continue
			}
			wins[winner]++
			losses[loser]++
			directed[directedPair{a: winner, b: loser}]++
		}
	}

	keys := map[recordKey]struct{}{}
	for k := range wins {
		keys[k] = struct{}{}
	}
	for k := range losses {
		keys[k] = struct{}{}
	}

	list := make([]recordKey, 0, len(keys))
	for k := range keys {
		list = append(list, k)
	}
	sort.Slice(list, func(i, j int) bool {
		gi := wins[list[i]] + losses[list[i]]
		gj := wins[list[j]] + losses[list[j]]
		if gi != gj {
			return gi > gj
		}
		return list[i].name < list[j].name
	})

	out := make([]HeroWinRate, 0, len(list))
	for _, k := range list {
		w := wins[k]
		l := losses[k]
		g := w + l
		out = append(out, HeroWinRate{
			HeroRef: heroRefFromRecord(k, catalog),
			Wins:    w,
			Losses:  l,
			Games:   g,
			WinRate: safeRate(w, g),
		})
	}
	return out, directed
}

type directedPair struct {
	a recordKey
	b recordKey
}

func buildMatchupMatrix(
	directed map[directedPair]int,
	catalog map[int]HeroCatalog,
) ([]HeroRef, [][]*float64) {
	heroSet := map[recordKey]struct{}{}
	for pair, games := range directed {
		if games <= 0 {
			continue
		}
		heroSet[pair.a] = struct{}{}
		heroSet[pair.b] = struct{}{}
	}

	heroes := make([]recordKey, 0, len(heroSet))
	for k := range heroSet {
		heroes = append(heroes, k)
	}
	sort.Slice(heroes, func(i, j int) bool {
		return heroes[i].name < heroes[j].name
	})

	refs := make([]HeroRef, len(heroes))
	for i, k := range heroes {
		refs[i] = heroRefFromRecord(k, catalog)
	}

	n := len(heroes)
	matrix := make([][]*float64, n)
	for i := range matrix {
		matrix[i] = make([]*float64, n)
		for j := range matrix[i] {
			if i == j {
				continue
			}
			wins := directed[directedPair{a: heroes[i], b: heroes[j]}]
			losses := directed[directedPair{a: heroes[j], b: heroes[i]}]
			games := wins + losses
			if games == 0 {
				continue
			}
			rate := safeRate(wins, games)
			matrix[i][j] = &rate
		}
	}
	return refs, matrix
}

func resultWinnerKeys(row resultRow, matcher *eventusers.HeroMatcher, catalog map[int]HeroCatalog) (winner, loser recordKey) {
	if !scrape.ValidPlayerName(row.Player1) || !scrape.ValidPlayerName(row.Player2) {
		return recordKey{}, recordKey{}
	}
	h1 := canonicalFieldKey(row.Hero1, matcher, catalog)
	h2 := canonicalFieldKey(row.Hero2, matcher, catalog)
	if h1.name == "" || h2.name == "" {
		return recordKey{}, recordKey{}
	}
	r1 := recordKey{id: h1.id, name: h1.name}
	r2 := recordKey{id: h2.id, name: h2.name}

	wName := normalizePlayer(row.WinnerName)
	if wName != "" && scrape.ValidPlayerName(row.WinnerName) {
		p1 := normalizePlayer(row.Player1)
		p2 := normalizePlayer(row.Player2)
		if wName == p1 {
			return r1, r2
		}
		if wName == p2 {
			return r2, r1
		}
	}
	side := strings.ToLower(strings.TrimSpace(row.WinnerSide))
	if strings.Contains(side, "player 1") {
		return r1, r2
	}
	if strings.Contains(side, "player 2") {
		return r2, r1
	}
	return recordKey{}, recordKey{}
}

func recordPairingPlayer(
	playerHero map[string]fieldKey,
	player string,
	hero string,
	matcher *eventusers.HeroMatcher,
	catalog map[int]HeroCatalog,
) {
	if !scrape.ValidPlayerName(player) {
		return
	}
	key := normalizePlayer(player)
	if key == "" {
		return
	}
	if _, seen := playerHero[key]; seen {
		return
	}
	field := canonicalFieldKey(hero, matcher, catalog)
	if field.name == "" {
		return
	}
	playerHero[key] = field
}

func canonicalFieldKey(raw string, matcher *eventusers.HeroMatcher, catalog map[int]HeroCatalog) fieldKey {
	name := strings.TrimSpace(scrape.CleanHeroName(raw))
	if name == "" || !scrape.ValidHeroName(name) {
		return fieldKey{}
	}
	if matcher != nil {
		if id := matcher.MatchExactFirst(name); id != nil && *id > 0 {
			display := name
			if cat, ok := catalog[*id]; ok && cat.Name != "" {
				display = cat.Name
			}
			return fieldKey{id: *id, name: display}
		}
	}
	return fieldKey{id: 0, name: name}
}

func fieldKeyForHero(raw string, matcher *eventusers.HeroMatcher, catalog map[int]HeroCatalog) fieldKey {
	return canonicalFieldKey(raw, matcher, catalog)
}

func heroRef(k fieldKey, catalog map[int]HeroCatalog) HeroRef {
	ref := HeroRef{ID: k.id, Name: k.name}
	if k.id > 0 {
		if cat, ok := catalog[k.id]; ok {
			if cat.Name != "" {
				ref.Name = cat.Name
			}
			ref.ArtImageURL = cat.ArtImageURL
			ref.CardImageURL = cat.CardImageURL
		}
	}
	return ref
}

func heroRefFromRecord(k recordKey, catalog map[int]HeroCatalog) HeroRef {
	return heroRef(fieldKey{id: k.id, name: k.name}, catalog)
}

func normalizePlayer(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(s)), " "))
}

func roundPct(count, total int) float64 {
	if total <= 0 {
		return 0
	}
	return math.Round(float64(count)*1000/float64(total)) / 10
}

func safeRate(wins, games int) float64 {
	if games <= 0 {
		return 0
	}
	return math.Round(float64(wins)*1000/float64(games)) / 10
}
