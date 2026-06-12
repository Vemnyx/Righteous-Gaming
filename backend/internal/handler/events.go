package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	evt "righteous-gaming/backend/internal/events"
	"righteous-gaming/backend/internal/eventmeta"
	"righteous-gaming/backend/internal/eventplayer"
	"righteous-gaming/backend/internal/eventsync"
	"righteous-gaming/backend/internal/eventusers"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/scrape"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type eventsHTTP struct {
	app    *app.App
	svc    *service.UserService
	scrape *scrape.Client
}

type eventJSON struct {
	ID        int        `json:"id"`
	EventURL  string     `json:"event_url"`
	Title     string     `json:"title"`
	ImageURL  *string    `json:"image_url,omitempty"`
	DateText  *string    `json:"date_text,omitempty"`
	Venue     *string    `json:"venue,omitempty"`
	StartDate *time.Time `json:"start_date,omitempty"`
	EndDate   *time.Time `json:"end_date,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
}

type eventDataJSON struct {
	ID            int       `json:"id"`
	EventID       int       `json:"event_id"`
	EventType     int16     `json:"event_type"`
	EventTypeName string    `json:"event_type_name"`
	StartDate     time.Time `json:"start_date"`
	EndDate       time.Time `json:"end_date"`
	CoverageSlug  string    `json:"coverage_slug"`
	CoverageURL   string    `json:"coverage_url"`
	Label         *string   `json:"label,omitempty"`
	Format        *int16    `json:"format,omitempty"`
	FormatName    *string   `json:"format_name,omitempty"`
	StreamURLs    []string  `json:"stream_urls"`
	StreamTabs    []string  `json:"stream_tabs"`
	CreatedAt     time.Time `json:"created_at"`
}

type eventRoundJSON struct {
	ID          int             `json:"id"`
	EventDataID int             `json:"event_data_id"`
	RoundNumber int             `json:"round_number"`
	RoundLabel  *string         `json:"round_label,omitempty"`
	Pairings    json.RawMessage `json:"pairings"`
	Results     json.RawMessage `json:"results"`
	Standings   json.RawMessage `json:"standings"`
	SyncedAt    time.Time       `json:"synced_at"`
}

type eventDataCommentJSON struct {
	ID            int       `json:"id"`
	EventDataID   int       `json:"event_data_id"`
	UserID        int       `json:"user_id"`
	Comment       string    `json:"comment"`
	CreatedAt     time.Time `json:"created_at"`
	OwnerUsername *string   `json:"owner_username,omitempty"`
	OwnerEmail    string    `json:"owner_email,omitempty"`
}

func eventToJSON(e repository.Event) eventJSON {
	return eventJSON{
		ID: e.ID, EventURL: e.EventURL, Title: e.Title, ImageURL: e.ImageURL,
		DateText: e.DateText, Venue: e.Venue, StartDate: e.StartDate, EndDate: e.EndDate, CreatedAt: e.CreatedAt,
	}
}

func eventDataToJSON(ed repository.EventData) eventDataJSON {
	t := domain.EventType(ed.EventType)
	tabs := t.StreamTabLabels()
	urls := ed.StreamURLs
	if len(urls) < len(tabs) {
		padded := make([]string, len(tabs))
		copy(padded, urls)
		urls = padded
	}
	var formatName *string
	if ed.Format != nil {
		name := domain.CardFormat(*ed.Format).String()
		formatName = &name
	}
	return eventDataJSON{
		ID: ed.ID, EventID: ed.EventID, EventType: ed.EventType, EventTypeName: t.String(),
		StartDate: ed.StartDate, EndDate: ed.EndDate, CoverageSlug: ed.CoverageSlug, CoverageURL: ed.CoverageURL,
		Label: ed.Label, Format: ed.Format, FormatName: formatName,
		StreamURLs: urls, StreamTabs: tabs, CreatedAt: ed.CreatedAt,
	}
}

func roundToJSON(r repository.EventRound) eventRoundJSON {
	return eventRoundJSON{
		ID: r.ID, EventDataID: r.EventDataID, RoundNumber: r.RoundNumber, RoundLabel: r.RoundLabel,
		Pairings: r.Pairings, Results: r.Results, Standings: r.Standings, SyncedAt: r.SyncedAt,
	}
}

func (h *eventsHTTP) requireUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	u, err := h.svc.UserForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return nil, false
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return nil, false
		}
		log.Error("events auth", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func (h *eventsHTTP) requireAdmin(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	u, ok := h.requireUser(w, r)
	if !ok {
		return nil, false
	}
	if u.Role == nil || *u.Role != domain.RoleAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil, false
	}
	return u, true
}

func parseEventID(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(strings.TrimSpace(r.PathValue("id")))
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func parseEventDataID(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(strings.TrimSpace(r.PathValue("dataId")))
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func parseEventDataQuery(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("event_data_id")))
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func (h *eventsHTTP) loadEventDataForEvent(w http.ResponseWriter, r *http.Request, eventID int) (repository.EventData, bool) {
	dataID, ok := parseEventDataQuery(r)
	if !ok {
		http.Error(w, "event_data_id query param required", http.StatusBadRequest)
		return repository.EventData{}, false
	}
	ed, err := h.app.Repo.GetEventDataByID(r.Context(), dataID)
	if err != nil {
		if errors.Is(err, repository.ErrEventDataNotFound) {
			http.Error(w, "event data not found", http.StatusNotFound)
			return repository.EventData{}, false
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return repository.EventData{}, false
	}
	if ed.EventID != eventID {
		http.Error(w, "event data not found", http.StatusNotFound)
		return repository.EventData{}, false
	}
	return ed, true
}

func (h *eventsHTTP) listEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	rows, err := h.app.Repo.ListEvents(r.Context())
	if err != nil {
		log.Error("list events", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]eventJSON, 0, len(rows))
	for _, e := range rows {
		out = append(out, eventToJSON(e))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"events": out})
}

func (h *eventsHTTP) getEvent(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	e, err := h.app.Repo.GetEventByID(r.Context(), eventID)
	if err != nil {
		if errors.Is(err, repository.ErrEventNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		log.Error("get event", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	dataRows, err := h.app.Repo.ListEventDataByEventID(r.Context(), eventID)
	if err != nil {
		log.Error("list event data", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	dataJSON := make([]eventDataJSON, 0, len(dataRows))
	for _, ed := range dataRows {
		dataJSON = append(dataJSON, eventDataToJSON(ed))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"event":       eventToJSON(e),
		"event_data":  dataJSON,
	})
}

func (h *eventsHTTP) adminListEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	h.listEvents(w, r)
}

type createEventRequest struct {
	EventURL string `json:"event_url"`
}

func (h *eventsHTTP) adminCreateEvent(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	var body createEventRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	eventURL := strings.TrimSpace(body.EventURL)
	if eventURL == "" {
		http.Error(w, "event_url is required", http.StatusBadRequest)
		return
	}

	parsed, err := h.scrape.FetchEventPageData(r.Context(), eventURL)
	if err != nil {
		log.Error("crawl event page", "url", eventURL, "error", err)
		http.Error(w, "failed to fetch event page: "+err.Error(), http.StatusBadGateway)
		return
	}

	title := strings.TrimSpace(parsed.Title)
	if title == "" {
		title = "Upcoming event"
	}

	var imageURL *string
	if parsed.ImageURL != "" {
		imageURL = &parsed.ImageURL
	}
	var dateText *string
	if parsed.DateText != "" {
		dateText = &parsed.DateText
	}
	var venue *string
	if parsed.Venue != "" {
		venue = &parsed.Venue
	}
	var startDate, endDate *time.Time
	if dateText != nil {
		if s, e, ok := evt.ParseDateRange(*dateText); ok {
			startDate = &s
			endDate = &e
		}
	}

	e, err := h.app.Repo.CreateEvent(r.Context(), repository.CreateEventParams{
		EventURL: eventURL, Title: title, ImageURL: imageURL,
		DateText: dateText, Venue: venue, StartDate: startDate, EndDate: endDate,
	})
	if err != nil {
		log.Error("create event", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	createdData, err := eventsync.CreateMissingEventData(r.Context(), h.app.Repo, e, parsed)
	if err != nil {
		log.Error("create event data", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	dataOut := make([]eventDataJSON, 0, len(createdData))
	for _, ed := range createdData {
		dataOut = append(dataOut, eventDataToJSON(ed))
	}

	if len(createdData) > 0 {
		syncCtx, cancel := context.WithTimeout(r.Context(), eventsync.CreateSyncTimeout)
		defer cancel()
		if err := eventsync.SyncEvent(syncCtx, h.app.Repo, h.scrape, e.ID); err != nil {
			log.Error("event create sync", "event_id", e.ID, "error", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"event":      eventToJSON(e),
		"event_data": dataOut,
	})
}

func (h *eventsHTTP) adminDeleteEvent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	if err := h.app.Repo.DeleteEvent(r.Context(), eventID); err != nil {
		if errors.Is(err, repository.ErrEventNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		log.Error("delete event", "event_id", eventID, "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *eventsHTTP) getEventRounds(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	if _, err := h.app.Repo.GetEventByID(r.Context(), eventID); err != nil {
		if errors.Is(err, repository.ErrEventNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	ed, ok := h.loadEventDataForEvent(w, r, eventID)
	if !ok {
		return
	}
	rounds, err := h.app.Repo.ListEventRoundsByEventDataID(r.Context(), ed.ID)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]eventRoundJSON, 0, len(rounds))
	for _, rr := range rounds {
		out = append(out, roundToJSON(rr))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"rounds": out})
}

func parseRoundQuery(r *http.Request) (int, bool) {
	round, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("round")))
	if err != nil || round <= 0 {
		return 0, false
	}
	return round, true
}

func (h *eventsHTTP) getEventRoundData(w http.ResponseWriter, r *http.Request, field string) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	round, ok := parseRoundQuery(r)
	if !ok {
		http.Error(w, "round query param required", http.StatusBadRequest)
		return
	}
	ed, ok := h.loadEventDataForEvent(w, r, eventID)
	if !ok {
		return
	}
	rr, err := h.app.Repo.GetEventRound(r.Context(), ed.ID, round)
	if err != nil {
		if errors.Is(err, repository.ErrEventRoundNotFound) {
			http.Error(w, "round not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	payload := map[string]any{"round": round}
	switch field {
	case "pairings":
		payload["pairings"] = rr.Pairings
	case "results":
		payload["results"] = filterStoredResults(rr.Results)
	case "standings":
		payload["standings"] = rr.Standings
	}
	_ = json.NewEncoder(w).Encode(payload)
}

func filterStoredResults(raw json.RawMessage) json.RawMessage {
	if len(raw) == 0 {
		return raw
	}
	var rows []scrape.ResultRow
	if err := json.Unmarshal(raw, &rows); err != nil {
		return raw
	}
	filtered := scrape.FilterResultRows(rows)
	if len(filtered) == len(rows) {
		return raw
	}
	out, err := json.Marshal(filtered)
	if err != nil {
		return raw
	}
	return out
}

func (h *eventsHTTP) getEventPairings(w http.ResponseWriter, r *http.Request) {
	h.getEventRoundData(w, r, "pairings")
}

func (h *eventsHTTP) getEventResults(w http.ResponseWriter, r *http.Request) {
	h.getEventRoundData(w, r, "results")
}

func (h *eventsHTTP) getEventStandings(w http.ResponseWriter, r *http.Request) {
	h.getEventRoundData(w, r, "standings")
}

func parseFromRoundQuery(r *http.Request, defaultFrom, throughRound int) int {
	raw := strings.TrimSpace(r.URL.Query().Get("from_round"))
	if raw == "" {
		return defaultFrom
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return defaultFrom
	}
	if throughRound > 0 && n > throughRound {
		return throughRound
	}
	return n
}

func parseThroughRoundQuery(r *http.Request, maxRound int) int {
	raw := strings.TrimSpace(r.URL.Query().Get("through_round"))
	if raw == "" {
		return maxRound
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n <= 0 {
		return maxRound
	}
	if maxRound > 0 && n > maxRound {
		return maxRound
	}
	return n
}

func (h *eventsHTTP) getEventMeta(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	ed, ok := h.loadEventDataForEvent(w, r, eventID)
	if !ok {
		return
	}

	ctx := r.Context()
	rounds, err := h.app.Repo.ListEventRoundsByEventDataID(ctx, ed.ID)
	if err != nil {
		log.Error("event meta list rounds", "event_data_id", ed.ID, "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	maxRound := 0
	for _, rr := range rounds {
		if rr.RoundNumber > maxRound {
			maxRound = rr.RoundNumber
		}
	}
	throughRound := parseThroughRoundQuery(r, maxRound)
	fromRound := parseFromRoundQuery(r, 1, throughRound)

	heroRows, err := h.app.Repo.ListHeroesForMatch(ctx)
	if err != nil {
		log.Error("event meta heroes for match", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	nationals := domain.EventType(ed.EventType) == domain.EventTypeNationals
	sharePhase := eventmeta.ParseMetaSharePhase(r.URL.Query().Get("meta_share_phase"))
	if !nationals {
		sharePhase = ""
	}

	var shareFormat, matchupFormat *int16
	if nationals {
		shareFormat = eventmeta.MetaShareHeroFormat(sharePhase, fromRound)
		matchupFormat = eventmeta.NationalsHeroFormatForRound(throughRound)
	} else {
		shareFormat = ed.Format
		matchupFormat = ed.Format
	}
	shareMatcher := eventusers.NewHeroMatcher(heroRows, shareFormat)
	matchupMatcher := eventusers.NewHeroMatcher(heroRows, matchupFormat)

	displayRows, err := h.app.Repo.ListHeroDisplayRows(ctx)
	if err != nil {
		log.Error("event meta hero display", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	catalog := make(map[int]eventmeta.HeroCatalog, len(displayRows))
	for _, row := range displayRows {
		catalog[row.ID] = eventmeta.HeroCatalog{Name: row.Name, ArtImageURL: row.ArtImageURL, CardImageURL: row.CardImageURL}
	}

	snap := eventmeta.Build(rounds, fromRound, throughRound, sharePhase, nationals, catalog, shareMatcher, matchupMatcher)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(snap)
}

func (h *eventsHTTP) getEventPlayerHistory(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	ed, ok := h.loadEventDataForEvent(w, r, eventID)
	if !ok {
		return
	}
	player := strings.TrimSpace(r.URL.Query().Get("player"))
	if player == "" {
		http.Error(w, "player query param required", http.StatusBadRequest)
		return
	}

	rounds, err := h.app.Repo.ListEventRoundsByEventDataID(r.Context(), ed.ID)
	if err != nil {
		log.Error("event player history list rounds", "event_data_id", ed.ID, "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	hist := eventplayer.BuildHistory(rounds, player)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(hist)
}

type teamMatchJSON struct {
	UserID          int     `json:"user_id"`
	FirstName       string  `json:"first_name"`
	LastName        string  `json:"last_name"`
	EventDataID     int     `json:"event_data_id"`
	EventTypeName   string  `json:"event_type_name"`
	StreamLabel     string  `json:"stream_label,omitempty"`
	Round           int     `json:"round"`
	Kind            string  `json:"kind"`
	Detail          string  `json:"detail"`
	Payload         json.RawMessage `json:"payload,omitempty"`
	HeroID                  *int    `json:"hero_id,omitempty"`
	HeroName                *string `json:"hero_name,omitempty"`
	HeroArtImageURL         *string `json:"hero_art_image_url,omitempty"`
	OpponentHeroID          *int    `json:"opponent_hero_id,omitempty"`
	OpponentHeroName        *string `json:"opponent_hero_name,omitempty"`
	OpponentHeroArtImageURL *string `json:"opponent_hero_art_image_url,omitempty"`
}

func (h *eventsHTTP) getEventTeamSummary(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	eventID, ok := parseEventID(r)
	if !ok {
		http.Error(w, "invalid event id", http.StatusBadRequest)
		return
	}
	if _, err := h.app.Repo.GetEventByID(r.Context(), eventID); err != nil {
		if errors.Is(err, repository.ErrEventNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	rows, err := h.app.Repo.ListEventDataUsersByEventID(r.Context(), eventID)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	matches := make([]teamMatchJSON, 0, len(rows))
	for _, row := range rows {
		label := ""
		if row.StreamLabel != nil {
			label = *row.StreamLabel
		}
		matches = append(matches, teamMatchJSON{
			UserID: row.UserID, FirstName: row.FirstName, LastName: row.LastName,
			EventDataID: row.EventDataID, EventTypeName: domain.EventType(row.EventType).String(),
			StreamLabel: label, Round: row.RoundNumber, Kind: row.Kind,
			Detail: eventusers.FormatDetail(row.Kind, row.Payload),
			Payload: row.Payload,
			HeroID: row.HeroID, HeroName: row.HeroName, HeroArtImageURL: row.HeroArtImageURL,
			OpponentHeroID: row.OpponentHeroID, OpponentHeroName: row.OpponentHeroName,
			OpponentHeroArtImageURL: row.OpponentHeroArtImageURL,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"matches": matches})
}

type updateStreamURLsRequest struct {
	StreamURLs []string `json:"stream_urls"`
}

func (h *eventsHTTP) updateEventDataStreamURLs(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	if !requireWriteAccess(w, u) {
		return
	}
	dataID, ok := parseEventDataID(r)
	if !ok {
		http.Error(w, "invalid event data id", http.StatusBadRequest)
		return
	}
	ed, err := h.app.Repo.GetEventDataByID(r.Context(), dataID)
	if err != nil {
		if errors.Is(err, repository.ErrEventDataNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	var body updateStreamURLsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	tabs := domain.EventType(ed.EventType).StreamTabLabels()
	urls := make([]string, len(tabs))
	for i := range tabs {
		if i < len(body.StreamURLs) {
			urls[i] = strings.TrimSpace(body.StreamURLs[i])
		}
	}
	updated, err := h.app.Repo.UpdateEventDataStreamURLs(r.Context(), dataID, urls)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"event_data": eventDataToJSON(updated)})
}

func (h *eventsHTTP) listEventDataComments(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	dataID, ok := parseEventDataID(r)
	if !ok {
		http.Error(w, "invalid event data id", http.StatusBadRequest)
		return
	}
	if _, err := h.app.Repo.GetEventDataByID(r.Context(), dataID); err != nil {
		if errors.Is(err, repository.ErrEventDataNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	rows, err := h.app.Repo.ListEventDataComments(r.Context(), dataID)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]eventDataCommentJSON, 0, len(rows))
	for _, c := range rows {
		out = append(out, eventDataCommentJSON{
			ID: c.ID, EventDataID: c.EventDataID, UserID: c.UserID, Comment: c.Comment,
			CreatedAt: c.CreatedAt, OwnerUsername: c.OwnerUsername, OwnerEmail: c.OwnerEmail,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"comments": out})
}

type createEventDataCommentRequest struct {
	Comment string `json:"comment"`
}

func (h *eventsHTTP) createEventDataComment(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	if !requireWriteAccess(w, u) {
		return
	}
	dataID, ok := parseEventDataID(r)
	if !ok {
		http.Error(w, "invalid event data id", http.StatusBadRequest)
		return
	}
	if _, err := h.app.Repo.GetEventDataByID(r.Context(), dataID); err != nil {
		if errors.Is(err, repository.ErrEventDataNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	var body createEventDataCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	text := strings.TrimSpace(body.Comment)
	if text == "" {
		http.Error(w, "comment is required", http.StatusBadRequest)
		return
	}
	c, err := h.app.Repo.CreateEventDataComment(r.Context(), dataID, u.ID, text)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"comment": eventDataCommentJSON{
		ID: c.ID, EventDataID: c.EventDataID, UserID: c.UserID, Comment: c.Comment,
		CreatedAt: c.CreatedAt, OwnerUsername: c.OwnerUsername, OwnerEmail: c.OwnerEmail,
	}})
}
