package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgconn"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const maxCatalogJSONBytes = 8 << 20
const maxCardsBatchItems = 512

type catalogHTTP struct {
	app *app.App
	svc *service.UserService
}

type setJSON struct {
	ID       int     `json:"id"`
	Name     string  `json:"name"`
	Code     string  `json:"code"`
	ImageURL *string `json:"image_url"`
}

type createSetJSON struct {
	Name     string  `json:"name"`
	Code     string  `json:"code"`
	ImageURL *string `json:"image_url"`
}

type createCardJSON struct {
	SetID           int     `json:"set_id"`
	Name            string  `json:"name"`
	CardIdentifier  *string `json:"card_identifier"`
	ImageURL        *string `json:"image_url"`
	FunctionalText  *string `json:"functional_text"`
	Rarity          *int16  `json:"rarity"`
	SetCode         string  `json:"set_code"`
	SetNum          int16   `json:"set_num"`
	Type            int16   `json:"type"`
	Subtypes        []int16 `json:"subtypes"`
	Classes         []int16 `json:"classes"`
	Hybrid          bool    `json:"hybrid"`
	Talents         []int16 `json:"talents"`
	Pitch           *int16  `json:"pitch"`
	Cost            *int16  `json:"cost"`
	Power           *int16  `json:"power"`
	Block           *int16  `json:"block"`
	Heroes          []int16 `json:"heroes"`
	Life            *int16  `json:"life"`
	Intellect       *int16  `json:"intellect"`
	Keywords        []int16 `json:"keywords"`
	Formats         []int16 `json:"formats"`
	Specializations []int16 `json:"specializations"`
	Fusions         []int16 `json:"fusions"`
}

func (j createCardJSON) toRepoInput() repository.CreateCardInput {
	return repository.CreateCardInput{
		SetID:           j.SetID,
		Name:            j.Name,
		CardIdentifier:  j.CardIdentifier,
		ImageURL:        j.ImageURL,
		FunctionalText:  j.FunctionalText,
		Rarity:          j.Rarity,
		SetCode:         j.SetCode,
		SetNum:          j.SetNum,
		Type:            j.Type,
		Subtypes:        j.Subtypes,
		Classes:         j.Classes,
		Hybrid:          j.Hybrid,
		Talents:         j.Talents,
		Pitch:           j.Pitch,
		Cost:            j.Cost,
		Power:           j.Power,
		Block:           j.Block,
		Heroes:          j.Heroes,
		Life:            j.Life,
		Intellect:       j.Intellect,
		Keywords:        j.Keywords,
		Formats:         j.Formats,
		Specializations: j.Specializations,
		Fusions:         j.Fusions,
	}
}

type printingJSON struct {
	ID       int     `json:"id"`
	SetCode  string  `json:"set_code"`
	SetNum   int16   `json:"set_num"`
	SetName  string  `json:"set_name,omitempty"`
	Rarity   *int16  `json:"rarity"`
	ImageURL *string `json:"image_url"`
}

type cardJSON struct {
	ID              int            `json:"id"`
	SetID           int            `json:"set_id"`
	Name            string         `json:"name"`
	CardIdentifier  *string        `json:"card_identifier"`
	FunctionalText  *string        `json:"functional_text"`
	Rarity          *int16         `json:"rarity"`
	SetCode         string         `json:"set_code"`
	SetNum          int16          `json:"set_num"`
	SetName         string         `json:"set_name,omitempty"`
	Type            int16          `json:"type"`
	Subtypes        []int16        `json:"subtypes"`
	Classes         []int16        `json:"classes"`
	Hybrid          bool           `json:"hybrid"`
	Talents         []int16        `json:"talents"`
	Pitch           *int16         `json:"pitch"`
	Cost            *int16         `json:"cost"`
	Power           *int16         `json:"power"`
	Block           *int16         `json:"block"`
	Heroes          []int16        `json:"heroes"`
	Life            *int16         `json:"life"`
	Intellect       *int16         `json:"intellect"`
	Keywords        []int16        `json:"keywords"`
	Formats         []int16        `json:"formats"`
	Specializations []int16        `json:"specializations"`
	Fusions         []int16        `json:"fusions"`
	Printings       []printingJSON `json:"printings"`
}

func printingsToJSON(ps []repository.CardPrinting) []printingJSON {
	if len(ps) == 0 {
		return []printingJSON{}
	}
	out := make([]printingJSON, len(ps))
	for i := range ps {
		out[i] = printingJSON{
			ID:       ps[i].ID,
			SetCode:  ps[i].SetCode,
			SetNum:   ps[i].SetNum,
			SetName:  ps[i].SetName,
			Rarity:   ps[i].Rarity,
			ImageURL: ps[i].ImageURL,
		}
	}
	return out
}

