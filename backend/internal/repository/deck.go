package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrDeckNotFound is returned when no deck row matches the given id and owner.
var ErrDeckNotFound = errors.New("repository: deck not found")

// Deck is a row from decks with joined hero display name.
type Deck struct {
	ID             int
	UserID         int
	Name           string
	Format         int16
	HeroID         int
	HeroName       string
	HeroArtImageURL *string
	SetID          *int
	FabraryFormat  *string
	DeckSourceID   int
	DeckSourceName string
	FabraryLink      *string
	FabraryCreatedAt *time.Time
	OwnerUsername  *string
	OwnerEmail     string
}

// CreateDeckInput holds fields for inserting a deck and its cards.
type CreateDeckInput struct {
	UserID        int
	Name          string
	Format        int16
	HeroID        int
	SetID         *int
	FabraryFormat *string
	DeckSourceID  int
	FabraryLink       *string
	FabraryCreatedAt  *time.Time
}

// DeckFabraryCreatedAtBackfillRow is a deck needing fabrary_created_at from Fabrary.
type DeckFabraryCreatedAtBackfillRow struct {
	ID          int
	FabraryLink string
}

const insertDeckSQL = `
INSERT INTO decks (user_id, name, format, hero_id, set_id, fabrary_format, deck_source_id, fabrary_link, fabrary_created_at)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING id`

const deckSelectColumns = `
d.id, d.user_id, d.name, d.format, d.hero_id, h.name, h.art_image_url, d.set_id, d.fabrary_format, d.deck_source_id, ds.source, d.fabrary_link, u.username, u.email`

const deckFromJoins = `
FROM decks d
INNER JOIN heroes h ON h.id = d.hero_id
INNER JOIN deck_source ds ON ds.id = d.deck_source_id
LEFT JOIN users u ON u.id = d.user_id`

// DeckCardInput is one deck_cards row.
type DeckCardInput struct {
	CardID    int
	Mainboard bool
	Count     int
}

// DeckListFilter optionally restricts listed decks by owner and/or deck source.
type DeckListFilter struct {
	UserID       *int
	DeckSourceID *int
}

// ListDecks returns decks matching optional filters, newest first.
func (r *Repository) ListDecks(ctx context.Context, f DeckListFilter) ([]Deck, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if f.UserID != nil && *f.UserID <= 0 {
		return nil, fmt.Errorf("repository: invalid user_id")
	}
	if f.DeckSourceID != nil && *f.DeckSourceID <= 0 {
		return nil, fmt.Errorf("repository: invalid deck_source_id")
	}

	q := `
SELECT ` + deckSelectColumns + deckFromJoins + `
WHERE 1=1`
	args := []any{}
	n := 1
	if f.UserID != nil {
		q += fmt.Sprintf(" AND d.user_id = $%d", n)
		args = append(args, *f.UserID)
		n++
	}
	if f.DeckSourceID != nil {
		q += fmt.Sprintf(" AND d.deck_source_id = $%d", n)
		args = append(args, *f.DeckSourceID)
	}
	q += " ORDER BY d.id DESC"

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("repository: list decks: %w", err)
	}
	defer rows.Close()

	var out []Deck
	for rows.Next() {
		var d Deck
		if err := rows.Scan(
			&d.ID, &d.UserID, &d.Name, &d.Format, &d.HeroID, &d.HeroName, &d.HeroArtImageURL, &d.SetID, &d.FabraryFormat,
			&d.DeckSourceID, &d.DeckSourceName, &d.FabraryLink, &d.OwnerUsername, &d.OwnerEmail,
		); err != nil {
			return nil, fmt.Errorf("repository: scan deck: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list decks rows: %w", err)
	}
	return out, nil
}

// ListDecksByUserID returns decks owned by userID, newest first.
func (r *Repository) ListDecksByUserID(ctx context.Context, userID int) ([]Deck, error) {
	return r.ListDecks(ctx, DeckListFilter{UserID: &userID})
}

// DeckCardEntry is one deck_cards row with its catalog card.
type DeckCardEntry struct {
	CardID    int
	Mainboard bool
	Count     int
	Card      Card
}

// GetDeckByID loads a deck and its cards by deck id (any owner).
func (r *Repository) GetDeckByID(ctx context.Context, deckID int) (*Deck, []DeckCardEntry, error) {
	return r.getDeckWithCards(ctx, deckID, nil)
}

// GetDeckByIDForUser loads a deck and its cards when owned by userID.
func (r *Repository) GetDeckByIDForUser(ctx context.Context, deckID, userID int) (*Deck, []DeckCardEntry, error) {
	if userID <= 0 {
		return nil, nil, fmt.Errorf("repository: invalid user id")
	}
	return r.getDeckWithCards(ctx, deckID, &userID)
}

