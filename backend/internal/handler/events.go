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
	ID       int        `json:"id"`
	EventURL string     `json:"event_url"`
	Title    string     `json:"title"`
	ImageURL *string    `json:"image_url,omitempty"`
	DateText *string    `json:"date_text,omitempty"`
	Venue    *string    `json:"venue,omitempty"`
	DayCount int16      `json:"day_count"`
	CreatedAt time.Time `json:"created_at"`
}

type eventStreamJSON struct {
	ID           int        `json:"id"`
	EventID      int        `json:"event_id"`
	DayNumber    int16      `json:"day_number"`
	URL          string     `json:"url"`
	Label        *string    `json:"label,omitempty"`
	CoverageSlug string     `json:"coverage_slug"`
	YoutubeURL   *string    `json:"youtube_url,omitempty"`
	CreatedAt    time.Time  `json:"created_at"`
}

type eventStreamCommentJSON struct {
	ID            int       `json:"id"`
	EventStreamID int       `json:"event_stream_id"`
	UserID        int       `json:"user_id"`
	Comment       string    `json:"comment"`
	CreatedAt     time.Time `json:"created_at"`
	OwnerUsername *string   `json:"owner_username,omitempty"`
	OwnerEmail    string    `json:"owner_email,omitempty"`
}

func eventToJSON(e repository.Event) eventJSON {
	return eventJSON{
		ID: e.ID, EventURL: e.EventURL, Title: e.Title, ImageURL: e.ImageURL,
		DateText: e.DateText, Venue: e.Venue, DayCount: e.DayCount, CreatedAt: e.CreatedAt,
	}
}

