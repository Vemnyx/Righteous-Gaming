package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type playTestingHTTP struct {
	app *app.App
	svc *service.UserService
}

func (h *playTestingHTTP) requirePlayTestingAccess(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("play testing access auth", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	// Temporary owner-only gate while Play Testing is in early access.
	email := strings.ToLower(strings.TrimSpace(u.Email))
	if email != "programmerjake95@gmail.com" {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil, false
	}
	return u, true
}

type playTestingHeroJSON struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	Young        bool    `json:"young"`
	CardImageURL *string `json:"card_image_url,omitempty"`
	ArtImageURL  *string `json:"art_image_url,omitempty"`
	Formats      []int16 `json:"formats"`
}

type playTestingSessionHeroJSON struct {
	HeroID       int     `json:"hero_id"`
	Side         int16   `json:"side"`
	Name         string  `json:"name"`
	Young        bool    `json:"young"`
	CardImageURL *string `json:"card_image_url,omitempty"`
	ArtImageURL  *string `json:"art_image_url,omitempty"`
}

type playTestingTimeframeJSON struct {
	ID        int        `json:"id,omitempty"`
	StartsAt  time.Time  `json:"starts_at"`
	EndsAt    *time.Time `json:"ends_at,omitempty"`
	SortOrder int        `json:"sort_order"`
}

type playTestingSessionJSON struct {
	ID            int                          `json:"id"`
	UserID        int                          `json:"user_id"`
	Format        int16                        `json:"format"`
	CreatedAt     time.Time                    `json:"created_at"`
	OwnerFirstName *string                     `json:"owner_first_name,omitempty"`
	OwnerUsername  *string                     `json:"owner_username,omitempty"`
	HeroesWith    []playTestingSessionHeroJSON `json:"heroes_with"`
	HeroesAgainst []playTestingSessionHeroJSON `json:"heroes_against"`
	Timeframes    []playTestingTimeframeJSON   `json:"timeframes"`
}

type createPlayTestingTimeframeBody struct {
	Mode     string     `json:"mode"` // "now_open" | "range"
	StartsAt *time.Time `json:"starts_at"`
	EndsAt   *time.Time `json:"ends_at"`
}

type createPlayTestingSessionBody struct {
	Format        int16                          `json:"format"`
	HeroesWith    []int                          `json:"heroes_with"`
	HeroesAgainst []int                          `json:"heroes_against"`
	Timeframes    []createPlayTestingTimeframeBody `json:"timeframes"`
}

func sessionToJSON(s *repository.PlayTestingSession) playTestingSessionJSON {
	out := playTestingSessionJSON{
		ID:             s.ID,
		UserID:         s.UserID,
		Format:         s.Format,
		CreatedAt:      s.CreatedAt,
		OwnerFirstName: s.OwnerFirstName,
		OwnerUsername:  s.OwnerUsername,
		HeroesWith:     []playTestingSessionHeroJSON{},
		HeroesAgainst:  []playTestingSessionHeroJSON{},
		Timeframes:     []playTestingTimeframeJSON{},
	}
	for _, h := range s.Heroes {
		item := playTestingSessionHeroJSON{
			HeroID:       h.HeroID,
			Side:         h.Side,
			Name:         h.Name,
			Young:        h.Young,
			CardImageURL: h.CardImageURL,
			ArtImageURL:  h.ArtImageURL,
		}
		if h.Side == repository.PlayTestingHeroSideAgainst {
			out.HeroesAgainst = append(out.HeroesAgainst, item)
		} else {
			out.HeroesWith = append(out.HeroesWith, item)
		}
	}
	for _, tf := range s.Timeframes {
		out.Timeframes = append(out.Timeframes, playTestingTimeframeJSON{
			ID:        tf.ID,
			StartsAt:  tf.StartsAt,
			EndsAt:    tf.EndsAt,
			SortOrder: tf.SortOrder,
		})
	}
	return out
}

