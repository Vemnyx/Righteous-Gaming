package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/fabrary"
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
	HeroID        int     `json:"hero_id"`
	HeroName      string  `json:"hero_name"`
	SetID         *int    `json:"set_id,omitempty"`
	FabraryFormat  *string `json:"fabrary_format,omitempty"`
	DeckSourceID   int     `json:"deck_source_id"`
	Source         string  `json:"source"`
	FabraryLink    *string `json:"fabrary_link,omitempty"`
}

type deckCardLineJSON struct {
	CardID    int      `json:"card_id"`
	Mainboard bool     `json:"mainboard"`
	Count     int      `json:"count"`
	Card      cardJSON `json:"card"`
}

type deckDetailJSON struct {
	Deck  deckJSON           `json:"deck"`
	Cards []deckCardLineJSON `json:"cards"`
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
		HeroID:        d.HeroID,
		HeroName:      d.HeroName,
		SetID:          d.SetID,
		FabraryFormat:  d.FabraryFormat,
		DeckSourceID:   d.DeckSourceID,
		Source:         d.DeckSourceName,
		FabraryLink:    d.FabraryLink,
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

func (h *decksHTTP) listMyDecks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	u, ok := h.sessionUser(w, r)
	if !ok {
		return
	}

	decks, err := h.app.Repo.ListDecksByUserID(r.Context(), u.ID)
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

	deck, entries, err := h.app.Repo.GetDeckByIDForUser(r.Context(), id, u.ID)
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
		Deck:  deckToJSON(deck),
		Cards: lines,
	})
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

	deckID, normalizedLink, err := fabrary.ParseDeckURL(link)
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", err.Error())
		return
	}

	ctx := r.Context()
	fetched, err := fabrary.FetchDeck(ctx, deckID)
	if err != nil {
		log.Error("import fabrary deck fetch", "error", err, "deck_id", deckID)
		writeMessageError(w, http.StatusBadGateway, "could not load deck from Fabrary")
		return
	}

	format, err := fabrary.FormatFromFabrary(fetched.Format)
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", fmt.Sprintf("unsupported format: %s", fetched.Format))
		return
	}
	if !domain.CardFormat(format).Valid() {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", "unsupported format")
		return
	}

	heroID, err := resolveFabraryHeroID(ctx, h.app.Repo, fetched.HeroIdentifier)
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", err.Error())
		return
	}

	idMap, err := h.app.Repo.ListCardIDsByIdentifierLower(ctx)
	if err != nil {
		log.Error("import fabrary deck card map", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	cardInputs, unknown := mapFabraryDeckCards(fetched, idMap)
	if len(unknown) > 0 {
		writeCatalogJSON(w, http.StatusBadRequest, map[string]any{
			"message":       "some cards were not found in the catalog",
			"unknown_cards": unknown,
		})
		return
	}
	if len(cardInputs) == 0 {
		writeMessageError(w, http.StatusBadRequest, "deck has no importable cards")
		return
	}

	linkCopy := normalizedLink
	setID, fabraryFormat := limitedDeckSetFields(ctx, h.app.Repo, format, fetched.Format, cardInputs)
	created, err := h.app.Repo.CreateDeckWithCards(ctx, repository.CreateDeckInput{
		UserID:        u.ID,
		Name:          fetched.Name,
		Format:        format,
		HeroID:        heroID,
		SetID:         setID,
		FabraryFormat: fabraryFormat,
		DeckSourceID:  body.DeckSourceID,
		FabraryLink:   &linkCopy,
	}, cardInputs)
	if err != nil {
		log.Error("import fabrary deck insert", "error", err, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusCreated, importFabraryDeckResponse{
		Deck:          deckToJSON(created),
		CardsImported: sumDeckCardCounts(cardInputs),
	})
}

func sumDeckCardCounts(cards []repository.DeckCardInput) int {
	n := 0
	for _, c := range cards {
		if c.Count > 0 {
			n += c.Count
		} else {
			n++
		}
	}
	return n
}

// limitedDeckSetFields returns set_id and fabrary_format only for Draft, Limited, or Sealed.
func limitedDeckSetFields(
	ctx context.Context,
	repo *repository.Repository,
	format int16,
	fabraryFormatRaw string,
	cards []repository.DeckCardInput,
) (*int, *string) {
	if format != int16(domain.CardFormatLimited) {
		return nil, nil
	}
	raw := strings.TrimSpace(fabraryFormatRaw)
	if !fabrary.IsLimitedFamilyFormatLabel(raw) {
		return nil, nil
	}
	label := raw
	fabFormat := &label

	ids := make([]int, 0, len(cards))
	seen := make(map[int]struct{}, len(cards))
	for _, c := range cards {
		if c.CardID <= 0 {
			continue
		}
		if _, ok := seen[c.CardID]; ok {
			continue
		}
		seen[c.CardID] = struct{}{}
		ids = append(ids, c.CardID)
	}
	setID, err := repo.MajoritySetIDForCardIDs(ctx, ids)
	if err != nil {
		return nil, fabFormat
	}
	return setID, fabFormat
}

func resolveFabraryHeroID(ctx context.Context, repo *repository.Repository, heroIdentifier string) (int, error) {
	ident := strings.ToLower(strings.TrimSpace(heroIdentifier))
	if ident == "" {
		return 0, fmt.Errorf("deck has no hero")
	}

	if heroID, err := repo.HeroIDByCardIdentifier(ctx, ident); err == nil {
		return heroID, nil
	} else if !errors.Is(err, repository.ErrHeroNotFound) {
		return 0, fmt.Errorf("could not resolve hero")
	}

	heroType, err := fabrary.HeroFromIdentifier(heroIdentifier)
	if err != nil {
		return 0, err
	}
	if !domain.CardHero(heroType).Valid() {
		return 0, fmt.Errorf("unsupported hero")
	}

	heroID, err := repo.HeroIDByType(ctx, heroType)
	if err != nil {
		if errors.Is(err, repository.ErrHeroNotFound) {
			return 0, fmt.Errorf("hero not found in catalog")
		}
		return 0, fmt.Errorf("could not resolve hero")
	}
	return heroID, nil
}

func mapFabraryDeckCards(fetched *fabrary.Deck, idMap map[string]int) ([]repository.DeckCardInput, []string) {
	type rowKey struct {
		cardID    int
		mainboard bool
	}
	counts := make(map[rowKey]int)
	unknownSeen := make(map[string]struct{})
	var unknown []string

	for _, line := range fetched.Cards {
		ident := strings.ToLower(strings.TrimSpace(line.CardIdentifier))
		if ident == "" {
			continue
		}
		cardID, ok := idMap[ident]
		if !ok {
			if _, seen := unknownSeen[line.CardIdentifier]; !seen {
				unknownSeen[line.CardIdentifier] = struct{}{}
				unknown = append(unknown, line.CardIdentifier)
			}
			continue
		}
		if line.MainboardQuantity > 0 {
			k := rowKey{cardID: cardID, mainboard: true}
			counts[k] += line.MainboardQuantity
		}
		if line.SideboardQuantity > 0 {
			k := rowKey{cardID: cardID, mainboard: false}
			counts[k] += line.SideboardQuantity
		}
	}

	out := make([]repository.DeckCardInput, 0, len(counts))
	for k, count := range counts {
		out = append(out, repository.DeckCardInput{
			CardID:    k.cardID,
			Mainboard: k.mainboard,
			Count:     count,
		})
	}
	return out, unknown
}