func streamToJSON(s repository.EventStream) eventStreamJSON {
	return eventStreamJSON{
		ID: s.ID, EventID: s.EventID, DayNumber: s.DayNumber, URL: s.URL, Label: s.Label,
		CoverageSlug: s.CoverageSlug, YoutubeURL: s.YoutubeURL, CreatedAt: s.CreatedAt,
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

func parseStreamID(r *http.Request) (int, bool) {
	id, err := strconv.Atoi(strings.TrimSpace(r.PathValue("streamId")))
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
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
	streams, err := h.app.Repo.ListEventStreamsByEventID(r.Context(), eventID)
	if err != nil {
		log.Error("list event streams", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	streamJSON := make([]eventStreamJSON, 0, len(streams))
	for _, s := range streams {
		streamJSON = append(streamJSON, streamToJSON(s))
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"event":    eventToJSON(e),
		"streams":  streamJSON,
	})
}

func (h *eventsHTTP) adminListEvents(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}
	h.listEvents(w, r)
}

type createEventRequest struct {
	EventURL string  `json:"event_url"`
	DayCount int16   `json:"day_count"`
	PageHTML *string `json:"page_html,omitempty"`
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
	if body.DayCount < 1 || body.DayCount > 3 {
		http.Error(w, "day_count must be 1, 2, or 3", http.StatusBadRequest)
		return
	}

	var parsed scrape.EventPageData
	if body.PageHTML != nil && strings.TrimSpace(*body.PageHTML) != "" {
		parsed = scrape.EventPageDataFromHTML(strings.TrimSpace(*body.PageHTML))
		if len(parsed.CoverageLinks) == 0 {
			http.Error(w, "page_html did not contain coverage links", http.StatusBadRequest)
			return
		}
	} else {
		var err error
		parsed, err = h.scrape.FetchEventPageData(r.Context(), eventURL)
		if err != nil {
			log.Error("crawl event page", "url", eventURL, "error", err)
			http.Error(w, "failed to fetch event page: "+err.Error(), http.StatusBadGateway)
			return
		}
	}
	if int(body.DayCount) > len(parsed.CoverageLinks) {
		http.Error(w, "event page has fewer coverage days than requested", http.StatusBadRequest)
		return
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

	e, err := h.app.Repo.CreateEvent(r.Context(), repository.CreateEventParams{
		EventURL: eventURL,
		Title:    parsed.Title,
		ImageURL: imageURL,
		DateText: dateText,
		Venue:    venue,
		DayCount: body.DayCount,
	})
	if err != nil {
		log.Error("create event", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	streamOut := make([]eventStreamJSON, 0, body.DayCount)
	for i := int16(0); i < body.DayCount; i++ {
		link := parsed.CoverageLinks[i]
		var label *string
		if link.Label != "" {
			label = &link.Label
		}
		var yt *string
		if covHTML, err := h.scrape.FetchHTMLReferer(r.Context(), link.URL, eventURL); err == nil {
			if u := scrape.FindYouTubeWatchURL(covHTML); u != "" {
				yt = &u
			}
		}
		s, err := h.app.Repo.CreateEventStream(r.Context(), repository.CreateEventStreamParams{
			EventID:      e.ID,
			DayNumber:    i + 1,
			URL:          link.URL,
			Label:        label,
			CoverageSlug: link.Slug,
			YoutubeURL:   yt,
		})
		if err != nil {
			log.Error("create event stream", "error", err)
			http.Error(w, "internal server error", http.StatusInternalServerError)
			return
		}
		streamOut = append(streamOut, streamToJSON(s))
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"event":   eventToJSON(e),
		"streams": streamOut,
	})
}

func (h *eventsHTTP) loadStreamForEvent(w http.ResponseWriter, r *http.Request, eventID int) (repository.EventStream, bool) {
	streamIDStr := strings.TrimSpace(r.URL.Query().Get("stream_id"))
	streamID, err := strconv.Atoi(streamIDStr)
	if err != nil || streamID <= 0 {
		http.Error(w, "stream_id query param required", http.StatusBadRequest)
		return repository.EventStream{}, false
	}
	s, err := h.app.Repo.GetEventStreamByID(r.Context(), streamID)
	if err != nil {
		if errors.Is(err, repository.ErrEventStreamNotFound) {
			http.Error(w, "stream not found", http.StatusNotFound)
			return repository.EventStream{}, false
		}
		log.Error("get event stream", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return repository.EventStream{}, false
	}
	if s.EventID != eventID {
		http.Error(w, "stream not found", http.StatusNotFound)
		return repository.EventStream{}, false
	}
	return s, true
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
	s, ok := h.loadStreamForEvent(w, r, eventID)
	if !ok {
		return
	}
	htmlText, err := h.scrape.FetchHTMLReferer(r.Context(), s.URL, "https://fabtcg.com/")
	if err != nil {
		http.Error(w, "failed to fetch coverage page", http.StatusBadGateway)
		return
	}
	rounds := scrape.ParseCoverageRounds(htmlText, s.CoverageSlug)
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"rounds": rounds})
}

func parseRoundQuery(r *http.Request) (int, bool) {
	round, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("round")))
	if err != nil || round <= 0 {
		return 0, false
	}
	return round, true
}

func (h *eventsHTTP) getEventPairings(w http.ResponseWriter, r *http.Request) {
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
	s, ok := h.loadStreamForEvent(w, r, eventID)
	if !ok {
		return
	}
	url := scrape.PairingsPageURL(s.CoverageSlug, round)
	covReferer := scrape.CoveragePageURL(s.CoverageSlug)
	htmlText, err := h.scrape.FetchHTMLReferer(r.Context(), url, covReferer)
	if err != nil {
		http.Error(w, "failed to fetch pairings", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"round":    round,
		"pairings": scrape.ParsePairings(htmlText),
	})
}

func (h *eventsHTTP) getEventResults(w http.ResponseWriter, r *http.Request) {
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
	s, ok := h.loadStreamForEvent(w, r, eventID)
	if !ok {
		return
	}
	url := scrape.ResultsPageURL(s.CoverageSlug, round)
	covReferer := scrape.CoveragePageURL(s.CoverageSlug)
	htmlText, err := h.scrape.FetchHTMLReferer(r.Context(), url, covReferer)
	if err != nil {
		http.Error(w, "failed to fetch results", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"round":   round,
		"results": scrape.ParseResults(htmlText),
	})
}

func (h *eventsHTTP) getEventStandings(w http.ResponseWriter, r *http.Request) {
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
	s, ok := h.loadStreamForEvent(w, r, eventID)
	if !ok {
		return
	}
	url := scrape.StandingsPageURL(s.CoverageSlug, round)
	covReferer := scrape.CoveragePageURL(s.CoverageSlug)
	htmlText, err := h.scrape.FetchHTMLReferer(r.Context(), url, covReferer)
	if err != nil {
		http.Error(w, "failed to fetch standings", http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"round":      round,
		"standings": scrape.ParseStandings(htmlText),
	})
}

type teamMatchJSON struct {
	UserID       int    `json:"user_id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	StreamID     int    `json:"stream_id"`
	DayNumber    int16  `json:"day_number"`
	StreamLabel  string `json:"stream_label,omitempty"`
	Round        int    `json:"round"`
	Kind         string `json:"kind"`
	Detail       string `json:"detail"`
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
	users, err := h.app.Repo.ListUsersWithNames(r.Context())
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	streams, err := h.app.Repo.ListEventStreamsByEventID(r.Context(), eventID)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	matches := make([]teamMatchJSON, 0)
	for _, s := range streams {
		label := ""
		if s.Label != nil {
			label = *s.Label
		}
		covReferer := scrape.CoveragePageURL(s.CoverageSlug)
		covHTML, err := h.scrape.FetchHTMLReferer(r.Context(), s.URL, "https://fabtcg.com/")
		if err != nil {
			continue
		}
		rounds := scrape.ParseCoverageRounds(covHTML, s.CoverageSlug)
		latest := scrape.LatestRound(rounds)
		if latest <= 0 {
			continue
		}

		if stHTML, err := h.scrape.FetchHTMLReferer(r.Context(), scrape.StandingsPageURL(s.CoverageSlug, latest), covReferer); err == nil {
			for _, row := range scrape.ParseStandings(stHTML) {
				for _, u := range users {
					if scrape.NameMatches(u.FirstName, u.LastName, row.Player) {
						matches = append(matches, teamMatchJSON{
							UserID: u.ID, FirstName: u.FirstName, LastName: u.LastName,
							StreamID: s.ID, DayNumber: s.DayNumber, StreamLabel: label,
							Round: latest, Kind: "standing",
							Detail: "Rank " + strconv.Itoa(row.Rank) + " · " + row.Hero + " · " + strconv.Itoa(row.Wins) + " wins",
						})
					}
				}
			}
		}
		if pHTML, err := h.scrape.FetchHTMLReferer(r.Context(), scrape.PairingsPageURL(s.CoverageSlug, latest), covReferer); err == nil {
			for _, row := range scrape.ParsePairings(pHTML) {
				for _, u := range users {
					if scrape.NameMatches(u.FirstName, u.LastName, row.Player1) || scrape.NameMatches(u.FirstName, u.LastName, row.Player2) {
					 opp := row.Player2
					 hero := row.Hero1
					 if scrape.NameMatches(u.FirstName, u.LastName, row.Player2) {
						 opp = row.Player1
						 hero = row.Hero2
					 }
					 matches = append(matches, teamMatchJSON{
						 UserID: u.ID, FirstName: u.FirstName, LastName: u.LastName,
						 StreamID: s.ID, DayNumber: s.DayNumber, StreamLabel: label,
						 Round: latest, Kind: "pairing",
						 Detail: "Table " + strconv.Itoa(row.Table) + " vs " + opp + " · " + hero,
					 })
					}
				}
			}
		}
		if rHTML, err := h.scrape.FetchHTMLReferer(r.Context(), scrape.ResultsPageURL(s.CoverageSlug, latest), covReferer); err == nil {
			for _, row := range scrape.ParseResults(rHTML) {
				for _, u := range users {
					inMatch := scrape.NameMatches(u.FirstName, u.LastName, row.Player1) || scrape.NameMatches(u.FirstName, u.LastName, row.Player2)
					if !inMatch {
						continue
					}
					won := scrape.NameMatches(u.FirstName, u.LastName, row.WinnerName)
					result := "Loss"
					if won {
						result = "Win"
					} else if row.WinnerName == "" {
						result = row.WinnerSide
					}
					matches = append(matches, teamMatchJSON{
						UserID: u.ID, FirstName: u.FirstName, LastName: u.LastName,
						StreamID: s.ID, DayNumber: s.DayNumber, StreamLabel: label,
						Round: latest, Kind: "result",
						Detail: result + " · " + row.WinnerSide,
					})
				}
			}
		}
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"matches": matches})
}

func (h *eventsHTTP) refreshStreamYoutube(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	streamID, ok := parseStreamID(r)
	if !ok {
		http.Error(w, "invalid stream id", http.StatusBadRequest)
		return
	}
	s, err := h.app.Repo.GetEventStreamByID(r.Context(), streamID)
	if err != nil {
		if errors.Is(err, repository.ErrEventStreamNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	var yt *string
	if covHTML, err := h.scrape.FetchHTMLReferer(r.Context(), s.URL, "https://fabtcg.com/"); err == nil {
		if u := scrape.FindYouTubeWatchURL(covHTML); u != "" {
			yt = &u
		}
	}
	if yt == nil {
		if e, err := h.app.Repo.GetEventByID(r.Context(), s.EventID); err == nil {
			if evHTML, err := h.scrape.FetchHTMLReferer(r.Context(), e.EventURL, "https://fabtcg.com/"); err == nil {
				if u := scrape.FindYouTubeWatchURL(evHTML); u != "" {
					yt = &u
				}
			}
		}
	}
	updated, err := h.app.Repo.UpdateEventStreamYoutubeURL(r.Context(), streamID, yt)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"stream": streamToJSON(updated)})
}

func (h *eventsHTTP) listStreamComments(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireUser(w, r); !ok {
		return
	}
	streamID, ok := parseStreamID(r)
	if !ok {
		http.Error(w, "invalid stream id", http.StatusBadRequest)
		return
	}
	if _, err := h.app.Repo.GetEventStreamByID(r.Context(), streamID); err != nil {
		if errors.Is(err, repository.ErrEventStreamNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	rows, err := h.app.Repo.ListEventStreamComments(r.Context(), streamID)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	out := make([]eventStreamCommentJSON, 0, len(rows))
	for _, c := range rows {
		out = append(out, eventStreamCommentJSON{
			ID: c.ID, EventStreamID: c.EventStreamID, UserID: c.UserID, Comment: c.Comment,
			CreatedAt: c.CreatedAt, OwnerUsername: c.OwnerUsername, OwnerEmail: c.OwnerEmail,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{"comments": out})
}

type createStreamCommentRequest struct {
	Comment string `json:"comment"`
}

func (h *eventsHTTP) createStreamComment(w http.ResponseWriter, r *http.Request) {
	u, ok := h.requireUser(w, r)
	if !ok {
		return
	}
	streamID, ok := parseStreamID(r)
	if !ok {
		http.Error(w, "invalid stream id", http.StatusBadRequest)
		return
	}
	if _, err := h.app.Repo.GetEventStreamByID(r.Context(), streamID); err != nil {
		if errors.Is(err, repository.ErrEventStreamNotFound) {
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	var body createStreamCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	text := strings.TrimSpace(body.Comment)
	if text == "" {
		http.Error(w, "comment is required", http.StatusBadRequest)
		return
	}
	c, err := h.app.Repo.CreateEventStreamComment(r.Context(), streamID, u.ID, text)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"comment": eventStreamCommentJSON{
		ID: c.ID, EventStreamID: c.EventStreamID, UserID: c.UserID, Comment: c.Comment,
		CreatedAt: c.CreatedAt, OwnerUsername: c.OwnerUsername, OwnerEmail: c.OwnerEmail,
	}})
}
