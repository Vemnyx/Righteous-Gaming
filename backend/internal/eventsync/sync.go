package eventsync

import (
	"context"
	"encoding/json"
	"time"

	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/scrape"
	"righteous-gaming/backend/log"
)

const syncInterval = time.Minute

// Runner periodically syncs FabTCG coverage for active event_data rows.
type Runner struct {
	repo   *repository.Repository
	scrape *scrape.Client
	stop   chan struct{}
}

func NewRunner(repo *repository.Repository, client *scrape.Client) *Runner {
	return &Runner{repo: repo, scrape: client, stop: make(chan struct{})}
}

// Start launches the background sync loop (every minute).
func (r *Runner) Start(ctx context.Context) {
	go func() {
		r.tick(ctx)
		ticker := time.NewTicker(syncInterval)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				r.tick(ctx)
			case <-r.stop:
				return
			case <-ctx.Done():
				return
			}
		}
	}()
	log.Info("event sync runner started", "interval", syncInterval.String())
}

func (r *Runner) Stop() {
	close(r.stop)
}

func (r *Runner) tick(ctx context.Context) {
	rows, err := r.repo.ListActiveEventData(ctx, time.Now().UTC())
	if err != nil {
		log.Error("event sync list active", "error", err)
		return
	}
	for _, ed := range rows {
		if err := SyncEventData(ctx, r.repo, r.scrape, ed); err != nil {
			log.Error("event sync", "event_data_id", ed.ID, "error", err)
		}
	}
}

// SyncEventData scrapes coverage pages and stores any new rounds.
func SyncEventData(ctx context.Context, repo *repository.Repository, client *scrape.Client, ed repository.EventData) error {
	covHTML, err := client.FetchHTMLReferer(ctx, ed.CoverageURL, "https://fabtcg.com/")
	if err != nil {
		return err
	}
	roundLinks := scrape.ParseCoverageRounds(covHTML, ed.CoverageSlug)
	if len(roundLinks) == 0 {
		return nil
	}
	existing, err := repo.ListEventRoundNumbers(ctx, ed.ID)
	if err != nil {
		return err
	}
	have := map[int]struct{}{}
	for _, n := range existing {
		have[n] = struct{}{}
	}
	covReferer := scrape.CoveragePageURL(ed.CoverageSlug)
	for _, rl := range roundLinks {
		if _, ok := have[rl.Number]; ok {
			continue
		}
		pairHTML, _ := client.FetchHTMLReferer(ctx, rl.Pairings, covReferer)
		resHTML, _ := client.FetchHTMLReferer(ctx, rl.Results, covReferer)
		stHTML, _ := client.FetchHTMLReferer(ctx, rl.Standings, covReferer)

		pairings, err := encodePairings(scrape.ParsePairings(pairHTML))
		if err != nil {
			return err
		}
		results, err := encodeResults(scrape.ParseResults(resHTML))
		if err != nil {
			return err
		}
		standings, err := encodeStandings(scrape.ParseStandings(stHTML))
		if err != nil {
			return err
		}
		var label *string
		if rl.Label != "" {
			label = &rl.Label
		}
		if _, err := repo.CreateEventRound(ctx, repository.CreateEventRoundParams{
			EventDataID: ed.ID,
			RoundNumber: rl.Number,
			RoundLabel:  label,
			Pairings:    pairings,
			Results:     results,
			Standings:   standings,
		}); err != nil {
			return err
		}
		log.Info("event sync stored round", "event_data_id", ed.ID, "round", rl.Number)
	}
	return nil
}

// SyncEventIfActive runs an initial sync for all event_data on an event when it is current or past.
func SyncEventIfActive(ctx context.Context, repo *repository.Repository, client *scrape.Client, eventID int) {
	e, err := repo.GetEventByID(ctx, eventID)
	if err != nil {
		return
	}
	now := time.Now().UTC()
	if e.StartDate == nil || e.EndDate == nil {
		return
	}
	if now.Before(*e.StartDate) {
		return
	}
	dataRows, err := repo.ListEventDataByEventID(ctx, eventID)
	if err != nil {
		return
	}
	for _, ed := range dataRows {
		if err := SyncEventData(ctx, repo, client, ed); err != nil {
			log.Error("event initial sync", "event_data_id", ed.ID, "error", err)
		}
	}
}

func encodePairings(rows []scrape.PairingRow) (json.RawMessage, error) {
	type row struct {
		Table   int    `json:"table"`
		Player1 string `json:"player1"`
		Player2 string `json:"player2"`
		Hero1   string `json:"hero1"`
		Hero2   string `json:"hero2"`
	}
	out := make([]row, 0, len(rows))
	for _, r := range rows {
		out = append(out, row{Table: r.Table, Player1: r.Player1, Player2: r.Player2, Hero1: r.Hero1, Hero2: r.Hero2})
	}
	return json.Marshal(out)
}

func encodeResults(rows []scrape.ResultRow) (json.RawMessage, error) {
	type row struct {
		Player1    string `json:"player1"`
		Player2    string `json:"player2"`
		Hero1      string `json:"hero1"`
		Hero2      string `json:"hero2"`
		WinnerSide string `json:"winner_side"`
		WinnerName string `json:"winner_name"`
	}
	out := make([]row, 0, len(rows))
	for _, r := range rows {
		out = append(out, row{
			Player1: r.Player1, Player2: r.Player2, Hero1: r.Hero1, Hero2: r.Hero2,
			WinnerSide: r.WinnerSide, WinnerName: r.WinnerName,
		})
	}
	return json.Marshal(out)
}

func encodeStandings(rows []scrape.StandingRow) (json.RawMessage, error) {
	type row struct {
		Rank   int    `json:"rank"`
		Player string `json:"player"`
		Hero   string `json:"hero"`
		Wins   int    `json:"wins"`
	}
	out := make([]row, 0, len(rows))
	for _, r := range rows {
		out = append(out, row{Rank: r.Rank, Player: r.Player, Hero: r.Hero, Wins: r.Wins})
	}
	return json.Marshal(out)
}
