package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/herocrop"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type heroesHTTP struct {
	app *app.App
	svc *service.UserService
}

type heroAdminJSON struct {
	ID             int      `json:"id"`
	Name           string   `json:"name"`
	Type           int16    `json:"type"`
	Young          bool     `json:"young"`
	Classes        []int16  `json:"classes"`
	Talents        []int16  `json:"talents"`
	CardID         *int     `json:"card_id,omitempty"`
	CardIdentifier *string  `json:"card_identifier,omitempty"`
	CardImageURL   *string  `json:"card_image_url,omitempty"`
	ArtImageURL    *string  `json:"art_image_url,omitempty"`
	CropCenterX    *float64 `json:"crop_center_x,omitempty"`
	CropCenterY    *float64 `json:"crop_center_y,omitempty"`
}

type heroAdminListResponse struct {
	Heroes []heroAdminJSON `json:"heroes"`
}

type updateHeroAdminRequest struct {
	Name         string  `json:"name"`
	Type         int16   `json:"type"`
	Young        bool    `json:"young"`
	Classes      []int16 `json:"classes"`
	Talents      []int16 `json:"talents"`
	CardID       *int    `json:"card_id"`
	CardImageURL *string `json:"card_image_url"`
	ArtImageURL  *string `json:"art_image_url"`
}

type recropHeroArtRequest struct {
	CenterX float64 `json:"center_x"`
	CenterY float64 `json:"center_y"`
}

type recropHeroArtResponse struct {
	Hero heroAdminJSON `json:"hero"`
}

func (h *heroesHTTP) requireAdmin(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("heroes admin session", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	if u.Role == nil || *u.Role != domain.RoleAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil, false
	}
	return u, true
}

func heroAdminToJSON(row repository.HeroAdminRow) heroAdminJSON {
	classes := row.Classes
	if classes == nil {
		classes = []int16{}
	}
	talents := row.Talents
	if talents == nil {
		talents = []int16{}
	}
	return heroAdminJSON{
		ID:             row.ID,
		Name:           row.Name,
		Type:           row.Type,
		Young:          row.Young,
		Classes:        classes,
		Talents:        talents,
		CardID:         row.CardID,
		CardIdentifier: row.CardIdentifier,
		CardImageURL:   row.CardImageURL,
		ArtImageURL:    row.ArtImageURL,
		CropCenterX:    row.CropCenterX,
		CropCenterY:    row.CropCenterY,
	}
}

func optionalTrimmedURL(p *string) *string {
	if p == nil {
		return nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return nil
	}
	return &s
}

