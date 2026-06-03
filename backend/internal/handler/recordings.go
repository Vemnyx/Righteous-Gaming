package handler

import (
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

type recordingsHTTP struct {
	app *app.App
	svc *service.UserService
}

type recordingHeroJSON struct {
	ID          int     `json:"id"`
	Name        string  `json:"name"`
	ArtImageURL *string `json:"art_image_url,omitempty"`
	Formats     []int16 `json:"formats,omitempty"`
}

type recordingUploaderJSON struct {
	ID       int     `json:"id"`
	Email    string  `json:"email"`
	Username *string `json:"username,omitempty"`
}

type recordingJSON struct {
	ID                    int     `json:"id"`
	UserID                int     `json:"user_id"`
	URL                   string  `json:"url"`
	Label                 *string `json:"label,omitempty"`
	FirstHeroID           *int    `json:"first_hero_id,omitempty"`
	SecondHeroID          *int    `json:"second_hero_id,omitempty"`
	Format                int16   `json:"format"`
	CreatedAt             string  `json:"created_at"`
	OwnerUsername         *string `json:"owner_username,omitempty"`
	OwnerEmail            string  `json:"owner_email,omitempty"`
	FirstHeroName         *string `json:"first_hero_name,omitempty"`
	FirstHeroArtImageURL  *string `json:"first_hero_art_image_url,omitempty"`
	SecondHeroName        *string `json:"second_hero_name,omitempty"`
	SecondHeroArtImageURL *string `json:"second_hero_art_image_url,omitempty"`
}

type recordingCommentJSON struct {
	ID            int     `json:"id"`
	RecordingID   int     `json:"recording_id"`
	UserID        int     `json:"user_id"`
	Comment       string  `json:"comment"`
	CreatedAt     string  `json:"created_at"`
	OwnerUsername *string `json:"owner_username,omitempty"`
	OwnerEmail    string  `json:"owner_email,omitempty"`
}

type createRecordingRequest struct {
	URL          string  `json:"url"`
	Label        *string `json:"label"`
	FirstHeroID  int     `json:"first_hero_id"`
	SecondHeroID int     `json:"second_hero_id"`
	Format       int16   `json:"format"`
}

type createRecordingCommentRequest struct {
	Comment string `json:"comment"`
}

func (h *recordingsHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("recordings session user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func recordingToJSON(r *repository.Recording) recordingJSON {
	if r == nil {
		return recordingJSON{}
	}
	return recordingJSON{
		ID:                    r.ID,
		UserID:                r.UserID,
		URL:                   r.URL,
		Label:                 r.Label,
		FirstHeroID:           r.FirstHeroID,
		SecondHeroID:          r.SecondHeroID,
		Format:                r.Format,
		CreatedAt:             r.CreatedAt.UTC().Format(time.RFC3339Nano),
		OwnerUsername:         r.OwnerUsername,
		OwnerEmail:            r.OwnerEmail,
		FirstHeroName:         r.FirstHeroName,
		FirstHeroArtImageURL:  r.FirstHeroArtImageURL,
		SecondHeroName:        r.SecondHeroName,
		SecondHeroArtImageURL: r.SecondHeroArtImageURL,
	}
}

func recordingCommentToJSON(c *repository.RecordingComment) recordingCommentJSON {
	if c == nil {
		return recordingCommentJSON{}
	}
	return recordingCommentJSON{
		ID:            c.ID,
		RecordingID:   c.RecordingID,
		UserID:        c.UserID,
		Comment:       c.Comment,
		CreatedAt:     c.CreatedAt.UTC().Format(time.RFC3339Nano),
		OwnerUsername: c.OwnerUsername,
		OwnerEmail:    c.OwnerEmail,
	}
}

func parseRecordingListQuery(r *http.Request) repository.ListRecordingsFilter {
	filter := repository.ListRecordingsFilter{
		Limit:  10,
		Offset: 0,
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("page")); raw != "" {
		if page, err := strconv.Atoi(raw); err == nil && page >= 0 {
			filter.Offset = page * filter.Limit
		}
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("format")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil {
			f := int16(v)
			filter.Format = &f
		}
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("user_id")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			filter.UserID = &v
		}
	}
	if raw := strings.TrimSpace(r.URL.Query().Get("hero_id")); raw != "" {
		if v, err := strconv.Atoi(raw); err == nil && v > 0 {
			filter.HeroID = &v
		}
	}
	return filter
}

func (h *recordingsHTTP) getRecordingsMeta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	heroes, err := h.app.Repo.ListRecordingHeroes(r.Context())
	if err != nil {
		log.Error("recordings meta heroes", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	uploaders, uploaderErr := h.app.Repo.ListRecordingUploaders(r.Context())
	if uploaderErr != nil {
		log.Error("recordings meta uploaders", "error", uploaderErr)
	}

	outHeroes := make([]recordingHeroJSON, 0, len(heroes))
	for _, row := range heroes {
		outHeroes = append(outHeroes, recordingHeroJSON{
			ID: row.ID, Name: row.Name, ArtImageURL: row.ArtImageURL, Formats: row.Formats,
		})
	}
	outUploaders := make([]recordingUploaderJSON, 0)
	if uploaderErr == nil {
		outUploaders = make([]recordingUploaderJSON, 0, len(uploaders))
		for _, row := range uploaders {
			outUploaders = append(outUploaders, recordingUploaderJSON{
				ID: row.ID, Email: row.Email, Username: row.Username,
			})
		}
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{
		"heroes":    outHeroes,
		"uploaders": outUploaders,
	})
}

func (h *recordingsHTTP) listRecordings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	filter := parseRecordingListQuery(r)
	total, err := h.app.Repo.CountRecordings(r.Context(), filter)
	if err != nil {
		log.Error("list recordings count", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	rows, err := h.app.Repo.ListRecordings(r.Context(), filter)
	if err != nil {
		log.Error("list recordings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	page := 0
	if filter.Offset > 0 && filter.Limit > 0 {
		page = filter.Offset / filter.Limit
	}
	out := make([]recordingJSON, 0, len(rows))
	for i := range rows {
		out = append(out, recordingToJSON(&rows[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{
		"recordings": out,
		"total":      total,
		"page":       page,
		"page_size":  filter.Limit,
	})
}

func (h *recordingsHTTP) createRecording(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	var body createRecordingRequest
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	url := strings.TrimSpace(body.URL)
	if url == "" {
		writeFieldError(w, http.StatusBadRequest, "url", "required")
		return
	}
	if body.FirstHeroID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "first_hero_id", "required")
		return
	}
	if body.SecondHeroID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "second_hero_id", "required")
		return
	}
	if !domain.CardFormat(body.Format).Valid() {
		writeFieldError(w, http.StatusBadRequest, "format", "invalid")
		return
	}
	if _, err := h.app.Repo.HeroByID(r.Context(), body.FirstHeroID); err != nil {
		writeFieldError(w, http.StatusBadRequest, "first_hero_id", "invalid")
		return
	}
	if _, err := h.app.Repo.HeroByID(r.Context(), body.SecondHeroID); err != nil {
		writeFieldError(w, http.StatusBadRequest, "second_hero_id", "invalid")
		return
	}
	legal1, err := h.app.Repo.HeroLegalInFormat(r.Context(), body.FirstHeroID, body.Format)
	if err != nil {
		log.Error("create recording hero1 format", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !legal1 {
		writeFieldError(w, http.StatusBadRequest, "first_hero_id", "not legal in selected format")
		return
	}
	legal2, err := h.app.Repo.HeroLegalInFormat(r.Context(), body.SecondHeroID, body.Format)
	if err != nil {
		log.Error("create recording hero2 format", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !legal2 {
		writeFieldError(w, http.StatusBadRequest, "second_hero_id", "not legal in selected format")
		return
	}

	var label *string
	if body.Label != nil {
		t := strings.TrimSpace(*body.Label)
		if t != "" {
			label = &t
		}
	}

	rec, err := h.app.Repo.CreateRecording(r.Context(), repository.CreateRecordingInput{
		UserID:       u.ID,
		URL:          url,
		Label:        label,
		FirstHeroID:  body.FirstHeroID,
		SecondHeroID: body.SecondHeroID,
		Format:       body.Format,
	})
	if err != nil {
		log.Error("create recording", "error", err, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, map[string]any{"recording": recordingToJSON(rec)})
}

func (h *recordingsHTTP) getRecording(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	id, ok := parsePathID(w, r, "id")
	if !ok {
		return
	}
	rec, err := h.app.Repo.GetRecordingByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrRecordingNotFound) {
			writeMessageError(w, http.StatusNotFound, "recording not found")
			return
		}
		log.Error("get recording", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	comments, err := h.app.Repo.ListRecordingComments(r.Context(), id)
	if err != nil {
		log.Error("get recording comments", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	outComments := make([]recordingCommentJSON, 0, len(comments))
	for i := range comments {
		outComments = append(outComments, recordingCommentToJSON(&comments[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{
		"recording": recordingToJSON(rec),
		"comments":  outComments,
	})
}

func (h *recordingsHTTP) createRecordingComment(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	id, ok := parsePathID(w, r, "id")
	if !ok {
		return
	}
	if _, err := h.app.Repo.GetRecordingByID(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrRecordingNotFound) {
			writeMessageError(w, http.StatusNotFound, "recording not found")
			return
		}
		log.Error("create recording comment lookup", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	var body createRecordingCommentRequest
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	comment := strings.TrimSpace(body.Comment)
	if comment == "" {
		writeFieldError(w, http.StatusBadRequest, "comment", "required")
		return
	}

	row, err := h.app.Repo.CreateRecordingComment(r.Context(), id, u.ID, comment)
	if err != nil {
		log.Error("create recording comment", "error", err, "id", id, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, map[string]any{"comment": recordingCommentToJSON(row)})
}

func parsePathID(w http.ResponseWriter, r *http.Request, key string) (int, bool) {
	raw := strings.TrimSpace(r.PathValue(key))
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	return id, true
}