func (r *Repository) getDeckWithCards(ctx context.Context, deckID int, userID *int) (*Deck, []DeckCardEntry, error) {
	if r.pool == nil {
		return nil, nil, fmt.Errorf("repository: pool is closed")
	}
	if deckID <= 0 {
		return nil, nil, fmt.Errorf("repository: invalid deck id")
	}

	deckQ := `
SELECT ` + deckSelectColumns + deckFromJoins + `
WHERE d.id = $1`
	args := []any{deckID}
	if userID != nil {
		deckQ += ` AND d.user_id = $2`
		args = append(args, *userID)
	}

	var deck Deck
	err := r.pool.QueryRow(ctx, deckQ, args...).Scan(
		&deck.ID, &deck.UserID, &deck.Name, &deck.Format, &deck.HeroID, &deck.HeroName, &deck.HeroArtImageURL,
		&deck.SetID, &deck.FabraryFormat, &deck.DeckSourceID, &deck.DeckSourceName, &deck.FabraryLink,
		&deck.OwnerUsername, &deck.OwnerEmail,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil, ErrDeckNotFound
		}
		return nil, nil, fmt.Errorf("repository: get deck: %w", err)
	}

	const cardsQ = `
SELECT dc.card_id, dc.mainboard, dc.count, ` + cardSelectColumns + `
FROM deck_cards dc
INNER JOIN cards c ON c.id = dc.card_id
` + cardPrintingLateralJoin + `
WHERE dc.deck_id = $1
ORDER BY dc.mainboard DESC, c.pitch NULLS LAST, c.name ASC, dc.card_id ASC`

	rows, err := r.pool.Query(ctx, cardsQ, deckID)
	if err != nil {
		return nil, nil, fmt.Errorf("repository: list deck cards: %w", err)
	}
	defer rows.Close()

	var entries []DeckCardEntry
	for rows.Next() {
		var e DeckCardEntry
		var c Card
		if err := rows.Scan(
			&e.CardID, &e.Mainboard, &e.Count,
			&c.ID, &c.SetID, &c.Name, &c.CardIdentifier, &c.ImageURL, &c.FunctionalText, &c.Rarity, &c.SetCode, &c.SetNum,
			&c.Type, &c.Subtypes, &c.Classes, &c.Hybrid, &c.Talents, &c.Pitch, &c.Cost, &c.Power, &c.Block, &c.Heroes,
			&c.Life, &c.Intellect, &c.Keywords, &c.Formats, &c.Specializations, &c.Fusions,
		); err != nil {
			return nil, nil, fmt.Errorf("repository: scan deck card row: %w", err)
		}
		e.Card = c
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("repository: list deck cards rows: %w", err)
	}
	return &deck, entries, nil
}

