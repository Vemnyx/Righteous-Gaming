package deckimport

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/fabrary"
	"righteous-gaming/backend/internal/repository"
)

// ErrUnknownCards is returned when Fabrary cards are missing from the catalog.
type ErrUnknownCards struct {
	Unknown []string
}

func (e *ErrUnknownCards) Error() string {
	return fmt.Sprintf("some cards were not found in the catalog (%d)", len(e.Unknown))
}

// Result is the outcome of a successful Fabrary deck import.
type Result struct {
	Deck          *repository.Deck
	CardsImported int
}

// Options overrides limited-format metadata on import (e.g. force Omens Draft set label).
type Options struct {
	SetID         *int
	FabraryFormat string // when set and format is Limited, use instead of Fabrary's label (e.g. "Draft")
}

// ImportFabrary loads a Fabrary deck and stores it for userID with deckSourceID.
func ImportFabrary(
	ctx context.Context,
	repo *repository.Repository,
	userID int,
	deckSourceID int,
	link string,
	opts *Options,
) (*Result, error) {
	link = strings.TrimSpace(link)
	if link == "" {
		return nil, fmt.Errorf("fabrary_link required")
	}
	if userID <= 0 {
		return nil, fmt.Errorf("user_id required")
	}
	if deckSourceID <= 0 {
		return nil, fmt.Errorf("deck_source_id required")
	}
	if _, err := repo.DeckSourceByID(ctx, deckSourceID); err != nil {
		if errors.Is(err, repository.ErrDeckSourceNotFound) {
			return nil, fmt.Errorf("invalid deck_source_id")
		}
		return nil, err
	}

	deckID, normalizedLink, err := fabrary.ParseDeckURL(link)
	if err != nil {
		return nil, err
	}

	fetched, err := fabrary.FetchDeck(ctx, deckID)
	if err != nil {
		return nil, fmt.Errorf("could not load deck from Fabrary: %w", err)
	}

	format, err := fabrary.FormatFromFabrary(fetched.Format)
	if err != nil {
		return nil, fmt.Errorf("unsupported format: %s", fetched.Format)
	}
	if !domain.CardFormat(format).Valid() {
		return nil, fmt.Errorf("unsupported format")
	}

	heroID, err := resolveFabraryHeroID(ctx, repo, fetched.HeroIdentifier)
	if err != nil {
		return nil, err
	}

	idMap, err := repo.ListCardIDsByIdentifierLower(ctx)
	if err != nil {
		return nil, err
	}

	cardInputs, unknown := mapFabraryDeckCards(fetched, idMap)
	if len(unknown) > 0 {
		return nil, &ErrUnknownCards{Unknown: unknown}
	}
	if len(cardInputs) == 0 {
		return nil, fmt.Errorf("deck has no importable cards")
	}

	linkCopy := normalizedLink
	setID, fabraryFormat := limitedDeckSetFields(ctx, repo, format, fetched.Format, cardInputs, opts)
	created, err := repo.CreateDeckWithCards(ctx, repository.CreateDeckInput{
		UserID:        userID,
		Name:          fetched.Name,
		Format:        format,
		HeroID:        heroID,
		SetID:         setID,
		FabraryFormat: fabraryFormat,
		DeckSourceID:  deckSourceID,
		FabraryLink:   &linkCopy,
	}, cardInputs)
	if err != nil {
		return nil, err
	}

	return &Result{
		Deck:          created,
		CardsImported: sumDeckCardCounts(cardInputs),
	}, nil
}

func sumDeckCardCounts(cards []repository.DeckCardInput) int {
	n := 0
	for _, c := range cards {
		if c.Count > 0 {
			n += c.Count
		} else {
			n++
		}
	}
	return n
}

func limitedDeckSetFields(
	ctx context.Context,
	repo *repository.Repository,
	format int16,
	fabraryFormatRaw string,
	cards []repository.DeckCardInput,
	opts *Options,
) (*int, *string) {
	if format != int16(domain.CardFormatLimited) {
		return nil, nil
	}

	var fabFormat *string
	if opts != nil {
		if override := strings.TrimSpace(opts.FabraryFormat); fabrary.IsLimitedFamilyFormatLabel(override) {
			label := override
			fabFormat = &label
		}
	}
	if fabFormat == nil {
		raw := strings.TrimSpace(fabraryFormatRaw)
		if fabrary.IsLimitedFamilyFormatLabel(raw) {
			label := raw
			fabFormat = &label
		} else {
			return nil, nil
		}
	}

	if opts != nil && opts.SetID != nil {
		return opts.SetID, fabFormat
	}

	ids := make([]int, 0, len(cards))
	seen := make(map[int]struct{}, len(cards))
	for _, c := range cards {
		if c.CardID <= 0 {
			continue
		}
		if _, ok := seen[c.CardID]; ok {
			continue
		}
		seen[c.CardID] = struct{}{}
		ids = append(ids, c.CardID)
	}
	setID, err := repo.MajoritySetIDForCardIDs(ctx, ids)
	if err != nil {
		return nil, fabFormat
	}
	return setID, fabFormat
}

func resolveFabraryHeroID(ctx context.Context, repo *repository.Repository, heroIdentifier string) (int, error) {
	ident := strings.ToLower(strings.TrimSpace(heroIdentifier))
	if ident == "" {
		return 0, fmt.Errorf("deck has no hero")
	}

	if heroID, err := repo.HeroIDByCardIdentifier(ctx, ident); err == nil {
		return heroID, nil
	} else if !errors.Is(err, repository.ErrHeroNotFound) {
		return 0, fmt.Errorf("could not resolve hero")
	}

	heroType, err := fabrary.HeroFromIdentifier(heroIdentifier)
	if err != nil {
		return 0, err
	}
	if !domain.CardHero(heroType).Valid() {
		return 0, fmt.Errorf("unsupported hero")
	}

	heroID, err := repo.HeroIDByType(ctx, heroType)
	if err != nil {
		if errors.Is(err, repository.ErrHeroNotFound) {
			return 0, fmt.Errorf("hero not found in catalog")
		}
		return 0, fmt.Errorf("could not resolve hero")
	}
	return heroID, nil
}

func mapFabraryDeckCards(fetched *fabrary.Deck, idMap map[string]int) ([]repository.DeckCardInput, []string) {
	type rowKey struct {
		cardID    int
		mainboard bool
	}
	counts := make(map[rowKey]int)
	unknownSeen := make(map[string]struct{})
	var unknown []string

	for _, line := range fetched.Cards {
		ident := strings.ToLower(strings.TrimSpace(line.CardIdentifier))
		if ident == "" {
			continue
		}
		cardID, ok := idMap[ident]
		if !ok {
			if _, seen := unknownSeen[line.CardIdentifier]; !seen {
				unknownSeen[line.CardIdentifier] = struct{}{}
				unknown = append(unknown, line.CardIdentifier)
			}
			continue
		}
		if line.MainboardQuantity > 0 {
			k := rowKey{cardID: cardID, mainboard: true}
			counts[k] += line.MainboardQuantity
		}
		if line.SideboardQuantity > 0 {
			k := rowKey{cardID: cardID, mainboard: false}
			counts[k] += line.SideboardQuantity
		}
	}

	out := make([]repository.DeckCardInput, 0, len(counts))
	for k, count := range counts {
		out = append(out, repository.DeckCardInput{
			CardID:    k.cardID,
			Mainboard: k.mainboard,
			Count:     count,
		})
	}
	return out, unknown
}