func cardToJSON(c *repository.Card) cardJSON {
	if c == nil {
		return cardJSON{Printings: []printingJSON{}}
	}
	return cardJSON{
		ID:              c.ID,
		SetID:           c.SetID,
		Name:            c.Name,
		CardIdentifier:  c.CardIdentifier,
		FunctionalText:  c.FunctionalText,
		Rarity:          c.Rarity,
		SetCode:         c.SetCode,
		SetNum:          c.SetNum,
		SetName:         c.SetName,
		Type:            c.Type,
		Subtypes:        c.Subtypes,
		Classes:         c.Classes,
		Hybrid:          c.Hybrid,
		Talents:         c.Talents,
		Pitch:           c.Pitch,
		Cost:            c.Cost,
		Power:           c.Power,
		Block:           c.Block,
		Heroes:          c.Heroes,
		Life:            c.Life,
		Intellect:       c.Intellect,
		Keywords:        c.Keywords,
		Formats:         c.Formats,
		Specializations: c.Specializations,
		Fusions:         c.Fusions,
		Printings:       printingsToJSON(c.Printings),
	}
}

func attachPrintings(ctx context.Context, repo *repository.Repository, cards ...*repository.Card) error {
	return repo.AttachPrintings(ctx, cards)
}

func cardsToJSON(ctx context.Context, repo *repository.Repository, cards []repository.Card) ([]cardJSON, error) {
	if len(cards) == 0 {
		return []cardJSON{}, nil
	}
	ptrs := make([]*repository.Card, len(cards))
	for i := range cards {
		ptrs[i] = &cards[i]
	}
	if err := attachPrintings(ctx, repo, ptrs...); err != nil {
		return nil, err
	}
	out := make([]cardJSON, len(cards))
	for i := range cards {
		out[i] = cardToJSON(&cards[i])
	}
	return out, nil
}

func cardWithPrintingsJSON(ctx context.Context, repo *repository.Repository, c *repository.Card) (cardJSON, error) {
	if c == nil {
		return cardJSON{Printings: []printingJSON{}}, nil
	}
	if err := attachPrintings(ctx, repo, c); err != nil {
		return cardJSON{}, err
	}
	return cardToJSON(c), nil
}

func analyticsCardPointers(a *repository.CardRaterAnalytics) []*repository.Card {
	if a == nil {
		return nil
	}
	var ptrs []*repository.Card
	appendCard := func(c *repository.Card) {
		if c != nil {
			ptrs = append(ptrs, c)
		}
	}
	for i := range a.TopCards {
		appendCard(&a.TopCards[i].Card)
	}
	for i := range a.RatedTable.Rows {
		appendCard(&a.RatedTable.Rows[i].Card)
	}
	for i := range a.ControversialTop {
		appendCard(&a.ControversialTop[i].Card)
	}
	for i := range a.ControversialTable.Rows {
		appendCard(&a.ControversialTable.Rows[i].Card)
	}
	for i := range a.TalkedTop {
		appendCard(&a.TalkedTop[i].Card)
	}
	for i := range a.TalkedTable.Rows {
		appendCard(&a.TalkedTable.Rows[i].Card)
	}
	return ptrs
}

func setToJSON(s *repository.Set) setJSON {
	if s == nil {
		return setJSON{}
	}
	return setJSON{ID: s.ID, Name: s.Name, Code: s.Code, ImageURL: s.ImageURL}
}

func writeCatalogJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func decodeCatalogJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxCatalogJSONBytes)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return err
	}
	return nil
}

// SQLSTATE 23503: foreign_key_violation.
const postgresForeignKeyViolation = "23503"

func violatesForeignKey(err error) bool {
	var pe *pgconn.PgError
	return errors.As(err, &pe) && pe.Code == postgresForeignKeyViolation
}

func validateCreateCardBody(j createCardJSON) (field string, msg string, ok bool) {
	if strings.TrimSpace(j.Name) == "" {
		return "name", "required", false
	}
	if j.SetID == 0 {
		return "set_id", "required", false
	}
	if strings.TrimSpace(j.SetCode) == "" {
		return "set_code", "required", false
	}
	return "", "", true
}

func (h *catalogHTTP) listSets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	list, err := h.app.Repo.ListSets(r.Context())
	if err != nil {
		log.Error("catalog list sets", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out := make([]setJSON, 0, len(list))
	for i := range list {
		out = append(out, setToJSON(&list[i]))
	}
	writeCatalogJSON(w, http.StatusOK, out)
}

func (h *catalogHTTP) getSet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idStr := strings.TrimSpace(r.PathValue("id"))
	id, err := strconv.Atoi(idStr)
	if err != nil || id <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid set id")
		return
	}
	s, err := h.app.Repo.SetByID(r.Context(), id)
	if err != nil {
		if errors.Is(err, repository.ErrSetNotFound) {
			writeMessageError(w, http.StatusNotFound, "set not found")
			return
		}
		log.Error("catalog get set", "error", err, "id", id)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, setToJSON(s))
}

