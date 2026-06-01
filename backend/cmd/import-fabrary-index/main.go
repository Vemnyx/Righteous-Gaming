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

const defaultIndexURL = "https://raw.githubusercontent.com/fabrary/cards/refs/heads/main/packages/cards/src/index.ts"

func main() {
	var (
		srcURL           = flag.String("url", defaultIndexURL, "fabrary index.ts URL")
		srcFile          = flag.String("file", "", "local index.ts path (overrides -url)")
		dryRun           = flag.Bool("dry-run", false, "parse and report only; do not insert")
		limit            = flag.Int("limit", 0, "max new cards to insert (0 = all)")
		backfillPrintings = flag.Bool("backfill-printings", false, "add missing printings for cards already in the database")
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

	body, err := loadSource(ctx, *srcFile, *srcURL)
	if err != nil {
		log.Fatal("load source", "error", err)
	}
	log.Info("parsing card objects", "bytes", len(body))
	blocks, err := fabrary.ExtractAllCardObjectStrings(string(body))
	if err != nil {
		log.Fatal("parse", "error", err)
	}
	log.Info("parsed card objects", "count", len(blocks))

	start := time.Now()
	if *backfillPrintings {
		summary, err := runBackfillPrintings(ctx, repo, blocks, *dryRun)
		if err != nil {
			log.Fatal("backfill", "error", err)
		}
		summary["elapsed_seconds"] = time.Since(start).Seconds()
		printSummary(summary)
		return
	}

	setRows, err := repo.ListSets(ctx)
	if err != nil {
		log.Fatal("list sets", "error", err)
	}
	setCodeToID := make(map[string]int, len(setRows))
	for _, s := range setRows {
		setCodeToID[strings.ToLower(strings.TrimSpace(s.Code))] = s.ID
	}

	existing, err := repo.ListAllCardIdentifiersLower(ctx)
	if err != nil {
		log.Fatal("list identifiers", "error", err)
	}

	var (
		skippedHave   int
		skippedMap    int
		inserted      int
		printingCount int
		mapErrSamples []string
	)

	for i, block := range blocks {
		in, _, err := fabrary.MapCardBlockForImport(setCodeToID, block)
		if err != nil {
			skippedMap++
			if len(mapErrSamples) < 20 {
				mapErrSamples = append(mapErrSamples, err.Error())
			}
			continue
		}
		if in.CardIdentifier == nil {
			skippedMap++
			continue
		}
		key := strings.ToLower(strings.TrimSpace(*in.CardIdentifier))
		if _, ok := existing[key]; ok {
			skippedHave++
			continue
		}
		if *limit > 0 && inserted >= *limit {
			break
		}
		if *dryRun {
			inserted++
			printingCount += len(in.Printings)
			existing[key] = struct{}{}
			continue
		}
		if _, err := repo.CreateCard(ctx, in); err != nil {
			skippedMap++
			if len(mapErrSamples) < 30 {
				mapErrSamples = append(mapErrSamples, fmt.Sprintf("%s: %v", key, err))
			}
			continue
		}
		inserted++
		printingCount += len(in.Printings)
		existing[key] = struct{}{}
		if inserted%250 == 0 {
			log.Info("import progress", "inserted", inserted, "block", i+1, "total", len(blocks))
		}
	}

	printSummary(map[string]any{
		"objects_total":        len(blocks),
		"skipped_already_have": skippedHave,
		"skipped_unmapped":     skippedMap,
		"inserted":             inserted,
		"printings_inserted":   printingCount,
		"dry_run":              *dryRun,
		"elapsed_seconds":      time.Since(start).Seconds(),
		"sample_errors":        mapErrSamples,
	})
}

func loadSource(ctx context.Context, srcFile, srcURL string) ([]byte, error) {
	if strings.TrimSpace(srcFile) != "" {
		return os.ReadFile(strings.TrimSpace(srcFile))
	}
	log.Info("fetching fabrary index", "url", srcURL)
	return fabrary.FetchSourceURL(ctx, srcURL)
}

func runBackfillPrintings(ctx context.Context, repo *repository.Repository, blocks []string, dryRun bool) (map[string]any, error) {
	cardIDs, err := repo.ListCardIDsByIdentifierLower(ctx)
	if err != nil {
		return nil, err
	}
	printingSetCodes, err := repo.ListPrintingSetCodesByCardID(ctx)
	if err != nil {
		return nil, err
	}

	var (
		cardsMatched    int
		cardsUpdated    int
		printingsAdded  int
		printingsSkipped int
		parseErrors     []string
	)

	for _, block := range blocks {
		ident, ok := fabrary.CardIdentifierFromBlock(block)
		if !ok {
			continue
		}
		key := strings.ToLower(strings.TrimSpace(ident))
		cardID, ok := cardIDs[key]
		if !ok {
			continue
		}
		printings, err := fabrary.ExtractPrintingsFromBlock(block)
		if err != nil {
			if len(parseErrors) < 20 {
				parseErrors = append(parseErrors, fmt.Sprintf("%s: %v", key, err))
			}
			continue
		}
		cardsMatched++
		keys := printingSetCodes[cardID]
		if keys == nil {
			keys = make(map[string]struct{})
			printingSetCodes[cardID] = keys
		}
		missing := 0
		for _, p := range printings {
			k := printingSetCodeKey(p.SetCode)
			if k == "" {
				continue
			}
			if _, exists := keys[k]; exists {
				printingsSkipped++
				continue
			}
			missing++
		}
		if missing == 0 {
			continue
		}
		if dryRun {
			cardsUpdated++
			printingsAdded += missing
			for _, p := range printings {
				k := printingSetCodeKey(p.SetCode)
				if k == "" {
					continue
				}
				if _, exists := keys[k]; !exists {
					keys[k] = struct{}{}
				}
			}
			continue
		}
		added, err := repo.InsertCardPrintings(ctx, cardID, printings, keys)
		if err != nil {
			if len(parseErrors) < 30 {
				parseErrors = append(parseErrors, fmt.Sprintf("%s: %v", key, err))
			}
			continue
		}
		if added > 0 {
			cardsUpdated++
			printingsAdded += added
			printingsSkipped += len(printings) - added
		}
	}

	return map[string]any{
		"mode":                "backfill_printings",
		"objects_total":       len(blocks),
		"cards_matched":       cardsMatched,
		"cards_updated":       cardsUpdated,
		"printings_added":     printingsAdded,
		"printings_skipped":   printingsSkipped,
		"dry_run":             dryRun,
		"sample_errors":       parseErrors,
	}, nil
}

func printSummary(summary map[string]any) {
	out, _ := json.MarshalIndent(summary, "", "  ")
	fmt.Println(string(out))
}

func printingSetCodeKey(setCode string) string {
	return strings.ToLower(strings.TrimSpace(setCode))
}