func (h *heroesHTTP) adminListHeroes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}

	rows, err := h.app.Repo.ListHeroesAdmin(r.Context())
	if err != nil {
		log.Error("admin list heroes", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	out := make([]heroAdminJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, heroAdminToJSON(row))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(heroAdminListResponse{Heroes: out})
}

type missingHeroCardJSON struct {
	CardID         int     `json:"card_id"`
	Name           string  `json:"name"`
	CardIdentifier *string `json:"card_identifier,omitempty"`
	Type           *int16  `json:"type,omitempty"`
	Young          bool    `json:"young"`
	Classes        []int16 `json:"classes"`
	Talents        []int16 `json:"talents"`
	CardImageURL   *string `json:"card_image_url,omitempty"`
	Eligible       bool    `json:"eligible"`
	SkipReason     string  `json:"skip_reason,omitempty"`
}

type missingHeroCardsResponse struct {
	Cards []missingHeroCardJSON `json:"cards"`
}

type createHeroesFromCardsRequest struct {
	CardIDs []int `json:"card_ids"`
}

type createHeroesFromCardsSkippedJSON struct {
	CardID int    `json:"card_id"`
	Reason string `json:"reason"`
}

type createHeroesFromCardsResponse struct {
	Created []heroAdminJSON                   `json:"created"`
	Skipped []createHeroesFromCardsSkippedJSON `json:"skipped"`
}

func missingHeroCardToJSON(row repository.MissingHeroCard) missingHeroCardJSON {
	classes := row.Classes
	if classes == nil {
		classes = []int16{}
	}
	talents := row.Talents
	if talents == nil {
		talents = []int16{}
	}
	return missingHeroCardJSON{
		CardID:         row.CardID,
		Name:           row.Name,
		CardIdentifier: row.CardIdentifier,
		Type:           row.HeroType,
		Young:          row.Young,
		Classes:        classes,
		Talents:        talents,
		CardImageURL:   row.CardImageURL,
		Eligible:       row.Eligible,
		SkipReason:     row.SkipReason,
	}
}

func (h *heroesHTTP) adminListMissingHeroCards(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}

	rows, err := h.app.Repo.ListMissingHeroCards(r.Context())
	if err != nil {
		log.Error("admin list missing hero cards", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	out := make([]missingHeroCardJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, missingHeroCardToJSON(row))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(missingHeroCardsResponse{Cards: out})
}

func (h *heroesHTTP) adminCreateHeroesFromCards(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}

	var body createHeroesFromCardsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}

	cardIDs := body.CardIDs
	if len(cardIDs) == 0 {
		missing, err := h.app.Repo.ListMissingHeroCards(r.Context())
		if err != nil {
			log.Error("admin create heroes list missing", "error", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		for _, row := range missing {
			if row.Eligible {
				cardIDs = append(cardIDs, row.CardID)
			}
		}
	}

	created := make([]heroAdminJSON, 0, len(cardIDs))
	skipped := make([]createHeroesFromCardsSkippedJSON, 0)
	seen := make(map[int]struct{}, len(cardIDs))
	for _, cardID := range cardIDs {
		if cardID <= 0 {
			skipped = append(skipped, createHeroesFromCardsSkippedJSON{CardID: cardID, Reason: "invalid card id"})
			continue
		}
		if _, ok := seen[cardID]; ok {
			continue
		}
		seen[cardID] = struct{}{}

		hero, err := h.app.Repo.CreateHeroFromCard(r.Context(), cardID)
		if err != nil {
			reason := "failed to create hero"
			switch {
			case errors.Is(err, repository.ErrCardNotFound):
				reason = "card not found"
			case errors.Is(err, repository.ErrHeroCardAlreadyLinked):
				reason = "hero already exists for card"
			case strings.Contains(err.Error(), "not a hero card"):
				reason = "card is not a hero card"
			case strings.Contains(err.Error(), "no valid heroes enum"):
				reason = "card has no valid heroes enum"
			case strings.Contains(err.Error(), "empty hero name"):
				reason = "card has empty name"
			default:
				log.Error("admin create hero from card", "card_id", cardID, "error", err)
			}
			skipped = append(skipped, createHeroesFromCardsSkippedJSON{CardID: cardID, Reason: reason})
			continue
		}
		created = append(created, heroAdminToJSON(*hero))
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(createHeroesFromCardsResponse{Created: created, Skipped: skipped})
}

func (h *heroesHTTP) adminUpdateHero(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}

	heroID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || heroID <= 0 {
		http.Error(w, "invalid hero id", http.StatusBadRequest)
		return
	}

	var body updateHeroAdminRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}
	if len(name) > 100 {
		http.Error(w, "name must be at most 100 characters", http.StatusBadRequest)
		return
	}
	if !domain.CardHero(body.Type).Valid() {
		http.Error(w, "invalid hero type", http.StatusBadRequest)
		return
	}
	classes := body.Classes
	if classes == nil {
		classes = []int16{}
	}
	for _, c := range classes {
		if !domain.CardClass(c).Valid() {
			http.Error(w, "invalid class id", http.StatusBadRequest)
			return
		}
	}
	talents := body.Talents
	if talents == nil {
		talents = []int16{}
	}
	for _, t := range talents {
		if !domain.CardTalent(t).Valid() {
			http.Error(w, "invalid talent id", http.StatusBadRequest)
			return
		}
	}
	if body.CardID != nil && *body.CardID <= 0 {
		http.Error(w, "card_id must be a positive integer or null", http.StatusBadRequest)
		return
	}

	updated, err := h.app.Repo.UpdateHeroAdmin(r.Context(), heroID, repository.HeroAdminUpdate{
		Name:         name,
		Type:         body.Type,
		Young:        body.Young,
		Classes:      classes,
		Talents:      talents,
		CardID:       body.CardID,
		CardImageURL: optionalTrimmedURL(body.CardImageURL),
		ArtImageURL:  optionalTrimmedURL(body.ArtImageURL),
	})
	if err != nil {
		if errors.Is(err, repository.ErrHeroNotFound) {
			http.Error(w, "hero not found", http.StatusNotFound)
			return
		}
		msg := err.Error()
		if strings.Contains(msg, "heroes_card_id_fkey") || strings.Contains(msg, "foreign key") {
			http.Error(w, "card_id does not match an existing card", http.StatusBadRequest)
			return
		}
		log.Error("admin update hero", "hero_id", heroID, "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(heroAdminToJSON(*updated))
}

func (h *heroesHTTP) adminRecropHeroArt(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	if h.app.GCS == nil {
		http.Error(w, "storage unavailable", http.StatusServiceUnavailable)
		return
	}

	heroID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || heroID <= 0 {
		http.Error(w, "invalid hero id", http.StatusBadRequest)
		return
	}

	var body recropHeroArtRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	if body.CenterX < 0 || body.CenterX > 1 || body.CenterY < 0 || body.CenterY > 1 {
		http.Error(w, "center_x and center_y must be between 0 and 1", http.StatusBadRequest)
		return
	}

	hero, err := h.app.Repo.GetHeroAdminByID(r.Context(), heroID)
	if err != nil {
		if errors.Is(err, repository.ErrHeroNotFound) {
			http.Error(w, "hero not found", http.StatusNotFound)
			return
		}
		log.Error("admin recrop get hero", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if hero.CardImageURL == nil || *hero.CardImageURL == "" {
		http.Error(w, "hero has no card image", http.StatusBadRequest)
		return
	}

	center := &herocrop.NormPoint{X: body.CenterX, Y: body.CenterY}
	pngBytes, err := herocrop.CropFromURL(r.Context(), *hero.CardImageURL, herocrop.PortraitBanner, center)
	if err != nil {
		log.Error("admin recrop hero art", "hero_id", heroID, "error", err)
		http.Error(w, "failed to crop hero art", http.StatusBadGateway)
		return
	}

	objectPath := herocrop.ObjectPath(hero.CardIdentifier, heroID)
	if err := h.app.GCS.Upload(r.Context(), objectPath, bytes.NewReader(pngBytes), "image/png"); err != nil {
		log.Error("admin recrop upload", "hero_id", heroID, "error", err)
		http.Error(w, "failed to upload hero art", http.StatusBadGateway)
		return
	}

	publicURL := gcsPublicObjectURL(objectPath)
	if err := h.app.Repo.UpdateHeroArtCrop(r.Context(), heroID, publicURL, body.CenterX, body.CenterY); err != nil {
		if errors.Is(err, repository.ErrHeroNotFound) {
			http.Error(w, "hero not found", http.StatusNotFound)
			return
		}
		log.Error("admin recrop update db", "hero_id", heroID, "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	hero.ArtImageURL = &publicURL
	hero.CropCenterX = &body.CenterX
	hero.CropCenterY = &body.CenterY
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(recropHeroArtResponse{Hero: heroAdminToJSON(*hero)})
}
