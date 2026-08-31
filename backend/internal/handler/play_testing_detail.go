package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

func (h *playTestingHTTP) parseSessionID(w http.ResponseWriter, r *http.Request) (int, bool) {
	sessionID, err := strconv.Atoi(strings.TrimSpace(r.PathValue("id")))
	if err != nil || sessionID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid session id")
		return 0, false
	}
	return sessionID, true
}

func (h *playTestingHTTP) isAdmin(u *domain.User) bool {
	return u != nil && u.Role != nil && *u.Role == domain.RoleAdmin
}

type playTestingNoteJSON struct {
	ID          int        `json:"id"`
	SessionID   int        `json:"session_id"`
	UserID      int        `json:"user_id"`
	Body        string     `json:"body"`
	DraftBody   string     `json:"draft_body,omitempty"`
	Published   bool       `json:"published"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	UpdatedAt   time.Time  `json:"updated_at"`
	FirstName   *string    `json:"first_name,omitempty"`
	Username    *string    `json:"username,omitempty"`
}

func playTestingPublishedNoteJSON(n *repository.PlayTestingSessionNote) playTestingNoteJSON {
	return playTestingNoteJSON{
		ID:          n.ID,
		SessionID:   n.SessionID,
		UserID:      n.UserID,
		Body:        n.Body,
		Published:   n.PublishedAt != nil,
		PublishedAt: n.PublishedAt,
		UpdatedAt:   n.UpdatedAt,
		FirstName:   n.FirstName,
		Username:    n.Username,
	}
}

func playTestingMyNoteJSON(n *repository.PlayTestingSessionNote) playTestingNoteJSON {
	body := n.DraftBody
	if body == "" {
		body = n.Body
	}
	return playTestingNoteJSON{
		ID:          n.ID,
		SessionID:   n.SessionID,
		UserID:      n.UserID,
		Body:        body,
		DraftBody:   n.DraftBody,
		Published:   n.PublishedAt != nil,
		PublishedAt: n.PublishedAt,
		UpdatedAt:   n.UpdatedAt,
		FirstName:   n.FirstName,
		Username:    n.Username,
	}
}

type playTestingInterestHeroJSON struct {
	HeroID       int     `json:"hero_id"`
	Name         string  `json:"name"`
	Young        bool    `json:"young"`
	CardImageURL *string `json:"card_image_url,omitempty"`
	ArtImageURL  *string `json:"art_image_url,omitempty"`
}

type playTestingInterestJSON struct {
	ID        int                           `json:"id"`
	SessionID int                           `json:"session_id"`
	UserID    int                           `json:"user_id"`
	Note      string                        `json:"note"`
	CreatedAt time.Time                     `json:"created_at"`
	UpdatedAt time.Time                     `json:"updated_at"`
	FirstName *string                       `json:"first_name,omitempty"`
	Username  *string                       `json:"username,omitempty"`
	Heroes    []playTestingInterestHeroJSON `json:"heroes"`
}

func interestToJSON(i *repository.PlayTestingSessionInterest) playTestingInterestJSON {
	heroes := make([]playTestingInterestHeroJSON, 0, len(i.Heroes))
	for _, h := range i.Heroes {
		heroes = append(heroes, playTestingInterestHeroJSON{
			HeroID:       h.HeroID,
			Name:         h.Name,
			Young:        h.Young,
			CardImageURL: h.CardImageURL,
			ArtImageURL:  h.ArtImageURL,
		})
	}
	return playTestingInterestJSON{
		ID:        i.ID,
		SessionID: i.SessionID,
		UserID:    i.UserID,
		Note:      i.Note,
		CreatedAt: i.CreatedAt,
		UpdatedAt: i.UpdatedAt,
		FirstName: i.FirstName,
		Username:  i.Username,
		Heroes:    heroes,
	}
}

type upsertPlayTestingNoteBody struct {
	Body    string `json:"body"`
	Publish bool   `json:"publish"`
}

type upsertPlayTestingInterestBody struct {
	HeroIDs []int  `json:"hero_ids"`
	Note    string `json:"note"`
}

func (h *playTestingHTTP) writeDetailRepoErr(w http.ResponseWriter, err error, action string) {
	switch {
	case errors.Is(err, repository.ErrPlayTestingSessionNotFound):
		writeMessageError(w, http.StatusNotFound, "session not found")
	case errors.Is(err, repository.ErrPlayTestingNoteNotFound):
		writeMessageError(w, http.StatusNotFound, "note not found")
	case errors.Is(err, repository.ErrPlayTestingInterestNotFound):
		writeMessageError(w, http.StatusNotFound, "interest not found")
	case errors.Is(err, repository.ErrPlayTestingRecordingNotFound):
		writeMessageError(w, http.StatusNotFound, "recording not found")
	case errors.Is(err, repository.ErrPlayTestingNotSessionOwner):
		http.Error(w, "Forbidden", http.StatusForbidden)
	case errors.Is(err, repository.ErrPlayTestingOwnerInterest):
		writeMessageError(w, http.StatusBadRequest, "session owner cannot express interest")
	case errors.Is(err, repository.ErrPlayTestingSessionClosed):
		writeMessageError(w, http.StatusConflict, "session is closed")
	case errors.Is(err, repository.ErrPlayTestingInterestHeroes):
		writeFieldError(w, http.StatusBadRequest, "hero_ids", "select at least one hero")
	case errors.Is(err, repository.ErrPlayTestingInterestNoteLen):
		writeFieldError(w, http.StatusBadRequest, "note", "note must be 280 characters or fewer")
	case strings.Contains(err.Error(), "not legal") || strings.Contains(err.Error(), "invalid hero"):
		writeFieldError(w, http.StatusBadRequest, "heroes", err.Error())
	case strings.Contains(err.Error(), "heroes must be different"):
		writeFieldError(w, http.StatusBadRequest, "second_hero_id", "choose two different heroes")
	case strings.Contains(err.Error(), "both heroes are required"):
		writeFieldError(w, http.StatusBadRequest, "heroes", "select both heroes")
	case strings.Contains(err.Error(), "recording url required"):
		writeFieldError(w, http.StatusBadRequest, "url", "required")
	case strings.Contains(err.Error(), "note body required"):
		writeFieldError(w, http.StatusBadRequest, "body", "required")
	case strings.Contains(err.Error(), "forbidden"):
		http.Error(w, "Forbidden", http.StatusForbidden)
	default:
		log.Error(action, "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
	}
}

// GET /api/play-testing/sessions/{id}
func (h *playTestingHTTP) getSession(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePlayTestingAccess(w, r); !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	session, err := h.app.Repo.GetPlayTestingSessionByID(r.Context(), sessionID)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing get session")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"session": sessionToJSON(session)})
}

// GET /api/play-testing/sessions/{id}/notes
func (h *playTestingHTTP) getNotes(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	session, err := h.app.Repo.GetPlayTestingSessionByID(r.Context(), sessionID)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing get session for notes")
		return
	}

	payload := map[string]any{"notes": []playTestingNoteJSON{}}
	published, err := h.app.Repo.GetPublishedPlayTestingSessionNote(r.Context(), sessionID)
	if err == nil {
		payload["notes"] = []playTestingNoteJSON{playTestingPublishedNoteJSON(published)}
	} else if !errors.Is(err, repository.ErrPlayTestingNoteNotFound) {
		h.writeDetailRepoErr(w, err, "play testing get published note")
		return
	}

	if u.ID == session.UserID {
		myNote, err := h.app.Repo.GetPlayTestingSessionNoteBySessionAndUser(r.Context(), sessionID, u.ID)
		if err == nil {
			payload["my_note"] = playTestingMyNoteJSON(myNote)
		} else if !errors.Is(err, repository.ErrPlayTestingNoteNotFound) {
			h.writeDetailRepoErr(w, err, "play testing get my note")
			return
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

// PUT /api/play-testing/sessions/{id}/notes
func (h *playTestingHTTP) upsertNote(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	var body upsertPlayTestingNoteBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(body.Body) == "" {
		writeFieldError(w, http.StatusBadRequest, "body", "required")
		return
	}
	note, err := h.app.Repo.UpsertPlayTestingSessionNote(r.Context(), sessionID, u.ID, body.Body, body.Publish)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing upsert note")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"note": playTestingMyNoteJSON(note)})
}

// DELETE /api/play-testing/sessions/{id}/notes
func (h *playTestingHTTP) deleteNote(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	if err := h.app.Repo.DeletePlayTestingSessionNote(r.Context(), sessionID, u.ID); err != nil {
		h.writeDetailRepoErr(w, err, "play testing delete note")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/play-testing/sessions/{id}/interests
func (h *playTestingHTTP) listInterests(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	if _, err := h.app.Repo.GetPlayTestingSessionByID(r.Context(), sessionID); err != nil {
		h.writeDetailRepoErr(w, err, "play testing get session for interests")
		return
	}
	rows, err := h.app.Repo.ListPlayTestingSessionInterests(r.Context(), sessionID)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing list interests")
		return
	}
	out := make([]playTestingInterestJSON, 0, len(rows))
	var mine *playTestingInterestJSON
	for i := range rows {
		j := interestToJSON(&rows[i])
		out = append(out, j)
		if rows[i].UserID == u.ID {
			cp := j
			mine = &cp
		}
	}
	payload := map[string]any{"interests": out}
	if mine != nil {
		payload["my_interest"] = mine
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(payload)
}

// PUT /api/play-testing/sessions/{id}/interests
func (h *playTestingHTTP) upsertInterest(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	var body upsertPlayTestingInterestBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if utf8.RuneCountInString(strings.TrimSpace(body.Note)) > repository.PlayTestingInterestNoteMaxRunes {
		writeFieldError(w, http.StatusBadRequest, "note", "note must be 280 characters or fewer")
		return
	}
	interest, err := h.app.Repo.UpsertPlayTestingSessionInterest(r.Context(), sessionID, u.ID, body.HeroIDs, body.Note)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing upsert interest")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"interest": interestToJSON(interest)})
}

// DELETE /api/play-testing/sessions/{id}/interests
func (h *playTestingHTTP) deleteMyInterest(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	if err := h.app.Repo.DeletePlayTestingSessionInterest(r.Context(), sessionID, u.ID, u.ID, false); err != nil {
		h.writeDetailRepoErr(w, err, "play testing delete my interest")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/play-testing/sessions/{id}/interests/{userId}
func (h *playTestingHTTP) deleteInterestByUser(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	interestUserID, err := strconv.Atoi(strings.TrimSpace(r.PathValue("userId")))
	if err != nil || interestUserID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	session, err := h.app.Repo.GetPlayTestingSessionByID(r.Context(), sessionID)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing get session for delete interest")
		return
	}
	isOwnerOrAdmin := session.UserID == u.ID || h.isAdmin(u)
	if interestUserID != u.ID && !isOwnerOrAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if err := h.app.Repo.DeletePlayTestingSessionInterest(r.Context(), sessionID, interestUserID, u.ID, isOwnerOrAdmin); err != nil {
		h.writeDetailRepoErr(w, err, "play testing delete interest")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

type playTestingRecordingJSON struct {
	ID                    int       `json:"id"`
	SessionID             int       `json:"session_id"`
	UserID                int       `json:"user_id"`
	RecordingID           int       `json:"recording_id"`
	CreatedAt             time.Time `json:"created_at"`
	URL                   string    `json:"url"`
	Label                 *string   `json:"label,omitempty"`
	Format                int16     `json:"format"`
	FirstHeroName         *string   `json:"first_hero_name,omitempty"`
	FirstHeroArtImageURL  *string   `json:"first_hero_art_image_url,omitempty"`
	SecondHeroName        *string   `json:"second_hero_name,omitempty"`
	SecondHeroArtImageURL *string   `json:"second_hero_art_image_url,omitempty"`
	FirstName             *string   `json:"first_name,omitempty"`
	Username              *string   `json:"username,omitempty"`
}

func playTestingRecordingToJSON(row *repository.PlayTestingSessionRecording) playTestingRecordingJSON {
	return playTestingRecordingJSON{
		ID:                    row.ID,
		SessionID:             row.SessionID,
		UserID:                row.UserID,
		RecordingID:           row.RecordingID,
		CreatedAt:             row.CreatedAt,
		URL:                   row.URL,
		Label:                 row.Label,
		Format:                row.Format,
		FirstHeroName:         row.FirstHeroName,
		FirstHeroArtImageURL:  row.FirstHeroArtImageURL,
		SecondHeroName:        row.SecondHeroName,
		SecondHeroArtImageURL: row.SecondHeroArtImageURL,
		FirstName:             row.FirstName,
		Username:              row.Username,
	}
}

type createPlayTestingRecordingBody struct {
	URL          string  `json:"url"`
	Label        *string `json:"label"`
	FirstHeroID  int     `json:"first_hero_id"`
	SecondHeroID int     `json:"second_hero_id"`
}

// GET /api/play-testing/sessions/{id}/recordings
func (h *playTestingHTTP) listRecordings(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requirePlayTestingAccess(w, r); !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	if _, err := h.app.Repo.GetPlayTestingSessionByID(r.Context(), sessionID); err != nil {
		h.writeDetailRepoErr(w, err, "play testing get session for recordings")
		return
	}
	rows, err := h.app.Repo.ListPlayTestingSessionRecordings(r.Context(), sessionID)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing list recordings")
		return
	}
	out := make([]playTestingRecordingJSON, 0, len(rows))
	for i := range rows {
		out = append(out, playTestingRecordingToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"recordings": out})
}

// POST /api/play-testing/sessions/{id}/recordings
func (h *playTestingHTTP) createRecording(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	var body createPlayTestingRecordingBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if strings.TrimSpace(body.URL) == "" {
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
	row, err := h.app.Repo.CreatePlayTestingSessionRecording(
		r.Context(), sessionID, u.ID, body.URL, body.Label, body.FirstHeroID, body.SecondHeroID,
	)
	if err != nil {
		h.writeDetailRepoErr(w, err, "play testing create recording")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"recording": playTestingRecordingToJSON(row)})
}

// DELETE /api/play-testing/sessions/{id}/recordings/{recordingLinkId}
func (h *playTestingHTTP) deleteRecording(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requirePlayTestingAccess(w, r)
	if !ok {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	linkID, err := strconv.Atoi(strings.TrimSpace(r.PathValue("recordingLinkId")))
	if err != nil || linkID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid recording id")
		return
	}
	if err := h.app.Repo.DeletePlayTestingSessionRecording(r.Context(), sessionID, linkID, u.ID, h.isAdmin(u)); err != nil {
		h.writeDetailRepoErr(w, err, "play testing delete recording")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
