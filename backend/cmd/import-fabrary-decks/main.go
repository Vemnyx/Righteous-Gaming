package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"righteous-gaming/backend/internal/db"
	"righteous-gaming/backend/internal/deckimport"
	"righteous-gaming/backend/internal/fabrary"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

func main() {
	var (
		filePath       = flag.String("file", "data/discord-fabrary-decks.txt", "path to file with one Fabrary deck URL per line")
		userID         = flag.Int("user-id", 0, "owner user_id for imported decks (required)")
		deckSourceID   = flag.Int("deck-source-id", 3, "deck_source.id to assign")
		setName        = flag.String("set-name", "Omens of the Third Age", "sets.name for limited draft label (empty to infer from cards)")
		fabraryFormat  = flag.String("fabrary-format", "Draft", "fabrary_format for limited decks (Draft, Limited, or Sealed)")
		skipExisting   = flag.Bool("skip-existing", true, "skip when this user already has the same fabrary_link")
		dryRun         = flag.Bool("dry-run", false, "validate links only; do not insert")
		delayMS        = flag.Int("delay-ms", 400, "pause between Fabrary API requests")
	)
	flag.Parse()

	if *userID <= 0 {
		log.Fatal("user-id is required (e.g. -user-id=1)")
	}

	links, err := readLinks(*filePath)
	if err != nil {
		log.Fatal("read links", "error", err)
	}
	if len(links) == 0 {
		log.Fatal("no links found", "file", *filePath)
	}

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

	if _, err := repo.DeckSourceByID(ctx, *deckSourceID); err != nil {
		log.Fatal("deck source", "deck_source_id", *deckSourceID, "error", err)
	}

	var importOpts *deckimport.Options
	if strings.TrimSpace(*setName) != "" || strings.TrimSpace(*fabraryFormat) != "" {
		importOpts = &deckimport.Options{
			FabraryFormat: strings.TrimSpace(*fabraryFormat),
		}
		if name := strings.TrimSpace(*setName); name != "" {
			setRow, err := resolveSetByName(ctx, repo, name)
			if err != nil {
				log.Fatal("resolve set", "set_name", name, "error", err)
			}
			setID := setRow.ID
			importOpts.SetID = &setID
		}
	}

	summary := map[string]any{
		"file":            *filePath,
		"links_total":     len(links),
		"user_id":         *userID,
		"deck_source_id":  *deckSourceID,
		"set_name":        strings.TrimSpace(*setName),
		"fabrary_format":  strings.TrimSpace(*fabraryFormat),
		"dry_run":         *dryRun,
		"skip_existing":   *skipExisting,
	}
	if importOpts != nil && importOpts.SetID != nil {
		summary["set_id"] = *importOpts.SetID
	}
	var imported, skipped, failed int
	var failSamples []string

	delay := time.Duration(*delayMS) * time.Millisecond
	for i, link := range links {
		_, normalized, err := fabrary.ParseDeckURL(link)
		if err != nil {
			failed++
			if len(failSamples) < 25 {
				failSamples = append(failSamples, fmt.Sprintf("%s: %v", link, err))
			}
			continue
		}

		if *skipExisting {
			exists, err := repo.DeckExistsByFabraryLink(ctx, *userID, normalized)
			if err != nil {
				failed++
				if len(failSamples) < 25 {
					failSamples = append(failSamples, fmt.Sprintf("%s: %v", normalized, err))
				}
				continue
			}
			if exists {
				skipped++
				continue
			}
		}

		if *dryRun {
			imported++
			continue
		}

		result, err := deckimport.ImportFabrary(ctx, repo, *userID, *deckSourceID, normalized, importOpts)
		if err != nil {
			failed++
			if len(failSamples) < 25 {
				var unknown *deckimport.ErrUnknownCards
				if errors.As(err, &unknown) {
					failSamples = append(failSamples, fmt.Sprintf("%s: unknown cards: %v", normalized, unknown.Unknown))
				} else {
					failSamples = append(failSamples, fmt.Sprintf("%s: %v", normalized, err))
				}
			}
		} else {
			imported++
			if (imported)%10 == 0 {
				log.Info("import progress", "imported", imported, "index", i+1, "total", len(links), "deck_id", result.Deck.ID)
			}
		}

		if i+1 < len(links) && delay > 0 {
			time.Sleep(delay)
		}
	}

	summary["imported"] = imported
	summary["skipped_existing"] = skipped
	summary["failed"] = failed
	summary["fail_samples"] = failSamples
	out, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(out))
	if failed > 0 {
		os.Exit(1)
	}
}

func readLinks(path string) ([]string, error) {
	f, err := os.Open(strings.TrimSpace(path))
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var links []string
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		links = append(links, line)
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}
	return links, nil
}

func resolveSetByName(ctx context.Context, repo *repository.Repository, name string) (*repository.Set, error) {
	candidates := []string{name}
	if !strings.EqualFold(name, "Omen of the Third Age") {
		candidates = append(candidates, "Omen of the Third Age")
	}
	if !strings.EqualFold(name, "Omens of the Third Age") {
		candidates = append(candidates, "Omens of the Third Age")
	}
	for _, candidate := range candidates {
		setRow, err := repo.SetByNameFold(ctx, candidate)
		if err == nil {
			return setRow, nil
		}
		if !errors.Is(err, repository.ErrSetNotFound) {
			return nil, err
		}
	}
	return nil, fmt.Errorf("set not found (tried: %s)", strings.Join(candidates, ", "))
}
