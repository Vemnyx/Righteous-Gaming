package eventusers

import (
	"context"
	"encoding/json"
	"errors"

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

func cleanHero(s string) string {
	return scrape.CleanHeroName(s)
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
	var eventFormat *int16
	if ed, err := repo.GetEventDataByID(ctx, round.EventDataID); err == nil {
		eventFormat = ed.Format
	} else if !errors.Is(err, repository.ErrEventDataNotFound) {
		return err
	}
	heroes := NewHeroMatcher(heroRows, eventFormat)

	var pairings []pairingRow
	_ = json.Unmarshal(round.Pairings, &pairings)
	for _, row := range pairings {
		hero1 := cleanHero(row.Hero1)
		hero2 := cleanHero(row.Hero2)
		for _, u := range users {
			side := 0
			playerHero := ""
			opponentHero := ""
			switch {
			case scrape.NameMatches(u.FirstName, u.LastName, row.Player1):
				side = 1
				playerHero = hero1
				opponentHero = hero2
			case scrape.NameMatches(u.FirstName, u.LastName, row.Player2):
				side = 2
				playerHero = hero2
				opponentHero = hero1
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
				"hero":        playerHero,
				"player_side": side,
				"player1":     row.Player1,
				"player2":     row.Player2,
				"hero1":       hero1,
				"hero2":       hero2,
			})
			if err != nil {
				return err
			}
			if err := upsertUserRow(ctx, repo, heroes, round, u.ID, KindPairing, payload, playerHero, opponentHero); err != nil {
				return err
			}
		}
	}

	var results []resultRow
	_ = json.Unmarshal(round.Results, &results)
	for _, row := range results {
		if !scrape.ValidMatchPlayers(row.Player1, row.Player2) {
			continue
		}
		hero1 := cleanHero(row.Hero1)
		hero2 := cleanHero(row.Hero2)
		for _, u := range users {
			inMatch := scrape.NameMatches(u.FirstName, u.LastName, row.Player1) ||
				scrape.NameMatches(u.FirstName, u.LastName, row.Player2)
			if !inMatch {
				continue
			}
			playerHero := hero1
			opponentHero := hero2
			if scrape.NameMatches(u.FirstName, u.LastName, row.Player2) {
				playerHero = hero2
				opponentHero = hero1
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
				"hero":        playerHero,
				"player1":     row.Player1,
				"player2":     row.Player2,
				"hero1":       hero1,
				"hero2":       hero2,
			})
			if err != nil {
				return err
			}
			if err := upsertUserRow(ctx, repo, heroes, round, u.ID, KindResult, payload, playerHero, opponentHero); err != nil {
				return err
			}
		}
	}

	var standings []standingRow
	_ = json.Unmarshal(round.Standings, &standings)
	for _, row := range standings {
		hero := cleanHero(row.Hero)
		for _, u := range users {
			if !scrape.NameMatches(u.FirstName, u.LastName, row.Player) {
				continue
			}
			payload, err := json.Marshal(map[string]any{
				"rank":   row.Rank,
				"player": row.Player,
				"hero":   hero,
				"wins":   row.Wins,
			})
			if err != nil {
				return err
			}
			if err := upsertUserRow(ctx, repo, heroes, round, u.ID, KindStanding, payload, hero, ""); err != nil {
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
	playerHeroName string,
	opponentHeroName string,
) error {
	var opponentHeroID *int
	if opponentHeroName != "" {
		opponentHeroID = heroes.Match(opponentHeroName)
	}
	return repo.UpsertEventDataUser(ctx, repository.UpsertEventDataUserParams{
		EventDataID: round.EventDataID, EventRoundID: round.ID, UserID: userID,
		RoundNumber: round.RoundNumber, Kind: kind, Payload: payload,
		HeroID: heroes.Match(playerHeroName), OpponentHeroID: opponentHeroID,
	})
}
