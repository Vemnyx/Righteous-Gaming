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

type meetingsHTTP struct {
	app *app.App
	svc *service.UserService
}

type meetingJSON struct {
	ID              int       `json:"id"`
	MeetingAt       time.Time `json:"meeting_at"`
	Summary         string    `json:"summary"`
	VideoURL        *string   `json:"video_url,omitempty"`
	CreatedByUserID int       `json:"created_by_user_id"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

type createMeetingBody struct {
	MeetingAt string  `json:"meeting_at"`
	Summary   string  `json:"summary"`
	VideoURL  *string `json:"video_url"`
}

type attachMeetingVideoBody struct {
	VideoURL string `json:"video_url"`
}

func meetingToJSON(m *repository.Meeting) meetingJSON {
	return meetingJSON{
		ID:              m.ID,
		MeetingAt:       m.MeetingAt,
		Summary:         m.Summary,
		VideoURL:        m.VideoURL,
		CreatedByUserID: m.CreatedByUserID,
		CreatedAt:       m.CreatedAt,
		UpdatedAt:       m.UpdatedAt,
	}
}

func (h *meetingsHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("meetings session auth", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func requireMeetingsAccess(w http.ResponseWriter, u *domain.User) bool {
	if u != nil && u.Role != nil && u.Role.CanAccessMeetings() {
		return true
	}
	http.Error(w, "Forbidden", http.StatusForbidden)
	return false
}

// GET /api/meetings
func (h *meetingsHTTP) listMeetings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireMeetingsAccess(w, u) {
		return
	}

	rows, err := h.app.Repo.ListMeetings(r.Context())
	if err != nil {
		log.Error("list meetings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]meetingJSON, 0, len(rows))
	for i := range rows {
		out = append(out, meetingToJSON(&rows[i]))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"meetings": out})
}

// POST /api/meetings
func (h *meetingsHTTP) createMeeting(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireMeetingsAccess(w, u) || !requireWriteAccess(w, u) {
		return
	}

	var body createMeetingBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	summary := strings.TrimSpace(body.Summary)
	if summary == "" {
		writeFieldError(w, http.StatusBadRequest, "summary", "summary is required")
		return
	}
	if len(summary) > 8000 {
		writeFieldError(w, http.StatusBadRequest, "summary", "summary is too long")
		return
	}

	meetingAtRaw := strings.TrimSpace(body.MeetingAt)
	if meetingAtRaw == "" {
		writeFieldError(w, http.StatusBadRequest, "meeting_at", "meeting_at is required")
		return
	}
	meetingAt, err := time.Parse(time.RFC3339, meetingAtRaw)
	if err != nil {
		meetingAt, err = time.Parse(time.RFC3339Nano, meetingAtRaw)
	}
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "meeting_at", "meeting_at must be an ISO-8601 timestamp")
		return
	}

	var videoURL *string
	if body.VideoURL != nil {
		v := strings.TrimSpace(*body.VideoURL)
		if v != "" {
			if len(v) > 1024 {
				writeFieldError(w, http.StatusBadRequest, "video_url", "video_url is too long")
				return
			}
			videoURL = &v
		}
	}

	created, err := h.app.Repo.CreateMeeting(r.Context(), repository.CreateMeetingInput{
		MeetingAt:       meetingAt.UTC(),
		Summary:         summary,
		VideoURL:        videoURL,
		CreatedByUserID: u.ID,
	})
	if err != nil {
		log.Error("create meeting", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"meeting": meetingToJSON(created)})
}

// PATCH /api/meetings/{id}/video
func (h *meetingsHTTP) attachMeetingVideo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !requireMeetingsAccess(w, u) || !requireWriteAccess(w, u) {
		return
	}

	id, err := strconv.Atoi(strings.TrimSpace(r.PathValue("id")))
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid meeting id")
		return
	}

	var body attachMeetingVideoBody
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	videoURL := strings.TrimSpace(body.VideoURL)
	if videoURL == "" {
		writeFieldError(w, http.StatusBadRequest, "video_url", "video_url is required")
		return
	}
	if len(videoURL) > 1024 {
		writeFieldError(w, http.StatusBadRequest, "video_url", "video_url is too long")
		return
	}

	updated, err := h.app.Repo.SetMeetingVideoURL(r.Context(), id, videoURL)
	if err != nil {
		if errors.Is(err, repository.ErrMeetingNotFound) {
			writeMessageError(w, http.StatusNotFound, "meeting not found")
			return
		}
		if errors.Is(err, repository.ErrMeetingVideoExists) {
			writeMessageError(w, http.StatusConflict, "meeting already has a video")
			return
		}
		log.Error("attach meeting video", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"meeting": meetingToJSON(updated)})
}
