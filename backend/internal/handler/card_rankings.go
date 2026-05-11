package handler

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

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

type userCardRatingDetailJSON struct {
	UserID  int      `json:"user_id"`
	RaterID int      `json:"rater_id"`
	CardID  int      `json:"card_id"`
	Rating  int16    `json:"rating"`
	Notes   *string  `json:"notes,omitempty"`
	Card    cardJSON `json:"card"`
}

type saveUserCardRatingRequest struct {
	RaterID int     `json:"rater_id"`
	CardID  int     `json:"card_id"`
	Rating  int16   `json:"rating"`
	Notes   *string `json:"notes,omitempty"`
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

func parseRaterIDQuery(w http.ResponseWriter, r *http.Request) (raterID int, ok bool) {
	s := strings.TrimSpace(r.URL.Query().Get("rater_id"))
	if s == "" {
		writeFieldError(w, http.StatusBadRequest, "rater_id", "required")
		return 0, false
	}
	id, err := strconv.Atoi(s)
	if err != nil || id <= 0 {
		writeFieldError(w, http.StatusBadRequest, "rater_id", "must be a positive integer")
		return 0, false
	}
	return id, true
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

// GET /api/me/card-ratings?rater_id=
func (h *cardRatingsHTTP) listMyRatings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	raterID, ok := parseRaterIDQuery(w, r)
	if !ok {
		return
	}
	if _, err := h.app.Repo.GetCardRater(r.Context(), raterID); err != nil {
		if errors.Is(err, repository.ErrCardRaterNotFound) {
			writeFieldError(w, http.StatusNotFound, "rater_id", "rater not found")
			return
		}
		log.Error("card ratings get rater", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	rows, err := h.app.Repo.ListUserCardRatingsWithCards(r.Context(), u.ID, raterID)
	if err != nil {
		log.Error("list user card ratings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]userCardRatingDetailJSON, 0, len(rows))
	for i := range rows {
		row := rows[i]
		out = append(out, userCardRatingDetailJSON{
			UserID:  row.UserID,
			RaterID: row.RaterID,
			CardID:  row.CardID,
			Rating:  row.Rating,
			Notes:   row.Notes,
			Card:    cardToJSON(&row.Card),
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
	if body.RaterID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "rater_id", "required")
		return
	}
	if body.CardID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "card_id", "required")
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

	cr, err := h.app.Repo.GetCardRater(r.Context(), body.RaterID)
	if err != nil {
		if errors.Is(err, repository.ErrCardRaterNotFound) {
			writeFieldError(w, http.StatusNotFound, "rater_id", "rater not found")
			return
		}
		log.Error("save rating get rater", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !domain.CardFormat(cr.Format).Valid() {
		writeFieldError(w, http.StatusBadRequest, "rater_id", "rater has unknown format")
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
	if card.SetID != cr.SetID {
		writeFieldError(w, http.StatusBadRequest, "card_id", "card does not belong to this rater's set")
		return
	}
	if !cardPlaysFormat(card, cr.Format) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "card is not legal in this rater's format")
		return
	}
	if cardExcludedFromRatings(card) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "basic rarity cards cannot be ranked")
		return
	}
	if cardExcludedFromLimitedRatings(card, cr.Format) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "legendary and fabled cards cannot be ranked in limited format")
		return
	}

	existing, err := h.app.Repo.GetUserCardRating(r.Context(), u.ID, body.RaterID, body.CardID)
	if err != nil && !errors.Is(err, repository.ErrUserCardRatingNotFound) {
		log.Error("save rating get", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if existing == nil {
		if cr.CompletedAt != nil {
			writeFieldError(w, http.StatusBadRequest, "rater_id", "cannot add ratings to a completed rater session")
			return
		}
		if err := h.app.Repo.InsertUserCardRating(r.Context(), u.ID, body.RaterID, body.CardID, body.Rating, body.Notes); err != nil {
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
	if err := h.app.Repo.UpdateUserCardRatingNotes(r.Context(), u.ID, body.RaterID, body.CardID, body.Notes); err != nil {
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

// GET /api/me/cards-to-rate?rater_id=
func (h *cardRatingsHTTP) listMyCardsToRate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	raterID, ok := parseRaterIDQuery(w, r)
	if !ok {
		return
	}
	if _, err := h.app.Repo.GetCardRater(r.Context(), raterID); err != nil {
		if errors.Is(err, repository.ErrCardRaterNotFound) {
			writeFieldError(w, http.StatusNotFound, "rater_id", "rater not found")
			return
		}
		log.Error("cards to rank get rater", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	cards, err := h.app.Repo.ListUnrankedCardsForUserRater(r.Context(), u.ID, raterID)
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
			CardID:        cardID,
			AverageRating: avg,
			Ratings:       a.rows,
		})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"cards": out})
}

type cardRaterJSON struct {
	ID          int        `json:"id"`
	SetID       int        `json:"set_id"`
	Format      int16      `json:"format"`
	Label       *string    `json:"label,omitempty"`
	StartedAt   time.Time  `json:"started_at"`
	CompletedAt *time.Time `json:"completed_at,omitempty"`
}

func cardRaterToJSON(cr repository.CardRater) cardRaterJSON {
	return cardRaterJSON{
		ID:          cr.ID,
		SetID:       cr.SetID,
		Format:      cr.Format,
		Label:       cr.Label,
		StartedAt:   cr.StartedAt,
		CompletedAt: cr.CompletedAt,
	}
}

type createCardRaterRequest struct {
	SetID  int     `json:"set_id"`
	Format int16   `json:"format"`
	Label  *string `json:"label,omitempty"`
}

const maxCardRaterLabelRunes = 512

// GET /api/card-raters?active=true
func (h *cardRatingsHTTP) listCardRaters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}
	activeOnly := strings.TrimSpace(r.URL.Query().Get("active")) == "true"
	rows, err := h.app.Repo.ListCardRaters(r.Context(), activeOnly)
	if err != nil {
		log.Error("list card raters", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]cardRaterJSON, 0, len(rows))
	for i := range rows {
		out = append(out, cardRaterToJSON(rows[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"raters": out})
}

// POST /api/card-raters
func (h *cardRatingsHTTP) createCardRater(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body createCardRaterRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.SetID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "set_id", "required")
		return
	}
	if !domain.CardFormat(body.Format).Valid() {
		writeFieldError(w, http.StatusBadRequest, "format", "unknown format")
		return
	}
	var labelPtr *string
	if body.Label != nil {
		t := strings.TrimSpace(*body.Label)
		if len([]rune(t)) > maxCardRaterLabelRunes {
			writeFieldError(w, http.StatusBadRequest, "label", "exceeds maximum length")
			return
		}
		if t != "" {
			labelPtr = &t
		}
	}
	exists, err := h.app.Repo.SetExists(r.Context(), body.SetID)
	if err != nil {
		log.Error("create card rater set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}
	cr, err := h.app.Repo.InsertCardRater(r.Context(), body.SetID, body.Format, labelPtr)
	if err != nil {
		if errors.Is(err, repository.ErrActiveCardRaterExists) {
			writeMessageError(w, http.StatusConflict, "an active card rater already exists")
			return
		}
		log.Error("insert card rater", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, map[string]any{"rater": cardRaterToJSON(*cr)})
}

// PATCH /api/card-raters/active/complete
func (h *cardRatingsHTTP) completeActiveCardRater(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}
	updated, err := h.app.Repo.CompleteActiveCardRater(r.Context())
	if err != nil {
		log.Error("complete active card rater", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !updated {
		writeMessageError(w, http.StatusNotFound, "no active card rater")
		return
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/card-raters/{id}
func (h *cardRatingsHTTP) deleteCardRater(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}
	idStr := strings.TrimSpace(r.PathValue("id"))
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid card rater id")
		return
	}
	if err := h.app.Repo.DeleteCardRater(r.Context(), id); err != nil {
		if errors.Is(err, repository.ErrCardRaterNotFound) {
			writeMessageError(w, http.StatusNotFound, "card rater not found")
			return
		}
		if errors.Is(err, repository.ErrCardRaterHasDependentRatings) {
			writeMessageError(w, http.StatusConflict, "cannot delete: user ratings still reference this session")
			return
		}
		log.Error("delete card rater", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
