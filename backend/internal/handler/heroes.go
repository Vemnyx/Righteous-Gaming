package handler

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"

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
	ID              int      `json:"id"`
	Name            string   `json:"name"`
	CardIdentifier  *string  `json:"card_identifier,omitempty"`
	CardImageURL    *string  `json:"card_image_url,omitempty"`
	ArtImageURL     *string  `json:"art_image_url,omitempty"`
	CropCenterX     *float64 `json:"crop_center_x,omitempty"`
	CropCenterY     *float64 `json:"crop_center_y,omitempty"`
}

type heroAdminListResponse struct {
	Heroes []heroAdminJSON `json:"heroes"`
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
	return heroAdminJSON{
		ID:             row.ID,
		Name:           row.Name,
		CardIdentifier: row.CardIdentifier,
		CardImageURL:   row.CardImageURL,
		ArtImageURL:    row.ArtImageURL,
		CropCenterX:    row.CropCenterX,
		CropCenterY:    row.CropCenterY,
	}
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
	writeJSONResponse(w, heroAdminListResponse{Heroes: out})
}

func writeJSONResponse(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
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

	rows, err := h.app.Repo.ListHeroesAdmin(r.Context())
	if err != nil {
		log.Error("admin recrop list heroes", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	var hero *repository.HeroAdminRow
	for i := range rows {
		if rows[i].ID == heroID {
			hero = &rows[i]
			break
		}
	}
	if hero == nil {
		http.Error(w, "hero not found", http.StatusNotFound)
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
	writeJSONResponse(w, recropHeroArtResponse{Hero: heroAdminToJSON(*hero)})
}
