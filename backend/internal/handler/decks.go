package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/deckimport"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type decksHTTP struct {
	app *app.App
	svc *service.UserService
}

type importFabraryDeckRequest struct {
	FabraryLink  string `json:"fabrary_link"`
	DeckSourceID int    `json:"deck_source_id"`
}

type createDeckSourceRequest struct {
	Source string `json:"source"`
}

type deckSourceJSON struct {
	ID     int    `json:"id"`
	Source string `json:"source"`
}

type deckJSON struct {
	ID            int     `json:"id"`
	UserID        int     `json:"user_id"`
	Name          string  `json:"name"`
	Format        int16   `json:"format"`
	HeroID          int     `json:"hero_id"`
	HeroName        string  `json:"hero_name"`
	HeroArtImageURL *string `json:"hero_art_image_url,omitempty"`
	SetID           *int    `json:"set_id,omitempty"`
	FabraryFormat  *string `json:"fabrary_format,omitempty"`
	DeckSourceID    int     `json:"deck_source_id"`
	Source          string  `json:"source"`
	FabraryLink     *string `json:"fabrary_link,omitempty"`
	OwnerUsername   *string `json:"owner_username,omitempty"`
	OwnerEmail      string  `json:"owner_email,omitempty"`
}

type deckCardLineJSON struct {
	CardID    int      `json:"card_id"`
	Mainboard bool     `json:"mainboard"`
	Count     int      `json:"count"`
	Card      cardJSON `json:"card"`
}

type deckDetailJSON struct {
	Deck     deckJSON           `json:"deck"`
	Cards    []deckCardLineJSON `json:"cards"`
	HeroCard *cardJSON          `json:"hero_card,omitempty"`
}

type importFabraryDeckResponse struct {
	Deck          deckJSON `json:"deck"`
	CardsImported int      `json:"cards_imported"`
	UnknownCards  []string `json:"unknown_cards,omitempty"`
}

func deckToJSON(d *repository.Deck) deckJSON {
	if d == nil {
		return deckJSON{}
	}
	return deckJSON{
		ID:            d.ID,
		UserID:        d.UserID,
		Name:          d.Name,
		Format:        d.Format,
		HeroID:          d.HeroID,
		HeroName:        d.HeroName,
		HeroArtImageURL: d.HeroArtImageURL,
		SetID:           d.SetID,
		FabraryFormat:  d.FabraryFormat,
		DeckSourceID:   d.DeckSourceID,
		Source:         d.DeckSourceName,
		FabraryLink:    d.FabraryLink,
		OwnerUsername:  d.OwnerUsername,
		OwnerEmail:     d.OwnerEmail,
	}
}

