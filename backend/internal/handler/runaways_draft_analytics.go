package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type runawaysDraftHTTP struct {
	app *app.App
	svc *service.UserService
}

type runawaysDraftSetJSON struct {
	SetID     int    `json:"set_id"`
	SetName   string `json:"set_name"`
	DeckCount int    `json:"deck_count"`
}

type runawaysDraftHeroJSON struct {
	HeroID    int    `json:"hero_id"`
	HeroName  string `json:"hero_name"`
	DeckCount int    `json:"deck_count"`
}

type runawaysDraftCountBucketJSON struct {
	Label string `json:"label"`
	Key   string `json:"key"`
	Count int    `json:"count"`
}

type runawaysDraftTypeBucketJSON struct {
	ID    int `json:"id"`
	Count int `json:"count"`
}

type runawaysDraftAvgBucketJSON struct {
	Label    string  `json:"label"`
	Key      string  `json:"key"`
	AvgCount float64 `json:"avg_count"`
}

type runawaysDraftCardStatJSON struct {
	CardID               int     `json:"card_id"`
	Name                 string  `json:"name"`
	CardIdentifier       *string `json:"card_identifier,omitempty"`
	ImageURL             *string `json:"image_url,omitempty"`
	Type                 int16   `json:"type"`
	Pitch                *int16  `json:"pitch,omitempty"`
	Cost                 *int16  `json:"cost,omitempty"`
	Power                *int16  `json:"power,omitempty"`
	Block                *int16  `json:"block,omitempty"`
	Rarity               *int16  `json:"rarity,omitempty"`
	TotalCopies          int     `json:"total_copies"`
	DecksWithCard        int     `json:"decks_with_card"`
	PickRate             float64 `json:"pick_rate"`
	AvgCopiesWhenPresent float64 `json:"avg_copies_when_present"`
}

type runawaysDraftTimePeriodJSON struct {
	Label     string  `json:"label"`
	Key       string  `json:"key"`
	DeckCount int     `json:"deck_count"`
	StartAt   *string `json:"start_at,omitempty"`
	EndAt     *string `json:"end_at,omitempty"`
}

type runawaysDraftTimelineBucketJSON struct {
	Label     string `json:"label"`
	Key       string `json:"key"`
	DeckCount int    `json:"deck_count"`
}

type runawaysDraftCardTrendJSON struct {
	CardID             int     `json:"card_id"`
	Name               string  `json:"name"`
	CardIdentifier     *string `json:"card_identifier,omitempty"`
	ImageURL           *string `json:"image_url,omitempty"`
	Type               int16   `json:"type"`
	Rarity             *int16  `json:"rarity,omitempty"`
	EarlyPickRate      float64 `json:"early_pick_rate"`
	LatePickRate       float64 `json:"late_pick_rate"`
	PickRateDelta      float64 `json:"pick_rate_delta"`
	EarlyDecksWithCard int     `json:"early_decks_with_card"`
	LateDecksWithCard  int     `json:"late_decks_with_card"`
	TotalDecksWithCard int     `json:"total_decks_with_card"`
}

type runawaysDraftCompositionTrendJSON struct {
	Metric     string   `json:"metric"`
	Label      string   `json:"label"`
	EarlyValue *float64 `json:"early_value,omitempty"`
	LateValue  *float64 `json:"late_value,omitempty"`
	Delta      *float64 `json:"delta,omitempty"`
}

type runawaysDraftTimeTrendsJSON struct {
	Available          bool                              `json:"available"`
	TimedDeckCount     int                               `json:"timed_deck_count"`
	UntimedDeckCount   int                               `json:"untimed_deck_count"`
	SplitAt            *string                           `json:"split_at,omitempty"`
	Periods            []runawaysDraftTimePeriodJSON     `json:"periods"`
	Timeline           []runawaysDraftTimelineBucketJSON `json:"timeline"`
	RisingPicks        []runawaysDraftCardTrendJSON      `json:"rising_picks"`
	FallingPicks       []runawaysDraftCardTrendJSON      `json:"falling_picks"`
	CompositionTrends  []runawaysDraftCompositionTrendJSON `json:"composition_trends"`
	MinDeckAppearances int                               `json:"min_deck_appearances"`
	UnavailableReason  *string                           `json:"unavailable_reason,omitempty"`
}

func (h *runawaysDraftHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	u, err := h.svc.UserForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return nil, false
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return nil, false
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return nil, false
		}
		log.Error("runaways draft session user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func parseRunawaysDeckSourceID(r *http.Request) (int, error) {
	raw := strings.TrimSpace(r.URL.Query().Get("deck_source_id"))
	if raw == "" {
		return repository.RunawaysDraftSourceID, nil
	}
	sid, err := strconv.Atoi(raw)
	if err != nil || sid <= 0 {
		return 0, err
	}
	return sid, nil
}

