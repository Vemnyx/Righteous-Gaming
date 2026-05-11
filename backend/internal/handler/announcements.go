package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/microcosm-cc/bluemonday"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const righteousAssetsPublicPrefix = "https://storage.googleapis.com/righteous-assets/"

// TipTap TextAlign persists style="text-align: …" on blocks; allow only that property.
var announcementTextAlignStylePattern = regexp.MustCompile(`(?is)^\s*text-align\s*:\s*(left|center|right|justify)\s*;?\s*$`)

// YouTube oEmbed thumbnail URLs (hqdefault etc.) saved as image_url when a video is linked.
var announcementYouTubeThumbPattern = regexp.MustCompile(
	`(?is)^https://i\.ytimg\.com/vi/[a-zA-Z0-9_-]{11}/(default|hqdefault|mqdefault|sddefault|maxresdefault)\.jpg$`,
)

var (
	reYouTuBePath = regexp.MustCompile(`(?i)youtu\.be/([a-zA-Z0-9_-]{11})(?:[?#&/]|$)`)
	reYouTubeV    = regexp.MustCompile(`(?i)[?&]v=([a-zA-Z0-9_-]{11})(?:[&#]|$)`)
	reYouTubeEmbed = regexp.MustCompile(`(?i)youtube\.com/embed/([a-zA-Z0-9_-]{11})(?:[?#&]|$)`)
	reYouTubeShorts = regexp.MustCompile(`(?i)youtube\.com/shorts/([a-zA-Z0-9_-]{11})(?:[?#&/]|$)`)
)

func extractYouTubeVideoID(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	if m := reYouTuBePath.FindStringSubmatch(raw); len(m) > 1 {
		return m[1]
	}
	if m := reYouTubeV.FindStringSubmatch(raw); len(m) > 1 {
		return m[1]
	}
	if m := reYouTubeEmbed.FindStringSubmatch(raw); len(m) > 1 {
		return m[1]
	}
	if m := reYouTubeShorts.FindStringSubmatch(raw); len(m) > 1 {
		return m[1]
	}
	return ""
}

type announcementHTTP struct {
	app *app.App
	svc *service.UserService
}

func sanitizeAnnouncementHTML(raw string) string {
	p := bluemonday.UGCPolicy()
	p.AllowAttrs("width", "height").OnElements("img")
	p.AllowAttrs("data-text-align").Matching(regexp.MustCompile(`^(left|center|right)$`)).OnElements("img")
	p.AllowAttrs("style").Matching(announcementTextAlignStylePattern).OnElements("p", "h2", "h3", "blockquote", "div")
	return p.Sanitize(strings.TrimSpace(raw))
}

func sanitizeImageURL(s *string) *string {
	if s == nil {
		return nil
	}
	u := strings.TrimSpace(*s)
	if u == "" {
		return nil
	}
	if strings.HasPrefix(u, righteousAssetsPublicPrefix) {
		return &u
	}
	if announcementYouTubeThumbPattern.MatchString(u) {
		return &u
	}
	return nil
}

func sanitizeYoutubeURL(s *string) *string {
	if s == nil {
		return nil
	}
	id := extractYouTubeVideoID(*s)
	if id == "" {
		return nil
	}
	out := "https://www.youtube.com/watch?v=" + id
	return &out
}

func (h *announcementHTTP) requireAdmin(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("announcement admin auth", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	if u.Role == nil || *u.Role != domain.RoleAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil, false
	}
	return u, true
}

type announcementSummaryJSON struct {
	ID          int        `json:"id"`
	Title       string     `json:"title"`
	ImageURL    *string    `json:"image_url,omitempty"`
	YoutubeURL  *string    `json:"youtube_url,omitempty"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at,omitempty"`
}

