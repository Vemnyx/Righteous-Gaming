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

type releaseTeamsHTTP struct {
	app *app.App
	svc *service.UserService
}

type releaseTeamHeroJSON struct {
	ID           int     `json:"id"`
	Name         string  `json:"name"`
	Young        bool    `json:"young"`
	CardImageURL *string `json:"card_image_url,omitempty"`
	ArtImageURL  *string `json:"art_image_url,omitempty"`
	Formats      []int16 `json:"formats,omitempty"`
}

type releaseTeamSessionJSON struct {
	ID              int                   `json:"id"`
	Title           string                `json:"title"`
	Format          int16                 `json:"format"`
	SetID           *int                  `json:"set_id,omitempty"`
	SetName         *string               `json:"set_name,omitempty"`
	Status          int16                 `json:"status"`
	CreatedByUserID int                   `json:"created_by_user_id"`
	CreatedAt       time.Time             `json:"created_at"`
	ClosedAt        *time.Time            `json:"closed_at,omitempty"`
	Heroes          []releaseTeamHeroJSON `json:"heroes"`
}

type releaseTeamMemberJSON struct {
	SessionID int       `json:"session_id"`
	HeroID    int       `json:"hero_id"`
	UserID    int       `json:"user_id"`
	IsCaptain bool      `json:"is_captain"`
	JoinedAt  time.Time `json:"joined_at"`
	FirstName *string   `json:"first_name,omitempty"`
	LastName  *string   `json:"last_name,omitempty"`
	Username  *string   `json:"username,omitempty"`
	Email     string    `json:"email"`
}

