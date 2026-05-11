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

type cardRankingsHTTP struct {
	app *app.App
	svc *service.UserService
}

type userCardRankingJSON struct {
	UserID int     `json:"user_id"`
	SetID  int     `json:"set_id"`
	CardID int     `json:"card_id"`
	Format int16   `json:"format"`
	Rank   int16   `json:"rank"`
	Notes  *string `json:"notes,omitempty"`
}

func rankingToJSON(r repository.UserCardRanking) userCardRankingJSON {
	return userCardRankingJSON{
		UserID: r.UserID,
		SetID:  r.SetID,
		CardID: r.CardID,
		Format: r.Format,
		Rank:   r.Rank,
		Notes:  r.Notes,
	}
}

type userCardRankingDetailJSON struct {
	UserID int       `json:"user_id"`
	SetID  int       `json:"set_id"`
	CardID int       `json:"card_id"`
	Format int16     `json:"format"`
	Rank   int16     `json:"rank"`
	Notes  *string   `json:"notes,omitempty"`
	Card   cardJSON  `json:"card"`
}

type saveUserCardRankingRequest struct {
	SetID  int     `json:"set_id"`
	CardID int     `json:"card_id"`
	Format int16   `json:"format"`
	Rank   int16   `json:"rank"`
	Notes  *string `json:"notes,omitempty"`
}

func cardPlaysFormat(c *repository.Card, format int16) bool {
	if c == nil {
		return false
	}
	return slices.Contains(c.Formats, format)
}

// cardExcludedFromRankings is true for Basic rarity (domain.CardRarityBasic = 0). NULL rarity is allowed.
func cardExcludedFromRankings(c *repository.Card) bool {
	if c == nil {
		return true
	}
	if c.Rarity == nil {
		return false
	}
	return *c.Rarity == int16(domain.CardRarityBasic)
}

// cardExcludedFromLimitedRankings is true for Legendary or Fabled when format is Limited.
func cardExcludedFromLimitedRankings(c *repository.Card, format int16) bool {
	if format != int16(domain.CardFormatLimited) {
		return false
	}
	if c == nil || c.Rarity == nil {
		return false
	}
	r := *c.Rarity
	return r == int16(domain.CardRarityLegendary) || r == int16(domain.CardRarityFabled)
}

func (h *cardRankingsHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("card rankings session user", "error", err)
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

type cardTeamRankingRowJSON struct {
	UserName string  `json:"user_name"`
	Rank     int16   `json:"rank"`
	Notes    *string `json:"notes,omitempty"`
}

func teamRankingDisplayName(username *string, email string) string {
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

// GET /api/me/card-rankings?set_id=&format=
func (h *cardRankingsHTTP) listMyRankings(w http.ResponseWriter, r *http.Request) {
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
		log.Error("card rankings set exists", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	if !exists {
		writeFieldError(w, http.StatusNotFound, "set_id", "set not found")
		return
	}
	rows, err := h.app.Repo.ListUserCardRankingsWithCards(r.Context(), u.ID, setID, format)
	if err != nil {
		log.Error("list user card rankings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]userCardRankingDetailJSON, 0, len(rows))
	for i := range rows {
		row := rows[i]
		out = append(out, userCardRankingDetailJSON{
			UserID: row.UserID,
			SetID:  row.SetID,
			CardID: row.CardID,
			Format: row.Format,
			Rank:   row.Rank,
			Notes:  row.Notes,
			Card:   cardToJSON(&row.Card),
		})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"rankings": out})
}

const maxRankingNotesBytes = 2048

// POST /api/me/card-rankings — new ranking (rank 1–5) or notes-only update (rank must match stored).
func (h *cardRankingsHTTP) saveMyRanking(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body saveUserCardRankingRequest
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
	if body.Rank < 1 || body.Rank > 5 {
		writeFieldError(w, http.StatusBadRequest, "rank", "must be between 1 and 5")
		return
	}
	if body.Notes != nil && len(*body.Notes) > maxRankingNotesBytes {
		writeFieldError(w, http.StatusBadRequest, "notes", "exceeds maximum length")
		return
	}

	exists, err := h.app.Repo.SetExists(r.Context(), body.SetID)
	if err != nil {
		log.Error("save ranking set exists", "error", err)
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
		log.Error("save ranking card by id", "error", err)
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
	if cardExcludedFromRankings(card) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "basic rarity cards cannot be ranked")
		return
	}
	if cardExcludedFromLimitedRankings(card, body.Format) {
		writeFieldError(w, http.StatusBadRequest, "card_id", "legendary and fabled cards cannot be ranked in limited format")
		return
	}

	existing, err := h.app.Repo.GetUserCardRanking(r.Context(), u.ID, body.SetID, body.CardID, body.Format)
	if err != nil && !errors.Is(err, repository.ErrUserCardRankingNotFound) {
		log.Error("save ranking get", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	if existing == nil {
		if err := h.app.Repo.InsertUserCardRanking(r.Context(), u.ID, body.SetID, body.CardID, body.Format, body.Rank, body.Notes); err != nil {
			log.Error("save ranking insert", "error", err)
			writeMessageError(w, http.StatusInternalServerError, "internal server error")
			return
		}
		writeCatalogJSON(w, http.StatusCreated, map[string]any{"ok": true})
		return
	}

	if existing.Rank != body.Rank {
		writeFieldError(w, http.StatusBadRequest, "rank", "rank cannot be changed after submission")
		return
	}
	if err := h.app.Repo.UpdateUserCardRankingNotes(r.Context(), u.ID, body.SetID, body.CardID, body.Format, body.Notes); err != nil {
		if errors.Is(err, repository.ErrUserCardRankingNotFound) {
			writeFieldError(w, http.StatusNotFound, "card_id", "ranking not found")
			return
		}
		log.Error("save ranking update notes", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// GET /api/me/cards-to-rank?set_id=&format=
func (h *cardRankingsHTTP) listMyCardsToRank(w http.ResponseWriter, r *http.Request) {
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

// GET /api/me/card-team-rankings?set_id=&format=&card_id=
func (h *cardRankingsHTTP) listCardTeamRankings(w http.ResponseWriter, r *http.Request) {
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
		log.Error("card team rankings set exists", "error", err)
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
		log.Error("card team rankings card by id", "error", err)
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
	rows, avgPtr, err := h.app.Repo.ListCardTeamRankings(r.Context(), setID, cardID, format)
	if err != nil {
		log.Error("list card team rankings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]cardTeamRankingRowJSON, 0, len(rows))
	for i := range rows {
		row := rows[i]
		if row.UserID == u.ID {
			continue
		}
		out = append(out, cardTeamRankingRowJSON{
			UserName: teamRankingDisplayName(row.Username, row.Email),
			Rank:     row.Rank,
			Notes:    row.Notes,
		})
	}
	payload := map[string]any{"rankings": out}
	if avgPtr != nil {
		payload["average_rank"] = math.Round(*avgPtr*100) / 100
	}
	writeCatalogJSON(w, http.StatusOK, payload)
}
