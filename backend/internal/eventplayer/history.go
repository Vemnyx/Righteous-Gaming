package eventplayer

import (
	"encoding/json"
	"sort"
	"strings"

	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/scrape"
)

type HistoryRow struct {
	Round        int     `json:"round"`
	RoundLabel   *string `json:"round_label,omitempty"`
	Table        *int    `json:"table,omitempty"`
	Opponent     string  `json:"opponent"`
	Hero         string  `json:"hero"`
	OpponentHero string  `json:"opponent_hero"`
	Result       string  `json:"result"`
}

type History struct {
	Player  string       `json:"player"`
	Wins    int          `json:"wins"`
	Losses  int          `json:"losses"`
	Rows    []HistoryRow `json:"rows"`
}

type pairingRow struct {
	Table   int    `json:"table"`
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

// BuildHistory aggregates round-by-round match rows for one player in a segment.
func BuildHistory(rounds []repository.EventRound, playerName string) History {
	query := normalizeName(playerName)
	out := History{
		Player: strings.TrimSpace(playerName),
		Rows:   []HistoryRow{},
	}
	if query == "" {
		return out
	}

	sorted := append([]repository.EventRound(nil), rounds...)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].RoundNumber < sorted[j].RoundNumber
	})

	for _, rr := range sorted {
		if row := rowFromResults(rr, query); row != nil {
			out.Rows = append(out.Rows, *row)
			switch row.Result {
			case "win":
				out.Wins++
			case "loss":
				out.Losses++
			}
			continue
		}
		if row := rowFromPairings(rr, query); row != nil {
			out.Rows = append(out.Rows, *row)
		}
	}
	return out
}

func rowFromResults(rr repository.EventRound, query string) *HistoryRow {
	var rows []resultRow
	_ = json.Unmarshal(rr.Results, &rows)
	for _, row := range rows {
		side := playerSide(row.Player1, row.Player2, query)
		if side == 0 {
			continue
		}
		opponent, hero, oppHero := sidesFromMatch(row.Player1, row.Player2, row.Hero1, row.Hero2, side)
		result := "loss"
		if resultSideWins(row, side) {
			result = "win"
		}
		return &HistoryRow{
			Round:        rr.RoundNumber,
			RoundLabel:   rr.RoundLabel,
			Opponent:     opponent,
			Hero:         hero,
			OpponentHero: oppHero,
			Result:       result,
		}
	}
	return nil
}

func rowFromPairings(rr repository.EventRound, query string) *HistoryRow {
	var rows []pairingRow
	_ = json.Unmarshal(rr.Pairings, &rows)
	for _, row := range rows {
		side := playerSide(row.Player1, row.Player2, query)
		if side == 0 {
			continue
		}
		opponent, hero, oppHero := sidesFromMatch(row.Player1, row.Player2, row.Hero1, row.Hero2, side)
		table := row.Table
		return &HistoryRow{
			Round:        rr.RoundNumber,
			RoundLabel:   rr.RoundLabel,
			Table:        &table,
			Opponent:     opponent,
			Hero:         hero,
			OpponentHero: oppHero,
			Result:       "pending",
		}
	}
	return nil
}

func playerSide(player1, player2, query string) int {
	if namesMatch(query, player1) {
		return 1
	}
	if namesMatch(query, player2) {
		return 2
	}
	return 0
}

func namesMatch(query, stored string) bool {
	if normalizeName(query) == normalizeName(stored) {
		return true
	}
	first, last := splitDisplayName(query)
	if first == "" || last == "" {
		return false
	}
	return scrape.NameMatches(first, last, stored)
}

func splitDisplayName(name string) (first, last string) {
	name = strings.TrimSpace(name)
	if name == "" {
		return "", ""
	}
	if i := strings.Index(name, ","); i >= 0 {
		last = strings.TrimSpace(name[:i])
		first = strings.TrimSpace(name[i+1:])
		return first, last
	}
	parts := strings.Fields(name)
	if len(parts) < 2 {
		return "", ""
	}
	first = parts[0]
	last = parts[len(parts)-1]
	return first, last
}

func sidesFromMatch(p1, p2, h1, h2 string, side int) (opponent, hero, oppHero string) {
	if side == 1 {
		return strings.TrimSpace(p2), cleanHero(h1), cleanHero(h2)
	}
	return strings.TrimSpace(p1), cleanHero(h2), cleanHero(h1)
}

func resultSideWins(row resultRow, side int) bool {
	wName := normalizeName(row.WinnerName)
	if wName != "" {
		if side == 1 {
			return namesMatch(row.WinnerName, row.Player1)
		}
		return namesMatch(row.WinnerName, row.Player2)
	}
	s := strings.ToLower(strings.TrimSpace(row.WinnerSide))
	if side == 1 {
		return strings.Contains(s, "player 1")
	}
	return strings.Contains(s, "player 2")
}

func cleanHero(raw string) string {
	return strings.TrimSpace(scrape.CleanHeroName(raw))
}

func normalizeName(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(s)), " "))
}