type announcementPublicJSON struct {
	ID          int        `json:"id"`
	Title       string     `json:"title"`
	ImageURL    *string    `json:"image_url,omitempty"`
	YoutubeURL  *string    `json:"youtube_url,omitempty"`
	BodyHTML    string     `json:"body_html"`
	PublishedAt *time.Time `json:"published_at,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func summaryToJSON(s repository.AnnouncementSummary) announcementSummaryJSON {
	return announcementSummaryJSON{
		ID:          s.ID,
		Title:       s.Title,
		ImageURL:    s.ImageURL,
		YoutubeURL:  s.YoutubeURL,
		PublishedAt: s.PublishedAt,
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
	}
}

func announcementToPublicJSON(a *repository.Announcement) announcementPublicJSON {
	if a == nil {
		return announcementPublicJSON{}
	}
	return announcementPublicJSON{
		ID:          a.ID,
		Title:       a.Title,
		ImageURL:    a.ImageURL,
		YoutubeURL:  a.YoutubeURL,
		BodyHTML:    a.BodyHTML,
		PublishedAt: a.PublishedAt,
		CreatedAt:   a.CreatedAt,
		UpdatedAt:   a.UpdatedAt,
	}
}

type createAnnouncementRequest struct {
	Title       string  `json:"title"`
	ImageURL    *string `json:"image_url"`
	YoutubeURL  *string `json:"youtube_url"`
	BodyHTML    string  `json:"body_html"`
	Published   bool    `json:"published"`
}

type updateAnnouncementRequest struct {
	Title       string  `json:"title"`
	ImageURL    *string `json:"image_url"`
	YoutubeURL  *string `json:"youtube_url"`
	BodyHTML    string  `json:"body_html"`
	Published   bool    `json:"published"`
}

func publishedAtForCreate(published bool) *time.Time {
	if !published {
		return nil
	}
	t := time.Now().UTC()
	return &t
}

func publishedAtForUpdate(inputPublished bool, existing *time.Time) *time.Time {
	if !inputPublished {
		return nil
	}
	if existing != nil {
		return existing
	}
	t := time.Now().UTC()
	return &t
}

// GET /api/announcements
func (h *announcementHTTP) listPublished(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.app.Repo.ListPublishedAnnouncements(r.Context())
	if err != nil {
		log.Error("list published announcements", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]announcementPublicJSON, 0, len(list))
	for i := range list {
		out = append(out, announcementToPublicJSON(&list[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"announcements": out})
}

// GET /api/admin/announcements
func (h *announcementHTTP) adminList(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	list, err := h.app.Repo.ListAllSummaries(r.Context())
	if err != nil {
		log.Error("admin list announcements", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]announcementSummaryJSON, 0, len(list))
	for i := range list {
		out = append(out, summaryToJSON(list[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"announcements": out})
}

// GET /api/admin/announcements/{id}
func (h *announcementHTTP) adminGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	id, ok := parseAnnouncementID(w, r.PathValue("id"))
	if !ok {
		return
	}
	a, err := h.app.Repo.AnnouncementByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrAnnouncementNotFound) {
			writeMessageError(w, http.StatusNotFound, "announcement not found")
			return
		}
		log.Error("admin get announcement", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, announcementToPublicJSON(a))
}

// POST /api/admin/announcements
func (h *announcementHTTP) adminCreate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxCatalogJSONBytes)
	var body createAnnouncementRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		writeFieldError(w, http.StatusBadRequest, "title", "required")
		return
	}
	html := sanitizeAnnouncementHTML(body.BodyHTML)
	img := sanitizeImageURL(body.ImageURL)
	yt := sanitizeYoutubeURL(body.YoutubeURL)
	in := repository.CreateAnnouncementInput{
		Title:       title,
		ImageURL:    img,
		YoutubeURL:  yt,
		BodyHTML:    html,
		PublishedAt: publishedAtForCreate(body.Published),
	}
	a, err := h.app.Repo.CreateAnnouncement(r.Context(), in)
	if err != nil {
		log.Error("create announcement", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, announcementToPublicJSON(a))
}

// PATCH /api/admin/announcements/{id}
func (h *announcementHTTP) adminUpdate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	id, ok := parseAnnouncementID(w, r.PathValue("id"))
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxCatalogJSONBytes)
	var body updateAnnouncementRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		writeFieldError(w, http.StatusBadRequest, "title", "required")
		return
	}
	existing, err := h.app.Repo.AnnouncementByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrAnnouncementNotFound) {
			writeMessageError(w, http.StatusNotFound, "announcement not found")
			return
		}
		log.Error("announcement update load", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	html := sanitizeAnnouncementHTML(body.BodyHTML)
	img := sanitizeImageURL(body.ImageURL)
	yt := sanitizeYoutubeURL(body.YoutubeURL)
	in := repository.UpdateAnnouncementInput{
		Title:       title,
		ImageURL:    img,
		YoutubeURL:  yt,
		BodyHTML:    html,
		PublishedAt: publishedAtForUpdate(body.Published, existing.PublishedAt),
	}
	a, err := h.app.Repo.UpdateAnnouncement(r.Context(), id, in)
	if err != nil {
		if errors.Is(err, repository.ErrAnnouncementNotFound) {
			writeMessageError(w, http.StatusNotFound, "announcement not found")
			return
		}
		log.Error("update announcement", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, announcementToPublicJSON(a))
}

// DELETE /api/admin/announcements/{id}
func (h *announcementHTTP) adminDelete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	id, ok := parseAnnouncementID(w, r.PathValue("id"))
	if !ok {
		return
	}
	if err := h.app.Repo.DeleteAnnouncement(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrAnnouncementNotFound) {
			writeMessageError(w, http.StatusNotFound, "announcement not found")
			return
		}
		log.Error("delete announcement", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func parseAnnouncementID(w http.ResponseWriter, raw string) (int, bool) {
	raw = strings.TrimSpace(raw)
	id, err := strconv.Atoi(raw)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid announcement id")
		return 0, false
	}
	return id, true
}