func (h *runawaysDraftHTTP) getRunawaysDraftMeta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sourceID, err := parseRunawaysDeckSourceID(r)
	if err != nil || sourceID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "deck_source_id", "invalid")
		return
	}

	sets, err := h.app.Repo.ListRunawaysDraftSets(r.Context(), sourceID)
	if err != nil {
		log.Error("runaways draft meta sets", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	setIDStr := strings.TrimSpace(r.URL.Query().Get("set_id"))
	outSets := make([]runawaysDraftSetJSON, 0, len(sets))
	for _, s := range sets {
		row := runawaysDraftSetJSON{
			SetID:     s.SetID,
			SetName:   s.SetName,
			DeckCount: s.DeckCount,
		}
		outSets = append(outSets, row)
	}

	resp := map[string]any{
		"deck_source_id": sourceID,
		"sets":           outSets,
	}

	if setIDStr != "" {
		setID, err := strconv.Atoi(setIDStr)
		if err != nil || setID <= 0 {
			writeFieldError(w, http.StatusBadRequest, "set_id", "invalid")
			return
		}
		heroes, err := h.app.Repo.ListRunawaysDraftHeroes(r.Context(), sourceID, setID)
		if err != nil {
			log.Error("runaways draft meta heroes", "error", err)
			writeMessageError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		outHeroes := make([]runawaysDraftHeroJSON, 0, len(heroes))
		for _, hero := range heroes {
			outHeroes = append(outHeroes, runawaysDraftHeroJSON{
				HeroID:    hero.HeroID,
				HeroName:  hero.HeroName,
				DeckCount: hero.DeckCount,
			})
		}
		resp["heroes"] = outHeroes
		resp["set_id"] = setID
	}

	writeCatalogJSON(w, http.StatusOK, resp)
}

func (h *runawaysDraftHTTP) getRunawaysDraftAnalytics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sourceID, setID, heroID, ok := parseRunawaysDraftSetHeroQuery(w, r)
	if !ok {
		return
	}

	stats, err := h.app.Repo.RunawaysDraftAnalytics(r.Context(), sourceID, setID, heroID)
	if err != nil {
		log.Error("runaways draft analytics", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusOK, runawaysDraftAnalyticsToJSON(stats))
}

type runawaysDraftDeckRowJSON struct {
	ID             int     `json:"id"`
	Name           string  `json:"name"`
	OwnerUsername  *string `json:"owner_username,omitempty"`
	OwnerEmail     string  `json:"owner_email,omitempty"`
	MainboardCount int     `json:"mainboard_count"`
	FabraryLink    *string `json:"fabrary_link,omitempty"`
}

func parseRunawaysDraftSetHeroQuery(w http.ResponseWriter, r *http.Request) (sourceID, setID, heroID int, ok bool) {
	sourceID, err := parseRunawaysDeckSourceID(r)
	if err != nil || sourceID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "deck_source_id", "invalid")
		return 0, 0, 0, false
	}
	setID, err = strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("set_id")))
	if err != nil || setID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "set_id", "required")
		return 0, 0, 0, false
	}
	heroID, err = strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("hero_id")))
	if err != nil || heroID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "hero_id", "required")
		return 0, 0, 0, false
	}
	return sourceID, setID, heroID, true
}

func (h *runawaysDraftHTTP) listRunawaysDraftDecks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sourceID, setID, heroID, ok := parseRunawaysDraftSetHeroQuery(w, r)
	if !ok {
		return
	}

	rows, err := h.app.Repo.ListRunawaysDraftDecks(r.Context(), sourceID, setID, heroID)
	if err != nil {
		log.Error("list runaways draft decks", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	out := make([]runawaysDraftDeckRowJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, runawaysDraftDeckRowJSON{
			ID:             row.ID,
			Name:           row.Name,
			OwnerUsername:  row.OwnerUsername,
			OwnerEmail:     row.OwnerEmail,
			MainboardCount: row.MainboardCount,
			FabraryLink:    row.FabraryLink,
		})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"decks": out})
}

