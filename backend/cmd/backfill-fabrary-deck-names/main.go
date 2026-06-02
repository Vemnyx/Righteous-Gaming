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
		deckSourceID = flag.Int("deck-source-id", 0, "only decks with this deck_source_id (0 = all with fabrary_link)")
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

	decks, err := repo.ListDecks(ctx, filter)
	if err != nil {
		log.Fatal("list decks", "error", err)
	}

	delay := time.Duration(*delayMS) * time.Millisecond
	var checked, updated, skipped, failed int
	var samples []string

	for i, deck := range decks {
		if deck.FabraryLink == nil || strings.TrimSpace(*deck.FabraryLink) == "" {
			continue
		}
		checked++

		deckID, _, err := fabrary.ParseDeckURL(*deck.FabraryLink)
		if err != nil {
			failed++
			continue
		}

		fetched, err := fabrary.FetchDeck(ctx, deckID)
		if err != nil {
			failed++
			if len(samples) < 15 {
				samples = append(samples, fmt.Sprintf("deck %d fetch: %v", deck.ID, err))
			}
			continue
		}

		newName := strings.TrimSpace(fetched.Name)
		if newName == "" {
			skipped++
			continue
		}
		if newName == strings.TrimSpace(deck.Name) {
			skipped++
			continue
		}

		if *dryRun {
			updated++
			if len(samples) < 15 {
				samples = append(samples, fmt.Sprintf("deck %d: %q -> %q", deck.ID, deck.Name, newName))
			}
		} else {
			if err := repo.UpdateDeckName(ctx, deck.ID, newName); err != nil {
				failed++
				if len(samples) < 15 {
					samples = append(samples, fmt.Sprintf("deck %d update: %v", deck.ID, err))
				}
			} else {
				updated++
				if len(samples) < 15 {
					samples = append(samples, fmt.Sprintf("deck %d: %q -> %q", deck.ID, deck.Name, newName))
				}
			}
		}

		if i+1 < len(decks) && delay > 0 {
			time.Sleep(delay)
		}
	}

	summary := map[string]any{
		"checked":  checked,
		"updated":  updated,
		"skipped":  skipped,
		"failed":   failed,
		"dry_run":  *dryRun,
		"samples":  samples,
	}
	out, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(out))
	if failed > 0 {
		os.Exit(1)
	}
}
