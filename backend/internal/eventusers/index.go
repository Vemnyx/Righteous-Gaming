package eventusers

import (
	"context"
	"encoding/json"

	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/scrape"
)

const (
	KindPairing  = "pairing"
	KindResult   = "result"
	KindStanding = "standing"
)

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

type standingRow struct {
	Rank   int    `json:"rank"`
	Player string `json:"player"`
	Hero   string `json:"hero"`
	Wins   int    `json:"wins"`
}

// IndexRound scans synced round JSON and stores rows for users whose names match players.
func IndexRound(ctx context.Context, repo *repository.Repository, round repository.EventRound) error {
	users, err := repo.ListUsersWithNames(ctx)
	if err != nil {
		return err
	}
	if len(users) == 0 {
		return nil
	}

	heroRows, err := repo.ListHeroesForMatch(ctx)
	if err != nil {
		return err
	}
	heroes := NewHeroMatcher(heroRows)

	var pairings []pairingRow
	_ = json.Unmarshal(round.Pairings, &pairings)
	for _, row := range pairings {
		for _, u := range users {
			side := 0
			hero := ""
			switch {
			case scrape.NameMatches(u.FirstName, u.LastName, row.Player1):
				side = 1
				hero = row.Hero1
			case scrape.NameMatches(u.FirstName, u.LastName, row.Player2):
				side = 2
				hero = row.Hero2
			default:
				continue
			}
			opp := row.Player2
			if side == 2 {
				opp = row.Player1
			}
			payload, err := json.Marshal(map[string]any{
				"table":       row.Table,
				"opponent":    opp,
				"hero":        hero,
				"player_side": side,
				"player1":     row.Player1,
				"player2":     row.Player2,
				"hero1":       row.Hero1,
				"hero2":       row.Hero2,
			})
			if err != nil {
				return err
			}
			if err := upsertUserRow(ctx, repo, heroes, round, u.ID, KindPairing, payload, hero); err != nil {
				return err
			}
		}
	}

	var results []resultRow
	_ = json.Unmarshal(round.Results, &results)
	for _, row := range results {
		for _, u := range users {
			inMatch := scrape.NameMatches(u.FirstName, u.LastName, row.Player1) ||
				scrape.NameMatches(u.FirstName, u.LastName, row.Player2)
			if !inMatch {
				continue
			}
			hero := row.Hero1
			if scrape.NameMatches(u.FirstName, u.LastName, row.Player2) {
				hero = row.Hero2
			}
			outcome := "loss"
			if scrape.NameMatches(u.FirstName, u.LastName, row.WinnerName) {
				outcome = "win"
			} else if row.WinnerName == "" {
				outcome = row.WinnerSide
			}
			payload, err := json.Marshal(map[string]any{
				"outcome":     outcome,
				"winner_side": row.WinnerSide,
				"winner_name": row.WinnerName,
				"hero":        hero,
				"player1":     row.Player1,
				"player2":     row.Player2,
				"hero1":       row.Hero1,
				"hero2":       row.Hero2,
			})
			if err != nil {
				return err
			}
			if err := upsertUserRow(ctx, repo, heroes, round, u.ID, KindResult, payload, hero); err != nil {
				return err
			}
		}
	}

	var standings []standingRow
	_ = json.Unmarshal(round.Standings, &standings)
	for _, row := range standings {
		for _, u := range users {
			if !scrape.NameMatches(u.FirstName, u.LastName, row.Player) {
				continue
			}
			payload, err := json.Marshal(map[string]any{
				"rank":   row.Rank,
				"player": row.Player,
				"hero":   row.Hero,
				"wins":   row.Wins,
			})
			if err != nil {
				return err
			}
			if err := upsertUserRow(ctx, repo, heroes, round, u.ID, KindStanding, payload, row.Hero); err != nil {
				return err
			}
		}
	}

	return nil
}

func upsertUserRow(
	ctx context.Context,
	repo *repository.Repository,
	heroes *HeroMatcher,
	round repository.EventRound,
	userID int,
	kind string,
	payload json.RawMessage,
	heroName string,
) error {
	return repo.UpsertEventDataUser(ctx, repository.UpsertEventDataUserParams{
		EventDataID: round.EventDataID, EventRoundID: round.ID, UserID: userID,
		RoundNumber: round.RoundNumber, Kind: kind, Payload: payload, HeroID: heroes.Match(heroName),
	})
}
