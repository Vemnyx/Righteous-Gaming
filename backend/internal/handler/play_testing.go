package handler

import (
	"encoding/json"
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
	if u.Role == nil {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil, false
	}
	if !u.Role.CanAccessPlayTesting() {
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
	ID              int                          `json:"id"`
	UserID          int                          `json:"user_id"`
	Format          int16                        `json:"format"`
	Status          int16                        `json:"status"`
	Bucket          string                       `json:"bucket"`
	Note            string                       `json:"note,omitempty"`
	CreatedAt       time.Time                    `json:"created_at"`
	ClosedAt        *time.Time                   `json:"closed_at,omitempty"`
	OwnerFirstName  *string                      `json:"owner_first_name,omitempty"`
	OwnerUsername   *string                      `json:"owner_username,omitempty"`
	HeroesWith      []playTestingSessionHeroJSON `json:"heroes_with"`
	HeroesAgainst   []playTestingSessionHeroJSON `json:"heroes_against"`
	Timeframes      []playTestingTimeframeJSON   `json:"timeframes"`
	Interests       []playTestingInterestJSON    `json:"interests"`
}

type createPlayTestingTimeframeBody struct {
	Mode     string     `json:"mode"` // "now_open" | "range"
	StartsAt *time.Time `json:"starts_at"`
	EndsAt   *time.Time `json:"ends_at"`
}

type createPlayTestingSessionBody struct {
	Format        int16                            `json:"format"`
	Note          string                           `json:"note"`
	HeroesWith    []int                            `json:"heroes_with"`
	HeroesAgainst []int                            `json:"heroes_against"`
	Timeframes    []createPlayTestingTimeframeBody `json:"timeframes"`
}

func sessionToJSON(s *repository.PlayTestingSession) playTestingSessionJSON {
	bucket := repository.ClassifyPlayTestingSession(s, time.Now().UTC())
	out := playTestingSessionJSON{
		ID:             s.ID,
		UserID:         s.UserID,
		Format:         s.Format,
		Status:         s.Status,
		Bucket:         string(bucket),
		Note:           strings.TrimSpace(s.Note),
		CreatedAt:      s.CreatedAt,
		ClosedAt:       s.ClosedAt,
		OwnerFirstName: s.OwnerFirstName,
		OwnerUsername:  s.OwnerUsername,
		HeroesWith:     []playTestingSessionHeroJSON{},
		HeroesAgainst:  []playTestingSessionHeroJSON{},
		Timeframes:     []playTestingTimeframeJSON{},
		Interests:      []playTestingInterestJSON{},
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
	for i := range s.Interests {
		out.Interests = append(out.Interests, interestToJSON(&s.Interests[i]))
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

// GET /api/play-testing/sessions?status=current|upcoming|past
func (h *playTestingHTTP) listSessions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requirePlayTestingAccess(w, r); !ok {
		return
	}
	raw := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	var bucket repository.PlayTestingSessionBucket
	switch raw {
	case "", "current":
		bucket = repository.PlayTestingBucketCurrent
	case "upcoming":
		bucket = repository.PlayTestingBucketUpcoming
	case "past":
		bucket = repository.PlayTestingBucketPast
	default:
		writeFieldError(w, http.StatusBadRequest, "status", "must be current, upcoming, or past")
		return
	}
	sessions, err := h.app.Repo.ListPlayTestingSessions(r.Context(), bucket)
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
	_ = json.NewEncoder(w).Encode(map[string]any{"sessions": out, "status": string(bucket)})
}

// POST /api/play-testing/sessions/{id}/close
func (h *playTestingHTTP) closeSession(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, err := strconv.Atoi(strings.TrimSpace(r.PathValue("id")))
	if err != nil || sessionID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid session id")
		return
	}
	existing, err := h.app.Repo.GetPlayTestingSessionByID(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, repository.ErrPlayTestingSessionNotFound) {
			writeMessageError(w, http.StatusNotFound, "session not found")
			return
		}
		log.Error("play testing get session for close", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	isAdmin := u.Role != nil && *u.Role == domain.RoleAdmin
	if existing.UserID != u.ID && !isAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	closed, err := h.app.Repo.ClosePlayTestingSession(r.Context(), sessionID)
	if err != nil {
		if errors.Is(err, repository.ErrPlayTestingSessionNotFound) {
			writeMessageError(w, http.StatusNotFound, "session not found")
			return
		}
		log.Error("play testing close session", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"session": sessionToJSON(closed)})
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
	note := strings.TrimSpace(body.Note)
	if len([]rune(note)) > 500 {
		writeFieldError(w, http.StatusBadRequest, "note", "must be at most 500 characters")
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
			if starts.Before(now.Add(-2 * time.Minute)) {
				writeFieldError(w, http.StatusBadRequest, "timeframes", "starts_at cannot be in the past")
				return
			}
			var ends *time.Time
			if raw.EndsAt != nil {
				e := raw.EndsAt.UTC()
				if e.Before(starts) {
					writeFieldError(w, http.StatusBadRequest, "timeframes", "ends_at must be on or after starts_at")
					return
				}
				if e.Before(now.Add(-2 * time.Minute)) {
					writeFieldError(w, http.StatusBadRequest, "timeframes", "ends_at cannot be in the past")
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
		Note:          note,
		HeroesWith:    body.HeroesWith,
		HeroesAgainst: body.HeroesAgainst,
		Timeframes:    tfs,
	})
	if err != nil {
		log.Error("play testing create session", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	h.notifyPlayTestingSessionCreated(created)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"session": sessionToJSON(created)})
}
