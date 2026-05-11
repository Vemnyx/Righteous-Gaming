package handler

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type cardRatingsHTTP struct {
	app *app.App
	svc *service.UserService
}

type userCardRatingJSON struct {
	UserID int     `json:"user_id"`
	SetID  int     `json:"set_id"`
	CardID int     `json:"card_id"`
	Format int16   `json:"format"`
	Rating int16   `json:"rating"`
	Notes  *string `json:"notes,omitempty"`
}

func ratingToJSON(r repository.UserCardRating) userCardRatingJSON {
	return userCardRatingJSON{
		UserID: r.UserID,
		SetID:  r.SetID,
		CardID: r.CardID,
		Format: r.Format,
		Rating: r.Rating,
		Notes:  r.Notes,
	}
}

type userCardRatingDetailJSON struct {
	UserID int       `json:"user_id"`
	SetID  int       `json:"set_id"`
	CardID int       `json:"card_id"`
	Format int16     `json:"format"`
	Rating int16     `json:"rating"`
	Notes  *string   `json:"notes,omitempty"`
	Card   cardJSON  `json:"card"`
}

type saveUserCardRatingRequest struct {
	SetID  int     `json:"set_id"`
	CardID int     `json:"card_id"`
	Format int16   `json:"format"`
	Rating int16   `json:"rating"`
	Notes  *string `json:"notes,omitempty"`
}

func cardPlaysFormat(c *repository.Card, format int16) bool {
	if c == nil {
		return false
	}
	return slices.Contains(c.Formats, format)
}

// cardExcludedFromRatings is true for Basic rarity (domain.CardRarityBasic = 0). NULL rarity is allowed.
func cardExcludedFromRatings(c *repository.Card) bool {
	if c == nil {
		return true
	}
	if c.Rarity == nil {
		return false
	}
	return *c.Rarity == int16(domain.CardRarityBasic)
}

// cardExcludedFromLimitedRatings is true for Legendary or Fabled when format is Limited.
func cardExcludedFromLimitedRatings(c *repository.Card, format int16) bool {
	if format != int16(domain.CardFormatLimited) {
		return false
	}
	if c == nil || c.Rarity == nil {
		return false
	}
	r := *c.Rarity
	return r == int16(domain.CardRarityLegendary) || r == int16(domain.CardRarityFabled)
}

func (h *cardRatingsHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("card ratings session user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func parseSetIDFormatQuery(w http.ResponseWriter, r *http.Request) (setID int, format int16, ok bool) {
	setStr := strings.TrimSpace(r.URL.Query().Get("set_id"))
	if setStr == "" {
		writeFieldError(w, http.StatusBadRequest, "set_id", "required")
		return 0, 0, false
	}
	sid, err := strconv.Atoi(setStr)
	if err != nil || sid <= 0 {
		writeFieldError(w, http.StatusBadRequest, "set_id", "must be a positive integer")
		return 0, 0, false
	}
	fmtStr := strings.TrimSpace(r.URL.Query().Get("format"))
	if fmtStr == "" {
		writeFieldError(w, http.StatusBadRequest, "format", "required")
		return 0, 0, false
	}
	f64, err := strconv.ParseInt(fmtStr, 10, 16)
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "format", "must be a small integer")
		return 0, 0, false
	}
	f := int16(f64)
	if !domain.CardFormat(f).Valid() {
		writeFieldError(w, http.StatusBadRequest, "format", "unknown format")
		return 0, 0, false
	}
	return sid, f, true
}

func parseSetIDFormatCardQuery(w http.ResponseWriter, r *http.Request) (setID int, cardID int, format int16, ok bool) {
	setID, format, ok = parseSetIDFormatQuery(w, r)
	if !ok {
		return 0, 0, 0, false
	}
	cardStr := strings.TrimSpace(r.URL.Query().Get("card_id"))
	if cardStr == "" {
		writeFieldError(w, http.StatusBadRequest, "card_id", "required")
		return 0, 0, 0, false
	}
	cid, err := strconv.Atoi(cardStr)
	if err != nil || cid <= 0 {
		writeFieldError(w, http.StatusBadRequest, "card_id", "must be a positive integer")
		return 0, 0, 0, false
	}
	return setID, cid, format, true
}