func (h *decksHTTP) sessionUser(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
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
		log.Error("decks session user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	return u, true
}

func (h *decksHTTP) listDeckSources(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sources, err := h.app.Repo.ListDeckSources(r.Context())
	if err != nil {
		log.Error("list deck sources", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	out := make([]deckSourceJSON, 0, len(sources))
	for i := range sources {
		out = append(out, deckSourceJSON{ID: sources[i].ID, Source: sources[i].Source})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"sources": out})
}

func (h *decksHTTP) createDeckSource(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	var body createDeckSourceRequest
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	source := strings.TrimSpace(body.Source)
	if source == "" {
		writeFieldError(w, http.StatusBadRequest, "source", "required")
		return
	}

	created, err := h.app.Repo.CreateDeckSource(r.Context(), source)
	if err != nil {
		if errors.Is(err, repository.ErrDeckSourceDuplicate) {
			writeFieldError(w, http.StatusConflict, "source", "already exists")
			return
		}
		log.Error("create deck source", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusCreated, deckSourceJSON{ID: created.ID, Source: created.Source})
}

func (h *decksHTTP) isAdmin(u *domain.User) bool {
	return u != nil && u.Role != nil && *u.Role == domain.RoleAdmin
}

func (h *decksHTTP) listMyDecks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	filter := repository.DeckListFilter{}
	isAdmin := h.isAdmin(u)

	if uidStr := strings.TrimSpace(r.URL.Query().Get("user_id")); uidStr != "" {
		uid, err := strconv.Atoi(uidStr)
		if err != nil || uid <= 0 {
			writeFieldError(w, http.StatusBadRequest, "user_id", "invalid")
			return
		}
		if !isAdmin && uid != u.ID {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		filter.UserID = &uid
	} else if !isAdmin {
		filter.UserID = &u.ID
	}

	if sidStr := strings.TrimSpace(r.URL.Query().Get("deck_source_id")); sidStr != "" {
		sid, err := strconv.Atoi(sidStr)
		if err != nil || sid <= 0 {
			writeFieldError(w, http.StatusBadRequest, "deck_source_id", "invalid")
			return
		}
		filter.DeckSourceID = &sid
	}

	decks, err := h.app.Repo.ListDecks(r.Context(), filter)
	if err != nil {
		log.Error("list my decks", "error", err, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	out := make([]deckJSON, 0, len(decks))
	for i := range decks {
		out = append(out, deckToJSON(&decks[i]))
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"decks": out})
}

type deckFilterUserJSON struct {
	ID       int     `json:"id"`
	Email    string  `json:"email"`
	Username *string `json:"username,omitempty"`
}

func (h *decksHTTP) listDeckFilterUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}
	if !h.isAdmin(u) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	rows, err := h.app.Repo.ListUsersForDeckFilter(r.Context())
	if err != nil {
		log.Error("list deck filter users", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	out := make([]deckFilterUserJSON, 0, len(rows))
	for i := range rows {
		out = append(out, deckFilterUserJSON{
			ID:       rows[i].ID,
			Email:    rows[i].Email,
			Username: rows[i].Username,
		})
	}
	writeCatalogJSON(w, http.StatusOK, map[string]any{"users": out})
}

func (h *decksHTTP) getMyDeck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	idStr := strings.TrimSpace(r.PathValue("id"))
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid deck id")
		return
	}

	var deck *repository.Deck
	var entries []repository.DeckCardEntry
	if h.isAdmin(u) {
		deck, entries, err = h.app.Repo.GetDeckByID(r.Context(), id)
	} else {
		deck, entries, err = h.app.Repo.GetDeckByIDForUser(r.Context(), id, u.ID)
	}
	if err != nil {
		if errors.Is(err, repository.ErrDeckNotFound) {
			writeMessageError(w, http.StatusNotFound, "deck not found")
			return
		}
		log.Error("get my deck", "error", err, "deck_id", id, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	cardPtrs := make([]*repository.Card, len(entries))
	for i := range entries {
		cardPtrs[i] = &entries[i].Card
	}
	if err := h.app.Repo.AttachPrintings(r.Context(), cardPtrs); err != nil {
		log.Error("get my deck attach printings", "error", err, "deck_id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	lines := make([]deckCardLineJSON, len(entries))
	for i := range entries {
		lines[i] = deckCardLineJSON{
			CardID:    entries[i].CardID,
			Mainboard: entries[i].Mainboard,
			Count:     entries[i].Count,
			Card:      cardToJSON(&entries[i].Card),
		}
	}

	writeCatalogJSON(w, http.StatusOK, deckDetailJSON{
		Deck:     h.deckJSONWithOwner(r.Context(), deck),
		Cards:    lines,
		HeroCard: h.heroCardJSON(r.Context(), deck.HeroID),
	})
}

func (h *decksHTTP) heroCardJSON(ctx context.Context, heroID int) *cardJSON {
	hero, err := h.app.Repo.HeroByID(ctx, heroID)
	if err != nil || hero.CardID == nil || *hero.CardID <= 0 {
		return nil
	}
	card, err := h.app.Repo.CardByID(ctx, *hero.CardID)
	if err != nil {
		return nil
	}
	if err := h.app.Repo.AttachPrintings(ctx, []*repository.Card{card}); err != nil {
		return nil
	}
	j := cardToJSON(card)
	return &j
}

func (h *decksHTTP) deckJSONWithOwner(ctx context.Context, deck *repository.Deck) deckJSON {
	j := deckToJSON(deck)
	if deck == nil {
		return j
	}
	owner, err := h.app.Repo.UserByID(ctx, deck.UserID)
	if err != nil {
		return j
	}
	j.OwnerUsername = owner.Username
	j.OwnerEmail = owner.Email
	return j
}

func (h *decksHTTP) deleteMyDeck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	idStr := strings.TrimSpace(r.PathValue("id"))
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid deck id")
		return
	}

	if err := h.app.Repo.DeleteDeckByIDForUser(r.Context(), id, u.ID); err != nil {
		if errors.Is(err, repository.ErrDeckNotFound) {
			writeMessageError(w, http.StatusNotFound, "deck not found")
			return
		}
		log.Error("delete my deck", "error", err, "deck_id", id, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *decksHTTP) importFabraryDeck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	var body importFabraryDeckRequest
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	link := strings.TrimSpace(body.FabraryLink)
	if link == "" {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", "required")
		return
	}
	if body.DeckSourceID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "deck_source_id", "required")
		return
	}
	if _, err := h.app.Repo.DeckSourceByID(r.Context(), body.DeckSourceID); err != nil {
		if errors.Is(err, repository.ErrDeckSourceNotFound) {
			writeFieldError(w, http.StatusBadRequest, "deck_source_id", "invalid deck source")
			return
		}
		log.Error("import fabrary deck source lookup", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	result, err := deckimport.ImportFabrary(r.Context(), h.app.Repo, u.ID, body.DeckSourceID, link, nil)
	if err != nil {
		var unknown *deckimport.ErrUnknownCards
		if errors.As(err, &unknown) {
			writeCatalogJSON(w, http.StatusBadRequest, map[string]any{
				"message":       "some cards were not found in the catalog",
				"unknown_cards": unknown.Unknown,
			})
			return
		}
		if strings.Contains(err.Error(), "invalid deck_source_id") {
			writeFieldError(w, http.StatusBadRequest, "deck_source_id", "invalid deck source")
			return
		}
		if strings.Contains(err.Error(), "unsupported format") ||
			strings.Contains(err.Error(), "deck has no hero") ||
			strings.Contains(err.Error(), "hero not found") ||
			strings.Contains(err.Error(), "unsupported hero") ||
			strings.Contains(err.Error(), "fabrary:") ||
			strings.Contains(err.Error(), "deck has no importable cards") {
			writeFieldError(w, http.StatusBadRequest, "fabrary_link", err.Error())
			return
		}
		if strings.Contains(err.Error(), "could not load deck from Fabrary") {
			log.Error("import fabrary deck fetch", "error", err)
			writeMessageError(w, http.StatusBadGateway, "could not load deck from Fabrary")
			return
		}
		log.Error("import fabrary deck", "error", err, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusCreated, importFabraryDeckResponse{
		Deck:          deckToJSON(result.Deck),
		CardsImported: result.CardsImported,
	})
}
