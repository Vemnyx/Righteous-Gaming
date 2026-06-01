package handler

import (
	"context"
	"errors"
	"fmt"
	"net/http"
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
	FabraryLink string `json:"fabrary_link"`
}

type deckJSON struct {
	ID          int     `json:"id"`
	UserID      int     `json:"user_id"`
	Name        string  `json:"name"`
	Format      int16   `json:"format"`
	Hero        int16   `json:"hero"`
	FabraryLink *string `json:"fabrary_link,omitempty"`
}

type importFabraryDeckResponse struct {
	Deck           deckJSON `json:"deck"`
	CardsImported  int      `json:"cards_imported"`
	UnknownCards   []string `json:"unknown_cards,omitempty"`
}

func deckToJSON(d *repository.Deck) deckJSON {
	if d == nil {
		return deckJSON{}
	}
	return deckJSON{
		ID:          d.ID,
		UserID:      d.UserID,
		Name:        d.Name,
		Format:      d.Format,
		Hero:        d.Hero,
		FabraryLink: d.FabraryLink,
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

	hero, err := resolveFabraryHero(ctx, h.app.Repo, fetched.HeroIdentifier)
	if err != nil {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", err.Error())
		return
	}
	if !domain.CardHero(hero).Valid() {
		writeFieldError(w, http.StatusBadRequest, "fabrary_link", "unsupported hero")
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
	created, err := h.app.Repo.CreateDeckWithCards(ctx, repository.CreateDeckInput{
		UserID:      u.ID,
		Name:        fetched.Name,
		Format:      format,
		Hero:        hero,
		FabraryLink: &linkCopy,
	}, cardInputs)
	if err != nil {
		log.Error("import fabrary deck insert", "error", err, "user_id", u.ID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusCreated, importFabraryDeckResponse{
		Deck:          deckToJSON(created),
		CardsImported: len(cardInputs),
	})
}

func resolveFabraryHero(ctx context.Context, repo *repository.Repository, heroIdentifier string) (int16, error) {
	ident := strings.ToLower(strings.TrimSpace(heroIdentifier))
	if ident == "" {
		return 0, fmt.Errorf("deck has no hero")
	}
	idMap, err := repo.ListCardIDsByIdentifierLower(ctx)
	if err != nil {
		return 0, fmt.Errorf("could not resolve hero")
	}
	if cardID, ok := idMap[ident]; ok {
		card, err := repo.CardByID(ctx, cardID)
		if err == nil && len(card.Heroes) > 0 {
			return card.Heroes[0], nil
		}
	}
	return fabrary.HeroFromIdentifier(heroIdentifier)
}

func mapFabraryDeckCards(fetched *fabrary.Deck, idMap map[string]int) ([]repository.DeckCardInput, []string) {
	seen := make(map[string]struct{})
	var out []repository.DeckCardInput
	var unknown []string

	add := func(identifier string, mainboard bool) {
		key := fmt.Sprintf("%s:%t", strings.ToLower(strings.TrimSpace(identifier)), mainboard)
		if _, ok := seen[key]; ok {
			return
		}
		seen[key] = struct{}{}

		ident := strings.ToLower(strings.TrimSpace(identifier))
		cardID, ok := idMap[ident]
		if !ok {
			unknown = append(unknown, identifier)
			return
		}
		out = append(out, repository.DeckCardInput{
			CardID:    cardID,
			Mainboard: mainboard,
		})
	}

	for _, line := range fetched.Cards {
		if line.MainboardQuantity > 0 {
			add(line.CardIdentifier, true)
		}
		if line.SideboardQuantity > 0 {
			add(line.CardIdentifier, false)
		}
	}

	return out, unknown
}
