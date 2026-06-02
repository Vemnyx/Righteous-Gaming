package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

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
	TotalCopies          int     `json:"total_copies"`
	DecksWithCard        int     `json:"decks_with_card"`
	PickRate             float64 `json:"pick_rate"`
	AvgCopiesWhenPresent float64 `json:"avg_copies_when_present"`
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

	sourceID, err := parseRunawaysDeckSourceID(r)
	if err != nil || sourceID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "deck_source_id", "invalid")
		return
	}

	setID, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("set_id")))
	if err != nil || setID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "set_id", "required")
		return
	}
	heroID, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("hero_id")))
	if err != nil || heroID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "hero_id", "required")
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

func runawaysDraftAnalyticsToJSON(s *repository.RunawaysDraftAnalytics) map[string]any {
	if s == nil {
		return map[string]any{}
	}

	pitch := make([]runawaysDraftCountBucketJSON, 0, len(s.PitchBreakdown))
	for _, b := range s.PitchBreakdown {
		pitch = append(pitch, runawaysDraftCountBucketJSON(b))
	}
	cost := make([]runawaysDraftCountBucketJSON, 0, len(s.CostBreakdown))
	for _, b := range s.CostBreakdown {
		cost = append(cost, runawaysDraftCountBucketJSON(b))
	}
	types := make([]runawaysDraftTypeBucketJSON, 0, len(s.TypeBreakdown))
	for _, b := range s.TypeBreakdown {
		types = append(types, runawaysDraftTypeBucketJSON(b))
	}
	classes := make([]runawaysDraftTypeBucketJSON, 0, len(s.ClassBreakdown))
	for _, b := range s.ClassBreakdown {
		classes = append(classes, runawaysDraftTypeBucketJSON(b))
	}
	talents := make([]runawaysDraftTypeBucketJSON, 0, len(s.TalentBreakdown))
	for _, b := range s.TalentBreakdown {
		talents = append(talents, runawaysDraftTypeBucketJSON(b))
	}

	return map[string]any{
		"deck_count":           s.DeckCount,
		"total_copies":         s.TotalCopies,
		"avg_copies_per_deck":  s.AvgCopiesPerDeck,
		"avg_cost":             s.AvgCost,
		"avg_pitch":            s.AvgPitch,
		"avg_power":            s.AvgPower,
		"avg_defense":          s.AvgDefense,
		"pitch_breakdown":      pitch,
		"cost_breakdown":       cost,
		"type_breakdown":       types,
		"class_breakdown":      classes,
		"talent_breakdown":     talents,
		"cards":                runawaysDraftCardsToJSON(s.Cards),
		"most_picked":          runawaysDraftCardsToJSON(s.MostPicked),
		"least_picked":         runawaysDraftCardsToJSON(s.LeastPicked),
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
			TotalCopies:          row.TotalCopies,
			DecksWithCard:        row.DecksWithCard,
			PickRate:             row.PickRate,
			AvgCopiesWhenPresent: row.AvgCopiesWhenPresent,
		})
	}
	return out
}