func (h *runawaysDraftHTTP) getRunawaysDraftDeck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sourceID, setID, heroID, ok := parseRunawaysDraftSetHeroQuery(w, r)
	if !ok {
		return
	}

	idStr := strings.TrimSpace(r.PathValue("id"))
	deckID, err := strconv.Atoi(idStr)
	if err != nil || deckID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid deck id")
		return
	}

	deck, entries, err := h.app.Repo.GetRunawaysDraftDeck(r.Context(), sourceID, setID, heroID, deckID)
	if err != nil {
		if errors.Is(err, repository.ErrDeckNotFound) {
			writeMessageError(w, http.StatusNotFound, "deck not found")
			return
		}
		log.Error("get runaways draft deck", "error", err, "deck_id", deckID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	cardPtrs := make([]*repository.Card, len(entries))
	for i := range entries {
		cardPtrs[i] = &entries[i].Card
	}
	if err := h.app.Repo.AttachPrintings(r.Context(), cardPtrs); err != nil {
		log.Error("get runaways draft deck attach printings", "error", err, "deck_id", deckID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	lines := make([]deckCardLineJSON, len(entries))
	for i := range entries {
		lines[i] = deckCardLineJSON{
			CardID:    entries[i].CardID,
			Mainboard: entries[i].Mainboard,
			Count:     entries[i].Count,
			Card:      cardToJSON(&entries[i].Card),
		}
	}

	resp := deckDetailJSON{
		Deck:     deckToJSON(deck),
		Cards:    lines,
		HeroCard: h.runawaysDraftHeroCardJSON(r.Context(), deck.HeroID),
	}
	writeCatalogJSON(w, http.StatusOK, resp)
}

func (h *runawaysDraftHTTP) runawaysDraftHeroCardJSON(ctx context.Context, heroID int) *cardJSON {
	hero, err := h.app.Repo.HeroByID(ctx, heroID)
	if err != nil || hero.CardID == nil || *hero.CardID <= 0 {
		return nil
	}
	card, err := h.app.Repo.CardByID(ctx, *hero.CardID)
	if err != nil {
		return nil
	}
	if err := h.app.Repo.AttachPrintings(ctx, []*repository.Card{card}); err != nil {
		return nil
	}
	j := cardToJSON(card)
	return &j
}

func runawaysDraftAnalyticsToJSON(s *repository.RunawaysDraftAnalytics) map[string]any {
	if s == nil {
		return map[string]any{}
	}

	avgPitch := make([]runawaysDraftAvgBucketJSON, 0, len(s.AvgDeckPitchBreakdown))
	for _, b := range s.AvgDeckPitchBreakdown {
		avgPitch = append(avgPitch, runawaysDraftAvgBucketJSON(b))
	}
	avgCost := make([]runawaysDraftAvgBucketJSON, 0, len(s.AvgDeckCostBreakdown))
	for _, b := range s.AvgDeckCostBreakdown {
		avgCost = append(avgCost, runawaysDraftAvgBucketJSON(b))
	}
	avgType := make([]runawaysDraftAvgBucketJSON, 0, len(s.AvgDeckTypeBreakdown))
	for _, b := range s.AvgDeckTypeBreakdown {
		avgType = append(avgType, runawaysDraftAvgBucketJSON(b))
	}
	avgBlock := make([]runawaysDraftAvgBucketJSON, 0, len(s.AvgDeckBlockBreakdown))
	for _, b := range s.AvgDeckBlockBreakdown {
		avgBlock = append(avgBlock, runawaysDraftAvgBucketJSON(b))
	}

	return map[string]any{
		"deck_count":               s.DeckCount,
		"avg_cost_per_deck":        s.AvgCostPerDeck,
		"avg_pitch_per_deck":       s.AvgPitchPerDeck,
		"avg_deck_pitch_breakdown": avgPitch,
		"avg_deck_cost_breakdown":  avgCost,
		"avg_deck_type_breakdown":  avgType,
		"avg_deck_block_breakdown": avgBlock,
		"cards":                    runawaysDraftCardsToJSON(s.Cards),
		"most_picked":              runawaysDraftCardsToJSON(s.MostPicked),
		"least_picked":             runawaysDraftCardsToJSON(s.LeastPicked),
		"top_sideboard":            runawaysDraftCardsToJSON(s.TopSideboard),
		"time_trends":              runawaysDraftTimeTrendsToJSON(s.TimeTrends),
	}
}

func runawaysDraftTimeTrendsToJSON(t *repository.RunawaysDraftTimeTrends) runawaysDraftTimeTrendsJSON {
	if t == nil {
		return runawaysDraftTimeTrendsJSON{
			Periods:           []runawaysDraftTimePeriodJSON{},
			Timeline:          []runawaysDraftTimelineBucketJSON{},
			RisingPicks:       []runawaysDraftCardTrendJSON{},
			FallingPicks:      []runawaysDraftCardTrendJSON{},
			CompositionTrends: []runawaysDraftCompositionTrendJSON{},
		}
	}
	out := runawaysDraftTimeTrendsJSON{
		Available:          t.Available,
		TimedDeckCount:     t.TimedDeckCount,
		UntimedDeckCount:   t.UntimedDeckCount,
		MinDeckAppearances: t.MinDeckAppearances,
		Periods:            make([]runawaysDraftTimePeriodJSON, 0, len(t.Periods)),
		Timeline:           make([]runawaysDraftTimelineBucketJSON, 0, len(t.Timeline)),
		RisingPicks:        make([]runawaysDraftCardTrendJSON, 0, len(t.RisingPicks)),
		FallingPicks:       make([]runawaysDraftCardTrendJSON, 0, len(t.FallingPicks)),
		CompositionTrends:  make([]runawaysDraftCompositionTrendJSON, 0, len(t.CompositionTrends)),
	}
	if t.SplitAt != nil {
		s := t.SplitAt.UTC().Format(time.RFC3339)
		out.SplitAt = &s
	}
	for _, p := range t.Periods {
		row := runawaysDraftTimePeriodJSON{
			Label:     p.Label,
			Key:       p.Key,
			DeckCount: p.DeckCount,
		}
		if p.StartAt != nil {
			s := p.StartAt.UTC().Format(time.RFC3339)
			row.StartAt = &s
		}
		if p.EndAt != nil {
			s := p.EndAt.UTC().Format(time.RFC3339)
			row.EndAt = &s
		}
		out.Periods = append(out.Periods, row)
	}
	for _, b := range t.Timeline {
		out.Timeline = append(out.Timeline, runawaysDraftTimelineBucketJSON(b))
	}
	for _, c := range t.RisingPicks {
		out.RisingPicks = append(out.RisingPicks, runawaysDraftCardTrendToJSON(c))
	}
	for _, c := range t.FallingPicks {
		out.FallingPicks = append(out.FallingPicks, runawaysDraftCardTrendToJSON(c))
	}
	for _, row := range t.CompositionTrends {
		label := row.Metric
		switch row.Metric {
		case "avg_cost":
			label = "Avg card cost / deck"
		case "avg_pitch":
			label = "Avg pitch / deck"
		}
		out.CompositionTrends = append(out.CompositionTrends, runawaysDraftCompositionTrendJSON{
			Metric:     row.Metric,
			Label:      label,
			EarlyValue: row.EarlyValue,
			LateValue:  row.LateValue,
			Delta:      row.Delta,
		})
	}
	if !t.Available {
		var reason string
		switch {
		case t.TimedDeckCount < 8:
			reason = "Need at least 8 decks with Fabrary created dates to compare trends."
		case len(t.Periods) < 2:
			reason = "Not enough dated decks in both early and late periods."
		default:
			reason = "Need at least 3 decks in each half of the submission timeline."
		}
		out.UnavailableReason = &reason
	}
	return out
}

func runawaysDraftCardTrendToJSON(row repository.RunawaysDraftCardTrend) runawaysDraftCardTrendJSON {
	return runawaysDraftCardTrendJSON{
		CardID:             row.CardID,
		Name:               row.Name,
		CardIdentifier:     row.CardIdentifier,
		ImageURL:           row.ImageURL,
		Type:               row.Type,
		Rarity:             row.Rarity,
		EarlyPickRate:      row.EarlyPickRate,
		LatePickRate:       row.LatePickRate,
		PickRateDelta:      row.PickRateDelta,
		EarlyDecksWithCard: row.EarlyDecksWithCard,
		LateDecksWithCard:  row.LateDecksWithCard,
		TotalDecksWithCard: row.TotalDecksWithCard,
	}
}

func runawaysDraftCardsToJSON(rows []repository.RunawaysDraftCardStat) []runawaysDraftCardStatJSON {
	out := make([]runawaysDraftCardStatJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, runawaysDraftCardStatJSON{
			CardID:               row.CardID,
			Name:                 row.Name,
			CardIdentifier:       row.CardIdentifier,
			ImageURL:             row.ImageURL,
			Type:                 row.Type,
			Pitch:                row.Pitch,
			Cost:                 row.Cost,
			Power:                row.Power,
			Block:                row.Block,
			Rarity:               row.Rarity,
			TotalCopies:          row.TotalCopies,
			DecksWithCard:        row.DecksWithCard,
			PickRate:             row.PickRate,
			AvgCopiesWhenPresent: row.AvgCopiesWhenPresent,
		})
	}
	return out
}
