package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"righteous-gaming/backend/internal/db"
	"righteous-gaming/backend/internal/fabrary"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

func main() {
	var (
		deckSourceID = flag.Int("deck-source-id", 0, "only decks with this deck_source_id (0 = all needing backfill)")
		userID       = flag.Int("user-id", 0, "only decks owned by this user (0 = all)")
		dryRun       = flag.Bool("dry-run", false, "report only; do not update")
		delayMS      = flag.Int("delay-ms", 350, "pause between Fabrary API requests")
	)
	flag.Parse()

	ctx := context.Background()
	cfg, err := db.LoadConfig(ctx)
	if err != nil {
		log.Fatal("db config", "error", err)
	}
	repo, err := repository.New(ctx, cfg)
	if err != nil {
		log.Fatal("db connect", "error", err)
	}
	defer repo.Close()

	var filter repository.DeckListFilter
	if *userID > 0 {
		filter.UserID = userID
	}
	if *deckSourceID > 0 {
		filter.DeckSourceID = deckSourceID
	}

	rows, err := repo.ListDecksForFabraryCreatedAtBackfill(ctx, filter)
	if err != nil {
		log.Fatal("list decks for backfill", "error", err)
	}

	delay := time.Duration(*delayMS) * time.Millisecond
	var checked, updated, skipped, failed int
	var samples []string
	createdAtCache := make(map[string]time.Time)

	for _, row := range rows {
		checked++
		link := strings.TrimSpace(row.FabraryLink)
		if link == "" {
			skipped++
			continue
		}

		fabraryDeckID, _, err := fabrary.ParseDeckURL(link)
		if err != nil {
			failed++
			if len(samples) < 15 {
				samples = append(samples, fmt.Sprintf("deck %d parse link: %v", row.ID, err))
			}
			continue
		}

		createdAt, ok := createdAtCache[fabraryDeckID]
		if !ok {
			createdAt, err = fabrary.FetchDeckCreatedAt(ctx, fabraryDeckID)
			if err != nil {
				failed++
				if len(samples) < 15 {
					samples = append(samples, fmt.Sprintf("deck %d fetch %s: %v", row.ID, fabraryDeckID, err))
				}
				if delay > 0 {
					time.Sleep(delay)
				}
				continue
			}
			createdAtCache[fabraryDeckID] = createdAt
			if delay > 0 {
				time.Sleep(delay)
			}
		}

		if *dryRun {
			updated++
			if len(samples) < 15 {
				samples = append(samples, fmt.Sprintf("deck %d: fabrary_created_at=%s", row.ID, createdAt.UTC().Format(time.RFC3339)))
			}
			continue
		}

		if err := repo.UpdateDeckFabraryCreatedAt(ctx, row.ID, createdAt); err != nil {
			failed++
			if len(samples) < 15 {
				samples = append(samples, fmt.Sprintf("deck %d update: %v", row.ID, err))
			}
			continue
		}
		updated++
		if len(samples) < 15 {
			samples = append(samples, fmt.Sprintf("deck %d: fabrary_created_at=%s", row.ID, createdAt.UTC().Format(time.RFC3339)))
		}
	}

	summary := map[string]any{
		"checked": checked,
		"updated": updated,
		"skipped": skipped,
		"failed":  failed,
		"dry_run": *dryRun,
		"samples": samples,
	}
	out, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(out))
	if failed > 0 {
		os.Exit(1)
	}
}