func (h *catalogHTTP) createSet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body createSetJSON
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.Code = strings.TrimSpace(body.Code)
	if body.Name == "" {
		writeFieldError(w, http.StatusBadRequest, "name", "required")
		return
	}
	if body.Code == "" {
		writeFieldError(w, http.StatusBadRequest, "code", "required")
		return
	}
	s, err := h.app.Repo.CreateSet(r.Context(), repository.CreateSetInput{
		Name:     body.Name,
		Code:     body.Code,
		ImageURL: body.ImageURL,
	})
	if err != nil {
		log.Error("catalog create set", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, setToJSON(s))
}

func (h *catalogHTTP) listCards(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	cards, err := h.app.Repo.ListCards(r.Context())
	if err != nil {
		log.Error("catalog list cards", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out, err := cardsToJSON(r.Context(), h.app.Repo, cards)
	if err != nil {
		log.Error("catalog list cards attach printings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, out)
}

func (h *catalogHTTP) listCardsBySet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idStr := strings.TrimSpace(r.PathValue("id"))
	setID, err := strconv.Atoi(idStr)
	if err != nil || setID <= 0 {
		writeMessageError(w, http.StatusBadRequest, "invalid set id")
		return
	}
	cards, err := h.app.Repo.CardsBySetID(r.Context(), setID)
	if err != nil {
		log.Error("catalog list cards by set", "error", err, "set_id", setID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out, err := cardsToJSON(r.Context(), h.app.Repo, cards)
	if err != nil {
		log.Error("catalog list cards by set attach printings", "error", err, "set_id", setID)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, out)
}

func (h *catalogHTTP) getCard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	key := strings.TrimSpace(r.PathValue("id"))
	if key == "" {
		writeMessageError(w, http.StatusBadRequest, "invalid card id")
		return
	}
	var c *repository.Card
	var err error
	if id, convErr := strconv.Atoi(key); convErr == nil && id > 0 {
		c, err = h.app.Repo.CardByID(r.Context(), id)
	} else {
		c, err = h.app.Repo.CardByCardIdentifier(r.Context(), key)
	}
	if err != nil {
		if errors.Is(err, repository.ErrCardNotFound) {
			writeMessageError(w, http.StatusNotFound, "card not found")
			return
		}
		log.Error("catalog get card", "error", err, "key", key)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out, err := cardWithPrintingsJSON(r.Context(), h.app.Repo, c)
	if err != nil {
		log.Error("catalog get card attach printings", "error", err, "key", key)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusOK, out)
}

func (h *catalogHTTP) createCard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body createCardJSON
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	body.Name = strings.TrimSpace(body.Name)
	body.SetCode = strings.TrimSpace(body.SetCode)
	if field, msg, ok := validateCreateCardBody(body); !ok {
		writeFieldError(w, http.StatusBadRequest, field, msg)
		return
	}
	c, err := h.app.Repo.CreateCard(r.Context(), body.toRepoInput())
	if err != nil {
		if violatesForeignKey(err) {
			writeFieldError(w, http.StatusBadRequest, "set_id", "must reference an existing set")
			return
		}
		log.Error("catalog create card", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, cardToJSON(c))
}

func (h *catalogHTTP) createCardsBatch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var body []createCardJSON
	if err := decodeCatalogJSON(w, r, &body); err != nil {
		return
	}
	if len(body) > maxCardsBatchItems {
		writeMessageError(w, http.StatusBadRequest, "too many items in batch")
		return
	}
	inputs := make([]repository.CreateCardInput, 0, len(body))
	for i := range body {
		body[i].Name = strings.TrimSpace(body[i].Name)
		body[i].SetCode = strings.TrimSpace(body[i].SetCode)
		if field, msg, ok := validateCreateCardBody(body[i]); !ok {
			writeFieldError(w, http.StatusBadRequest, field+"["+strconv.Itoa(i)+"]", msg)
			return
		}
		inputs = append(inputs, body[i].toRepoInput())
	}
	cards, err := h.app.Repo.CreateCardsBatch(r.Context(), inputs)
	if err != nil {
		if violatesForeignKey(err) {
			writeMessageError(w, http.StatusBadRequest, "set_id must reference existing sets")
			return
		}
		log.Error("catalog create cards batch", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	out, err := cardsToJSON(r.Context(), h.app.Repo, cards)
	if err != nil {
		log.Error("catalog create cards batch attach printings", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}
	writeCatalogJSON(w, http.StatusCreated, out)
}