// DeleteDeckByIDForUser removes a deck owned by userID. deck_cards cascade via FK.
func (r *Repository) DeleteDeckByIDForUser(ctx context.Context, deckID, userID int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if deckID <= 0 || userID <= 0 {
		return fmt.Errorf("repository: invalid deck or user id")
	}

	tag, err := r.pool.Exec(ctx, `DELETE FROM decks WHERE id = $1 AND user_id = $2`, deckID, userID)
	if err != nil {
		return fmt.Errorf("repository: delete deck: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrDeckNotFound
	}
	return nil
}

// CreateDeckWithCards inserts a deck and its card rows in one transaction.
func (r *Repository) CreateDeckWithCards(ctx context.Context, in CreateDeckInput, cards []DeckCardInput) (*Deck, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if in.UserID <= 0 {
		return nil, fmt.Errorf("repository: user_id required")
	}
	if in.Name == "" {
		return nil, fmt.Errorf("repository: name required")
	}

	if in.DeckSourceID <= 0 {
		return nil, fmt.Errorf("repository: deck_source_id required")
	}
	if in.HeroID <= 0 {
		return nil, fmt.Errorf("repository: hero_id required")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("repository: create deck begin: %w", err)
	}
	defer tx.Rollback(ctx)

	const insertDeck = insertDeckSQL

	var deckID int
	if err := tx.QueryRow(ctx, insertDeck,
		in.UserID, in.Name, in.Format, in.HeroID, in.SetID, in.FabraryFormat, in.DeckSourceID, in.FabraryLink, in.FabraryCreatedAt,
	).Scan(&deckID); err != nil {
		return nil, fmt.Errorf("repository: insert deck: %w", err)
	}

	if len(cards) > 0 {
		batch := &pgx.Batch{}
		const insertCard = `
INSERT INTO deck_cards (deck_id, card_id, mainboard, count)
VALUES ($1, $2, $3, $4)
ON CONFLICT (deck_id, card_id, mainboard) DO NOTHING`
		for _, c := range cards {
			if c.CardID <= 0 {
				return nil, fmt.Errorf("repository: invalid card_id")
			}
			count := c.Count
			if count <= 0 {
				count = 1
			}
			batch.Queue(insertCard, deckID, c.CardID, c.Mainboard, count)
		}
		br := tx.SendBatch(ctx, batch)
		for range cards {
			if _, err := br.Exec(); err != nil {
				_ = br.Close()
				return nil, fmt.Errorf("repository: insert deck card: %w", err)
			}
		}
		if err := br.Close(); err != nil {
			return nil, fmt.Errorf("repository: insert deck cards batch: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("repository: create deck commit: %w", err)
	}

	deck, err := r.getDeckByIDForUserAfterCommit(ctx, deckID, in.UserID)
	if err != nil {
		return nil, err
	}
	return deck, nil
}

func (r *Repository) getDeckByIDForUserAfterCommit(ctx context.Context, deckID, userID int) (*Deck, error) {
	const q = `
SELECT ` + deckSelectColumns + deckFromJoins + `
WHERE d.id = $1 AND d.user_id = $2`

	var deck Deck
	err := r.pool.QueryRow(ctx, q, deckID, userID).Scan(
		&deck.ID, &deck.UserID, &deck.Name, &deck.Format, &deck.HeroID, &deck.HeroName, &deck.HeroArtImageURL,
		&deck.SetID, &deck.FabraryFormat, &deck.DeckSourceID, &deck.DeckSourceName, &deck.FabraryLink,
		&deck.OwnerUsername, &deck.OwnerEmail,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDeckNotFound
		}
		return nil, fmt.Errorf("repository: load created deck: %w", err)
	}
	return &deck, nil
}

// MajoritySetIDForCardIDs returns the most common set_id among the given catalog card ids.
func (r *Repository) MajoritySetIDForCardIDs(ctx context.Context, cardIDs []int) (*int, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if len(cardIDs) == 0 {
		return nil, nil
	}

	const q = `
SELECT set_id
FROM cards
WHERE id = ANY($1)
GROUP BY set_id
ORDER BY COUNT(*) DESC, set_id ASC
LIMIT 1`

	var setID int
	err := r.pool.QueryRow(ctx, q, cardIDs).Scan(&setID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("repository: majority set for cards: %w", err)
	}
	if setID <= 0 {
		return nil, nil
	}
	return &setID, nil
}

// DeckExistsByFabraryLink reports whether userID already has a deck with the given Fabrary link.
func (r *Repository) DeckExistsByFabraryLink(ctx context.Context, userID int, fabraryLink string) (bool, error) {
	if r.pool == nil {
		return false, fmt.Errorf("repository: pool is closed")
	}
	link := strings.TrimSpace(fabraryLink)
	if userID <= 0 || link == "" {
		return false, nil
	}
	const q = `SELECT 1 FROM decks WHERE user_id = $1 AND fabrary_link = $2 LIMIT 1`
	var one int
	err := r.pool.QueryRow(ctx, q, userID, link).Scan(&one)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("repository: deck by fabrary link: %w", err)
	}
	return true, nil
}

// UpdateDeckName sets the display name for a deck row.
func (r *Repository) UpdateDeckName(ctx context.Context, deckID int, name string) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	name = strings.TrimSpace(name)
	if deckID <= 0 {
		return fmt.Errorf("repository: deck_id required")
	}
	if name == "" {
		return fmt.Errorf("repository: name required")
	}
	const q = `UPDATE decks SET name = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, deckID, name)
	if err != nil {
		return fmt.Errorf("repository: update deck name: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrDeckNotFound
	}
	return nil
}

// ListDecksForFabraryCreatedAtBackfill returns decks with fabrary_link but no fabrary_created_at.
func (r *Repository) ListDecksForFabraryCreatedAtBackfill(ctx context.Context, f DeckListFilter) ([]DeckFabraryCreatedAtBackfillRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}

	q := `
SELECT d.id, d.fabrary_link
FROM decks d
WHERE d.fabrary_link IS NOT NULL
  AND TRIM(d.fabrary_link) <> ''
  AND d.fabrary_created_at IS NULL`
	args := []any{}
	n := 1
	if f.UserID != nil {
		if *f.UserID <= 0 {
			return nil, fmt.Errorf("repository: invalid user_id")
		}
		q += fmt.Sprintf(" AND d.user_id = $%d", n)
		args = append(args, *f.UserID)
		n++
	}
	if f.DeckSourceID != nil {
		if *f.DeckSourceID <= 0 {
			return nil, fmt.Errorf("repository: invalid deck_source_id")
		}
		q += fmt.Sprintf(" AND d.deck_source_id = $%d", n)
		args = append(args, *f.DeckSourceID)
	}
	q += " ORDER BY d.id ASC"

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("repository: list fabrary created_at backfill: %w", err)
	}
	defer rows.Close()

	out := make([]DeckFabraryCreatedAtBackfillRow, 0, 64)
	for rows.Next() {
		var row DeckFabraryCreatedAtBackfillRow
		if err := rows.Scan(&row.ID, &row.FabraryLink); err != nil {
			return nil, fmt.Errorf("repository: scan fabrary created_at backfill: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list fabrary created_at backfill rows: %w", err)
	}
	return out, nil
}

// UpdateDeckFabraryCreatedAt sets fabrary_created_at for a deck row.
func (r *Repository) UpdateDeckFabraryCreatedAt(ctx context.Context, deckID int, createdAt time.Time) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if deckID <= 0 {
		return fmt.Errorf("repository: deck_id required")
	}
	if createdAt.IsZero() {
		return fmt.Errorf("repository: created_at required")
	}
	const q = `UPDATE decks SET fabrary_created_at = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, deckID, createdAt.UTC())
	if err != nil {
		return fmt.Errorf("repository: update fabrary_created_at: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrDeckNotFound
	}
	return nil
}