type cardTeamRatingRowJSON struct {
	UserName string  `json:"user_name"`
	Rating   int16   `json:"rating"`
	Notes    *string `json:"notes,omitempty"`
}

type cardTeamRatingByCardJSON struct {
	CardID      int                  `json:"card_id"`
	AverageRating *float64           `json:"average_rating,omitempty"`
	Ratings       []cardTeamRatingRowJSON `json:"ratings"`
}

func teamRatingDisplayName(username *string, email string) string {
	if username != nil {
		s := strings.TrimSpace(*username)
		if s != "" {
			return s
		}
	}
	if s := strings.TrimSpace(email); s != "" {
		return s
	}
	return "User"
}

// GET /api/me/card-ratings?set_id=&format=
func (h *cardRatingsHTTP) listMyRatings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	setID, format, ok := parseSetIDFormatQuery(w, r)
	if !ok {
		return
	}
	exists, err := h.app.Repo.SetExists(r.Context(), setID)
	if err != nil {
		log.Error("card ratings set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}
	rows, err := h.app.Repo.ListUserCardRatingsWithCards(r.Context(), u.ID, setID, format)
	if err != nil {
		log.Error("list user card ratings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]userCardRatingDetailJSON, 0, len(rows))
	for i := range rows {
		row := rows[i]
		out = append(out, userCardRatingDetailJSON{
			UserID: row.UserID,
			SetID:  row.SetID,
			CardID: row.CardID,
			Format: row.Format,
			Rating: row.Rating,
			Notes:  row.Notes,
			Card:   cardToJSON(&row.Card),
		})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"ratings": out})
}

const maxRatingNotesBytes = 2048

// POST /api/me/card-ratings — new rating (1–5) or notes-only update (rating must match stored).
func (h *cardRatingsHTTP) saveMyRating(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body saveUserCardRatingRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.SetID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "set_id", "required")
		return
	}
	if body.CardID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "card_id", "required")
		return
	}
	if !domain.CardFormat(body.Format).Valid() {
		writeFieldError(w, http.StatusBadRequest, "format", "unknown format")
		return
	}
	if body.Rating < 1 || body.Rating > 5 {
		writeFieldError(w, http.StatusBadRequest, "rating", "must be between 1 and 5")
		return
	}
	if body.Notes != nil && len(*body.Notes) > maxRatingNotesBytes {
		writeFieldError(w, http.StatusBadRequest, "notes", "exceeds maximum length")
		return
	}

	exists, err := h.app.Repo.SetExists(r.Context(), body.SetID)
	if err != nil {
		log.Error("save rating set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}

	card, err := h.app.Repo.CardByID(r.Context(), body.CardID)
	if err != nil {
		if errors.Is(err, repository.ErrCardNotFound) {
			writeFieldError(w, http.StatusNotFound, "card_id", "card not found")
			return
		}
		log.Error("save rating card by id", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if card.SetID != body.SetID {
		writeFieldError(w, http.StatusBadRequest, "card_id", "card does not belong to this set")
		return
	}
	if !cardPlaysFormat(card, body.Format) {
		writeFieldError(w, http.StatusBadRequest, "format", "card is not legal in this format")
		return
	}
	if cardExcludedFromRatings(card) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "basic rarity cards cannot be ranked")
		return
	}
	if cardExcludedFromLimitedRatings(card, body.Format) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "legendary and fabled cards cannot be ranked in limited format")
		return
	}

	existing, err := h.app.Repo.GetUserCardRating(r.Context(), u.ID, body.SetID, body.CardID, body.Format)
	if err != nil && !errors.Is(err, repository.ErrUserCardRatingNotFound) {
		log.Error("save rating get", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if existing == nil {
		if err := h.app.Repo.InsertUserCardRating(r.Context(), u.ID, body.SetID, body.CardID, body.Format, body.Rating, body.Notes); err != nil {
			log.Error("save rating insert", "error", err)
			writeMessageError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		writeCatalogJSON(w, http.StatusCreated, map[string]any{"ok": true})
		return
	}

	if existing.Rating != body.Rating {
		writeFieldError(w, http.StatusBadRequest, "rating", "rating cannot be changed after submission")
		return
	}
	if err := h.app.Repo.UpdateUserCardRatingNotes(r.Context(), u.ID, body.SetID, body.CardID, body.Format, body.Notes); err != nil {
		if errors.Is(err, repository.ErrUserCardRatingNotFound) {
			writeFieldError(w, http.StatusNotFound, "card_id", "rating not found")
			return
		}
		log.Error("save rating update notes", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/me/cards-to-rate?set_id=&format=
func (h *cardRatingsHTTP) listMyCardsToRate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	setID, format, ok := parseSetIDFormatQuery(w, r)
	if !ok {
		return
	}
	exists, err := h.app.Repo.SetExists(r.Context(), setID)
	if err != nil {
		log.Error("cards to rank set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}
	cards, err := h.app.Repo.ListUnrankedCardsForUserSetFormat(r.Context(), u.ID, setID, format)
	if err != nil {
		log.Error("list unranked cards", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]cardJSON, 0, len(cards))
	for i := range cards {
		out = append(out, cardToJSON(&cards[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"cards": out})
}

// GET /api/me/card-team-ratings?set_id=&format=&card_id=
func (h *cardRatingsHTTP) listCardTeamRatings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	setID, cardID, format, ok := parseSetIDFormatCardQuery(w, r)
	if !ok {
		return
	}
	exists, err := h.app.Repo.SetExists(r.Context(), setID)
	if err != nil {
	log.Error("card team ratings set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}
	card, err := h.app.Repo.CardByID(r.Context(), cardID)
	if err != nil {
		if errors.Is(err, repository.ErrCardNotFound) {
			writeFieldError(w, http.StatusNotFound, "card_id", "card not found")
			return
		}
		log.Error("card team ratings card by id", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if card.SetID != setID {
		writeFieldError(w, http.StatusBadRequest, "card_id", "card does not belong to this set")
		return
	}
	if !cardPlaysFormat(card, format) {
		writeFieldError(w, http.StatusBadRequest, "format", "card is not legal in this format")
		return
	}
	rows, avgPtr, err := h.app.Repo.ListCardTeamRatings(r.Context(), setID, cardID, format)
	if err != nil {
		log.Error("list card team ratings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]cardTeamRatingRowJSON, 0, len(rows))
	for i := range rows {
		row := rows[i]
		if row.UserID == u.ID {
			continue
		}
		out = append(out, cardTeamRatingRowJSON{
			UserName: teamRatingDisplayName(row.Username, row.Email),
			Rating:   row.Rating,
			Notes:    row.Notes,
		})
	}
	payload := map[string]any{"ratings": out}
	if avgPtr != nil {
		payload["average_rating"] = math.Round(*avgPtr*100) / 100
	}
	writeCatalogJSON(w, http.StatusOK, payload)
}

// GET /api/me/card-team-ratings-batch?set_id=&format=
func (h *cardRatingsHTTP) listCardTeamRatingsBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	setID, format, ok := parseSetIDFormatQuery(w, r)
	if !ok {
		return
	}
	exists, err := h.app.Repo.SetExists(r.Context(), setID)
	if err != nil {
		log.Error("card team ratings batch set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}
	rows, err := h.app.Repo.ListCardTeamRatingsForSetFormat(r.Context(), setID, format)
	if err != nil {
		log.Error("list card team ratings batch", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	type agg struct {
		sum   float64
		count int
		rows  []cardTeamRatingRowJSON
	}
	byCard := make(map[int]*agg, 64)
	for i := range rows {
		row := rows[i]
		a, ok := byCard[row.CardID]
		if !ok {
			a = &agg{rows: make([]cardTeamRatingRowJSON, 0, 8)}
			byCard[row.CardID] = a
		}
		a.sum += float64(row.Rating)
		a.count++
		if row.UserID == u.ID {
			continue
		}
		a.rows = append(a.rows, cardTeamRatingRowJSON{
			UserName: teamRatingDisplayName(row.Username, row.Email),
			Rating:   row.Rating,
			Notes:    row.Notes,
		})
	}

	out := make([]cardTeamRatingByCardJSON, 0, len(byCard))
	for cardID, a := range byCard {
		var avg *float64
		if a.count > 0 {
			v := math.Round((a.sum/float64(a.count))*100) / 100
			avg = &v
		}
		out = append(out, cardTeamRatingByCardJSON{
			CardID:      cardID,
			AverageRating: avg,
			Ratings:       a.rows,
		})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"cards": out})
}