type releaseTeamNoteJSON struct {
	ID        int       `json:"id"`
	SessionID int       `json:"session_id"`
	HeroID    int       `json:"hero_id"`
	UserID    int       `json:"user_id"`
	Body      string    `json:"body"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	FirstName *string   `json:"first_name,omitempty"`
	Username  *string   `json:"username,omitempty"`
	Email     string    `json:"email"`
}

type releaseTeamDeckJSON struct {
	ID          int       `json:"id"`
	SessionID   int       `json:"session_id"`
	HeroID      int       `json:"hero_id"`
	UserID      int       `json:"user_id"`
	DeckID      int       `json:"deck_id"`
	CreatedAt   time.Time `json:"created_at"`
	DeckName    string    `json:"deck_name"`
	Format      int16     `json:"format"`
	FabraryLink *string   `json:"fabrary_link,omitempty"`
	FirstName   *string   `json:"first_name,omitempty"`
	Username    *string   `json:"username,omitempty"`
	Email       string    `json:"email"`
}

type releaseTeamRecordingJSON struct {
	ID          int       `json:"id"`
	SessionID   int       `json:"session_id"`
	HeroID      int       `json:"hero_id"`
	UserID      int       `json:"user_id"`
	RecordingID int       `json:"recording_id"`
	CreatedAt   time.Time `json:"created_at"`
	URL         string    `json:"url"`
	Label       *string   `json:"label,omitempty"`
	Format      int16     `json:"format"`
	FirstName   *string   `json:"first_name,omitempty"`
	Username    *string   `json:"username,omitempty"`
	Email       string    `json:"email"`
}

type createReleaseTeamSessionBody struct {
	Title   string `json:"title"`
	Format  int16  `json:"format"`
	SetID   *int   `json:"set_id"`
	HeroIDs []int  `json:"hero_ids"`
}

type memberUserBody struct {
	UserID int `json:"user_id"`
}

type noteBody struct {
	Body string `json:"body"`
}

type linkDeckBody struct {
	DeckID int `json:"deck_id"`
}

type linkRecordingBody struct {
	RecordingID int `json:"recording_id"`
}

type createRecordingForTeamBody struct {
	URL          string  `json:"url"`
	Label        *string `json:"label"`
	SecondHeroID *int    `json:"second_hero_id"`
	StartSeconds *int    `json:"start_seconds"`
}

func releaseTeamSessionToJSON(s *repository.ReleaseTeamSession) releaseTeamSessionJSON {
	heroes := make([]releaseTeamHeroJSON, 0, len(s.Heroes))
	for _, h := range s.Heroes {
		heroes = append(heroes, releaseTeamHeroJSON{
			ID: h.ID, Name: h.Name, Young: h.Young,
			CardImageURL: h.CardImageURL, ArtImageURL: h.ArtImageURL,
		})
	}
	return releaseTeamSessionJSON{
		ID: s.ID, Title: s.Title, Format: s.Format, SetID: s.SetID, SetName: s.SetName,
		Status: s.Status, CreatedByUserID: s.CreatedByUserID, CreatedAt: s.CreatedAt,
		ClosedAt: s.ClosedAt, Heroes: heroes,
	}
}

func releaseTeamMemberToJSON(m *repository.ReleaseTeamMember) releaseTeamMemberJSON {
	return releaseTeamMemberJSON{
		SessionID: m.SessionID, HeroID: m.HeroID, UserID: m.UserID, IsCaptain: m.IsCaptain,
		JoinedAt: m.JoinedAt, FirstName: m.FirstName, LastName: m.LastName,
		Username: m.Username, Email: m.Email,
	}
}

func releaseTeamNoteToJSON(n *repository.ReleaseTeamNote) releaseTeamNoteJSON {
	return releaseTeamNoteJSON{
		ID: n.ID, SessionID: n.SessionID, HeroID: n.HeroID, UserID: n.UserID, Body: n.Body,
		CreatedAt: n.CreatedAt, UpdatedAt: n.UpdatedAt, FirstName: n.FirstName,
		Username: n.Username, Email: n.Email,
	}
}

func releaseTeamDeckToJSON(d *repository.ReleaseTeamDeckLink) releaseTeamDeckJSON {
	return releaseTeamDeckJSON{
		ID: d.ID, SessionID: d.SessionID, HeroID: d.HeroID, UserID: d.UserID, DeckID: d.DeckID,
		CreatedAt: d.CreatedAt, DeckName: d.DeckName, Format: d.Format, FabraryLink: d.FabraryLink,
		FirstName: d.FirstName, Username: d.Username, Email: d.Email,
	}
}

func releaseTeamRecordingToJSON(rec *repository.ReleaseTeamRecordingLink) releaseTeamRecordingJSON {
	return releaseTeamRecordingJSON{
		ID: rec.ID, SessionID: rec.SessionID, HeroID: rec.HeroID, UserID: rec.UserID,
		RecordingID: rec.RecordingID, CreatedAt: rec.CreatedAt, URL: rec.URL, Label: rec.Label,
		Format: rec.Format, FirstName: rec.FirstName, Username: rec.Username, Email: rec.Email,
	}
}

func (h *releaseTeamsHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("release teams session auth", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func requireReleaseTeamsAccess(w http.ResponseWriter, u *domain.User) bool {
	if u != nil && u.Role != nil && u.Role.CanAccessReleaseTeams() {
		return true
	}
	http.Error(w, "Forbidden", http.StatusForbidden)
	return false
}

func (h *releaseTeamsHTTP) isAdmin(u *domain.User) bool {
	return u != nil && u.Role != nil && *u.Role == domain.RoleAdmin
}

func (h *releaseTeamsHTTP) parseSessionID(w http.ResponseWriter, r *http.Request) (int, bool) {
	raw := r.PathValue("id")
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid session id")
		return 0, false
	}
	return id, true
}

func (h *releaseTeamsHTTP) parseHeroID(w http.ResponseWriter, r *http.Request) (int, bool) {
	raw := r.PathValue("heroId")
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid hero id")
		return 0, false
	}
	return id, true
}

func (h *releaseTeamsHTTP) writeRepoErr(w http.ResponseWriter, err error, action string) {
	if errors.Is(err, repository.ErrReleaseTeamSessionNotFound) {
		writeMessageError(w, http.StatusNotFound, "session not found")
		return
	}
	if errors.Is(err, repository.ErrReleaseTeamSessionClosed) {
		writeMessageError(w, http.StatusForbidden, "session is closed")
		return
	}
	if errors.Is(err, repository.ErrReleaseTeamHeroNotInSession) {
		writeMessageError(w, http.StatusBadRequest, "hero is not part of this session")
		return
	}
	if errors.Is(err, repository.ErrReleaseTeamMemberNotFound) {
		writeMessageError(w, http.StatusNotFound, "member not found")
		return
	}
	if errors.Is(err, repository.ErrReleaseTeamNoteNotFound) {
		writeMessageError(w, http.StatusNotFound, "note not found")
		return
	}
	if errors.Is(err, repository.ErrReleaseTeamDeckNotFound) {
		writeMessageError(w, http.StatusNotFound, "deck link not found")
		return
	}
	if errors.Is(err, repository.ErrReleaseTeamRecordingNotFound) {
		writeMessageError(w, http.StatusNotFound, "recording link not found")
		return
	}
	log.Error(action, "error", err)
	writeMessageError(w, http.StatusInternalServerError, "internal server error")
}

func (h *releaseTeamsHTTP) requireTeamMemberOrAdmin(
	w http.ResponseWriter, r *http.Request, u *domain.User, sessionID, heroID int,
) bool {
	if h.isAdmin(u) {
		return true
	}
	ok, err := h.app.Repo.IsReleaseTeamMember(r.Context(), sessionID, heroID, u.ID)
	if err != nil {
		h.writeRepoErr(w, err, "check release team membership")
		return false
	}
	if !ok {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return false
	}
	return true
}

// GET /api/release-teams/meta
func (h *releaseTeamsHTTP) getMeta(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	heroes, err := h.app.Repo.ListPlayTestingHeroes(r.Context())
	if err != nil {
		log.Error("list release team heroes meta", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]releaseTeamHeroJSON, 0, len(heroes))
	for _, hero := range heroes {
		out = append(out, releaseTeamHeroJSON{
			ID: hero.ID, Name: hero.Name, Young: hero.Young,
			CardImageURL: hero.CardImageURL, ArtImageURL: hero.ArtImageURL,
			Formats: hero.Formats,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"heroes": out})
}

// GET /api/release-teams/sessions?status=current|past
func (h *releaseTeamsHTTP) listSessions(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	statusParam := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("status")))
	status := repository.ReleaseTeamStatusCurrent
	switch statusParam {
	case "", "current":
		status = repository.ReleaseTeamStatusCurrent
	case "past":
		status = repository.ReleaseTeamStatusPast
	default:
		writeFieldError(w, http.StatusBadRequest, "status", "must be current or past")
		return
	}
	rows, err := h.app.Repo.ListReleaseTeamSessions(r.Context(), status)
	if err != nil {
		h.writeRepoErr(w, err, "list release team sessions")
		return
	}
	out := make([]releaseTeamSessionJSON, 0, len(rows))
	for i := range rows {
		out = append(out, releaseTeamSessionToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"sessions": out})
}

// GET /api/release-teams/sessions/{id}
func (h *releaseTeamsHTTP) getSession(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	id, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	s, err := h.app.Repo.GetReleaseTeamSession(r.Context(), id)
	if err != nil {
		h.writeRepoErr(w, err, "get release team session")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"session": releaseTeamSessionToJSON(s)})
}

// POST /api/release-teams/sessions
func (h *releaseTeamsHTTP) createSession(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	if !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body createReleaseTeamSessionBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		writeFieldError(w, http.StatusBadRequest, "title", "required")
		return
	}
	if !domain.CardFormat(body.Format).Valid() {
		writeFieldError(w, http.StatusBadRequest, "format", "invalid format")
		return
	}
	if len(body.HeroIDs) == 0 {
		writeFieldError(w, http.StatusBadRequest, "hero_ids", "select at least one hero")
		return
	}
	if body.SetID != nil && *body.SetID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "set_id", "invalid set")
		return
	}
	if body.SetID != nil {
		if _, err := h.app.Repo.SetByID(r.Context(), *body.SetID); err != nil {
			if errors.Is(err, repository.ErrSetNotFound) {
				writeFieldError(w, http.StatusBadRequest, "set_id", "set not found")
				return
			}
			h.writeRepoErr(w, err, "validate release team set")
			return
		}
	}
	for _, heroID := range body.HeroIDs {
		if heroID <= 0 {
			writeFieldError(w, http.StatusBadRequest, "hero_ids", "invalid hero id")
			return
		}
		if _, err := h.app.Repo.HeroByID(r.Context(), heroID); err != nil {
			if errors.Is(err, repository.ErrHeroNotFound) {
				writeFieldError(w, http.StatusBadRequest, "hero_ids", "hero not found")
				return
			}
			h.writeRepoErr(w, err, "validate release team hero")
			return
		}
	}

	s, err := h.app.Repo.CreateReleaseTeamSession(r.Context(), repository.CreateReleaseTeamSessionInput{
		Title: title, Format: body.Format, SetID: body.SetID,
		CreatedByUserID: u.ID, HeroIDs: body.HeroIDs,
	})
	if err != nil {
		h.writeRepoErr(w, err, "create release team session")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"session": releaseTeamSessionToJSON(s)})
}

// POST /api/release-teams/sessions/{id}/close
func (h *releaseTeamsHTTP) closeSession(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) || !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	id, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	s, err := h.app.Repo.CloseReleaseTeamSession(r.Context(), id)
	if err != nil {
		h.writeRepoErr(w, err, "close release team session")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"session": releaseTeamSessionToJSON(s)})
}

// GET /api/release-teams/sessions/{id}/heroes/{heroId}/members
func (h *releaseTeamsHTTP) listMembers(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if _, err := h.app.Repo.GetReleaseTeamSession(r.Context(), sessionID); err != nil {
		h.writeRepoErr(w, err, "get session for members")
		return
	}
	rows, err := h.app.Repo.ListReleaseTeamMembers(r.Context(), sessionID, heroID)
	if err != nil {
		h.writeRepoErr(w, err, "list release team members")
		return
	}
	out := make([]releaseTeamMemberJSON, 0, len(rows))
	for i := range rows {
		out = append(out, releaseTeamMemberToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"members": out})
}

// POST /api/release-teams/sessions/{id}/heroes/{heroId}/join
func (h *releaseTeamsHTTP) joinTeam(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if err := h.app.Repo.AddReleaseTeamMember(r.Context(), sessionID, heroID, u.ID, false); err != nil {
		h.writeRepoErr(w, err, "join release team")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/release-teams/sessions/{id}/heroes/{heroId}/leave
func (h *releaseTeamsHTTP) leaveTeam(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if err := h.app.Repo.RemoveReleaseTeamMember(r.Context(), sessionID, heroID, u.ID); err != nil {
		h.writeRepoErr(w, err, "leave release team")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/release-teams/sessions/{id}/heroes/{heroId}/members
func (h *releaseTeamsHTTP) adminAddMember(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) || !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	var body memberUserBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if body.UserID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "user_id", "required")
		return
	}
	if err := h.app.Repo.AddReleaseTeamMember(r.Context(), sessionID, heroID, body.UserID, false); err != nil {
		h.writeRepoErr(w, err, "admin add release team member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// DELETE /api/release-teams/sessions/{id}/heroes/{heroId}/members/{userId}
func (h *releaseTeamsHTTP) adminRemoveMember(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) || !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	userID, err := strconv.Atoi(r.PathValue("userId"))
	if err != nil || userID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid user id")
		return
	}
	if err := h.app.Repo.RemoveReleaseTeamMember(r.Context(), sessionID, heroID, userID); err != nil {
		h.writeRepoErr(w, err, "admin remove release team member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/release-teams/sessions/{id}/heroes/{heroId}/captain
func (h *releaseTeamsHTTP) setCaptain(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) || !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	var body memberUserBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if body.UserID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "user_id", "required")
		return
	}
	if err := h.app.Repo.SetReleaseTeamCaptain(r.Context(), sessionID, heroID, body.UserID); err != nil {
		h.writeRepoErr(w, err, "set release team captain")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// GET /api/release-teams/eligible-users
func (h *releaseTeamsHTTP) listEligibleUsers(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) || !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	rows, err := h.app.Repo.ListUsersWithNames(r.Context())
	if err != nil {
		log.Error("list release team eligible users", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	type userJSON struct {
		ID        int     `json:"id"`
		FirstName *string `json:"first_name,omitempty"`
		LastName  *string `json:"last_name,omitempty"`
		Email     string  `json:"email"`
		Username  *string `json:"username,omitempty"`
	}
	out := make([]userJSON, 0, len(rows))
	for _, row := range rows {
		fn := row.FirstName
		ln := row.LastName
		out = append(out, userJSON{
			ID: row.ID, FirstName: &fn, LastName: &ln,
			Email: row.Email, Username: row.Username,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"users": out})
}

// GET /api/release-teams/sessions/{id}/heroes/{heroId}/notes
func (h *releaseTeamsHTTP) listNotes(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	rows, err := h.app.Repo.ListReleaseTeamNotes(r.Context(), sessionID, heroID)
	if err != nil {
		h.writeRepoErr(w, err, "list release team notes")
		return
	}
	out := make([]releaseTeamNoteJSON, 0, len(rows))
	for i := range rows {
		out = append(out, releaseTeamNoteToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"notes": out})
}

// POST /api/release-teams/sessions/{id}/heroes/{heroId}/notes
func (h *releaseTeamsHTTP) upsertNote(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if !h.requireTeamMemberOrAdmin(w, r, u, sessionID, heroID) {
		return
	}
	var body noteBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if strings.TrimSpace(body.Body) == "" {
		writeFieldError(w, http.StatusBadRequest, "body", "required")
		return
	}
	note, err := h.app.Repo.UpsertReleaseTeamNote(r.Context(), sessionID, heroID, u.ID, body.Body)
	if err != nil {
		h.writeRepoErr(w, err, "upsert release team note")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"note": releaseTeamNoteToJSON(note)})
}

// PATCH /api/release-teams/notes/{noteId}
func (h *releaseTeamsHTTP) updateNote(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	noteID, err := strconv.Atoi(r.PathValue("noteId"))
	if err != nil || noteID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid note id")
		return
	}
	existing, err := h.app.Repo.GetReleaseTeamNoteByID(r.Context(), noteID)
	if err != nil {
		h.writeRepoErr(w, err, "get release team note")
		return
	}
	if existing.UserID != u.ID && !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	var body noteBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if strings.TrimSpace(body.Body) == "" {
		writeFieldError(w, http.StatusBadRequest, "body", "required")
		return
	}
	note, err := h.app.Repo.UpdateReleaseTeamNoteByID(r.Context(), noteID, body.Body)
	if err != nil {
		h.writeRepoErr(w, err, "update release team note")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"note": releaseTeamNoteToJSON(note)})
}

// GET decks / POST link / GET recordings / POST link / POST create recording
func (h *releaseTeamsHTTP) listDecks(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	rows, err := h.app.Repo.ListReleaseTeamDecks(r.Context(), sessionID, heroID)
	if err != nil {
		h.writeRepoErr(w, err, "list release team decks")
		return
	}
	out := make([]releaseTeamDeckJSON, 0, len(rows))
	for i := range rows {
		out = append(out, releaseTeamDeckToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"decks": out})
}

func (h *releaseTeamsHTTP) linkDeck(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if !h.requireTeamMemberOrAdmin(w, r, u, sessionID, heroID) {
		return
	}
	if !requireDecksAndRecordingsWriteAccess(w, u) {
		return
	}
	var body linkDeckBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if body.DeckID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "deck_id", "required")
		return
	}
	session, err := h.app.Repo.GetReleaseTeamSession(r.Context(), sessionID)
	if err != nil {
		h.writeRepoErr(w, err, "get session for link deck")
		return
	}
	deck, _, err := h.app.Repo.GetDeckByID(r.Context(), body.DeckID)
	if err != nil {
		if errors.Is(err, repository.ErrDeckNotFound) {
			writeFieldError(w, http.StatusBadRequest, "deck_id", "deck not found")
			return
		}
		h.writeRepoErr(w, err, "get deck for release team link")
		return
	}
	if deck.UserID != u.ID && !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if deck.HeroID != heroID {
		writeFieldError(w, http.StatusBadRequest, "deck_id", "deck hero does not match team hero")
		return
	}
	if deck.Format != session.Format {
		writeFieldError(w, http.StatusBadRequest, "deck_id", "deck format does not match session format")
		return
	}
	link, err := h.app.Repo.LinkReleaseTeamDeck(r.Context(), sessionID, heroID, deck.UserID, deck.ID)
	if err != nil {
		h.writeRepoErr(w, err, "link release team deck")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"deck": releaseTeamDeckToJSON(link)})
}

func (h *releaseTeamsHTTP) listRecordings(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	rows, err := h.app.Repo.ListReleaseTeamRecordings(r.Context(), sessionID, heroID)
	if err != nil {
		h.writeRepoErr(w, err, "list release team recordings")
		return
	}
	out := make([]releaseTeamRecordingJSON, 0, len(rows))
	for i := range rows {
		out = append(out, releaseTeamRecordingToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"recordings": out})
}

func (h *releaseTeamsHTTP) linkRecording(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if !h.requireTeamMemberOrAdmin(w, r, u, sessionID, heroID) {
		return
	}
	if !requireDecksAndRecordingsWriteAccess(w, u) {
		return
	}
	var body linkRecordingBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if body.RecordingID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "recording_id", "required")
		return
	}
	session, err := h.app.Repo.GetReleaseTeamSession(r.Context(), sessionID)
	if err != nil {
		h.writeRepoErr(w, err, "get session for link recording")
		return
	}
	rec, err := h.app.Repo.GetRecordingByID(r.Context(), body.RecordingID)
	if err != nil {
		if errors.Is(err, repository.ErrRecordingNotFound) {
			writeFieldError(w, http.StatusBadRequest, "recording_id", "recording not found")
			return
		}
		h.writeRepoErr(w, err, "get recording for release team link")
		return
	}
	if rec.UserID != u.ID && !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}
	if rec.Format != session.Format {
		writeFieldError(w, http.StatusBadRequest, "recording_id", "recording format does not match session")
		return
	}
	matchesHero := (rec.FirstHeroID != nil && *rec.FirstHeroID == heroID) ||
		(rec.SecondHeroID != nil && *rec.SecondHeroID == heroID)
	if !matchesHero {
		writeFieldError(w, http.StatusBadRequest, "recording_id", "recording does not include this hero")
		return
	}
	link, err := h.app.Repo.LinkReleaseTeamRecording(r.Context(), sessionID, heroID, rec.UserID, rec.ID)
	if err != nil {
		h.writeRepoErr(w, err, "link release team recording")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"recording": releaseTeamRecordingToJSON(link)})
}

func (h *releaseTeamsHTTP) createRecording(w http.ResponseWriter, r *http.Request) {
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireReleaseTeamsAccess(w, u) {
		return
	}
	sessionID, ok := h.parseSessionID(w, r)
	if !ok {
		return
	}
	heroID, ok := h.parseHeroID(w, r)
	if !ok {
		return
	}
	if !h.requireTeamMemberOrAdmin(w, r, u, sessionID, heroID) {
		return
	}
	if !requireDecksAndRecordingsWriteAccess(w, u) {
		return
	}
	session, err := h.app.Repo.GetReleaseTeamSession(r.Context(), sessionID)
	if err != nil {
		h.writeRepoErr(w, err, "get session for create recording")
		return
	}
	if session.Status != repository.ReleaseTeamStatusCurrent {
		writeMessageError(w, http.StatusForbidden, "session is closed")
		return
	}
	var body createRecordingForTeamBody
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	url := strings.TrimSpace(body.URL)
	if url == "" {
		writeFieldError(w, http.StatusBadRequest, "url", "required")
		return
	}
	secondHeroID := 0
	if body.SecondHeroID != nil && *body.SecondHeroID > 0 {
		secondHeroID = *body.SecondHeroID
	}
	if secondHeroID == 0 {
		// Prefer pairing against the same hero if only one provided — recordings require two heroes.
		writeFieldError(w, http.StatusBadRequest, "second_hero_id", "required")
		return
	}
	rec, err := h.app.Repo.CreateRecording(r.Context(), repository.CreateRecordingInput{
		UserID: u.ID, URL: url, Label: body.Label,
		FirstHeroID: heroID, SecondHeroID: secondHeroID,
		Format: session.Format, StartSeconds: body.StartSeconds,
	})
	if err != nil {
		log.Error("create release team recording", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	link, err := h.app.Repo.LinkReleaseTeamRecording(r.Context(), sessionID, heroID, u.ID, rec.ID)
	if err != nil {
		h.writeRepoErr(w, err, "link created release team recording")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"recording": releaseTeamRecordingToJSON(link)})
}