// GET /api/play-testing/meta
func (h *playTestingHTTP) getMeta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requirePlayTestingAccess(w, r); !ok {
		return
	}
	heroes, err := h.app.Repo.ListPlayTestingHeroes(r.Context())
	if err != nil {
		log.Error("play testing list heroes", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]playTestingHeroJSON, 0, len(heroes))
	for _, hero := range heroes {
		formats := hero.Formats
		if formats == nil {
			formats = []int16{}
		}
		out = append(out, playTestingHeroJSON{
			ID:           hero.ID,
			Name:         hero.Name,
			Young:        hero.Young,
			CardImageURL: hero.CardImageURL,
			ArtImageURL:  hero.ArtImageURL,
			Formats:      formats,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"heroes": out})
}

// GET /api/play-testing/sessions
func (h *playTestingHTTP) listSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requirePlayTestingAccess(w, r); !ok {
		return
	}
	sessions, err := h.app.Repo.ListPlayTestingSessions(r.Context())
	if err != nil {
		log.Error("play testing list sessions", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]playTestingSessionJSON, 0, len(sessions))
	for i := range sessions {
		out = append(out, sessionToJSON(&sessions[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"sessions": out})
}

// POST /api/play-testing/sessions
func (h *playTestingHTTP) createSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}

	var body createPlayTestingSessionBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	format := domain.CardFormat(body.Format)
	if !format.Valid() {
		writeFieldError(w, http.StatusBadRequest, "format", "invalid format")
		return
	}
	if len(body.Timeframes) == 0 {
		writeFieldError(w, http.StatusBadRequest, "timeframes", "at least one timeframe is required")
		return
	}
	if len(body.Timeframes) > 20 {
		writeFieldError(w, http.StatusBadRequest, "timeframes", "too many timeframes")
		return
	}

	allHeroIDs := make([]int, 0, len(body.HeroesWith)+len(body.HeroesAgainst))
	allHeroIDs = append(allHeroIDs, body.HeroesWith...)
	allHeroIDs = append(allHeroIDs, body.HeroesAgainst...)
	if err := h.app.Repo.HeroesExistAndLegalInFormat(r.Context(), allHeroIDs, body.Format); err != nil {
		if strings.Contains(err.Error(), "not legal") || strings.Contains(err.Error(), "invalid hero") {
			writeFieldError(w, http.StatusBadRequest, "heroes", err.Error())
			return
		}
		log.Error("play testing validate heroes", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	now := time.Now().UTC()
	tfs := make([]repository.CreatePlayTestingTimeframeInput, 0, len(body.Timeframes))
	for i, raw := range body.Timeframes {
		mode := strings.ToLower(strings.TrimSpace(raw.Mode))
		switch mode {
		case "now_open", "now":
			tfs = append(tfs, repository.CreatePlayTestingTimeframeInput{
				StartsAt:  now,
				EndsAt:    nil,
				SortOrder: i,
			})
		case "range", "":
			if raw.StartsAt == nil {
				writeFieldError(w, http.StatusBadRequest, "timeframes", "starts_at is required for range timeframes")
				return
			}
			starts := raw.StartsAt.UTC()
			var ends *time.Time
			if raw.EndsAt != nil {
				e := raw.EndsAt.UTC()
				if e.Before(starts) {
					writeFieldError(w, http.StatusBadRequest, "timeframes", "ends_at must be on or after starts_at")
					return
				}
				ends = &e
			}
			tfs = append(tfs, repository.CreatePlayTestingTimeframeInput{
				StartsAt:  starts,
				EndsAt:    ends,
				SortOrder: i,
			})
		default:
			writeFieldError(w, http.StatusBadRequest, "timeframes", "mode must be now_open or range")
			return
		}
	}

	created, err := h.app.Repo.CreatePlayTestingSession(r.Context(), repository.CreatePlayTestingSessionInput{
		UserID:        u.ID,
		Format:        body.Format,
		HeroesWith:    body.HeroesWith,
		HeroesAgainst: body.HeroesAgainst,
		Timeframes:    tfs,
	})
	if err != nil {
		log.Error("play testing create session", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"session": sessionToJSON(created)})
}
