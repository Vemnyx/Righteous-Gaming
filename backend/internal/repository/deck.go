package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ErrDeckNotFound is returned when no deck row matches the given id and owner.
var ErrDeckNotFound = errors.New("repository: deck not found")

// Deck is a row from decks.
type Deck struct {
	ID          int
	UserID      int
	Name        string
	Format      int16
	Hero        int16
	HeroName    *string
	FabraryLink *string
}

// CreateDeckInput holds fields for inserting a deck and its cards.
type CreateDeckInput struct {
	UserID      int
	Name        string
	Format      int16
	Hero        int16
	HeroName    *string
	FabraryLink *string
}

// DeckCardInput is one deck_cards row.
type DeckCardInput struct {
	CardID    int
	Mainboard bool
	Count     int
}

// ListDecksByUserID returns decks owned by userID, newest first.
func (r *Repository) ListDecksByUserID(ctx context.Context, userID int) ([]Deck, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if userID <= 0 {
		return nil, fmt.Errorf("repository: user_id required")
	}

	const q = `
SELECT id, user_id, name, format, hero, hero_name, fabrary_link
FROM decks
WHERE user_id = $1
ORDER BY id DESC`

	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("repository: list decks: %w", err)
	}
	defer rows.Close()

	var out []Deck
	for rows.Next() {
		var d Deck
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Format, &d.Hero, &d.HeroName, &d.FabraryLink); err != nil {
			return nil, fmt.Errorf("repository: scan deck: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list decks rows: %w", err)
	}
	return out, nil
}

// DeckCardEntry is one deck_cards row with its catalog card.
type DeckCardEntry struct {
	CardID    int
	Mainboard bool
	Count     int
	Card      Card
}

// GetDeckByIDForUser loads a deck and its cards when owned by userID.
func (r *Repository) GetDeckByIDForUser(ctx context.Context, deckID, userID int) (*Deck, []DeckCardEntry, error) {
	if r.pool == nil {
		return nil, nil, fmt.Errorf("repository: pool is closed")
	}
	if deckID <= 0 || userID <= 0 {
		return nil, nil, fmt.Errorf("repository: invalid deck or user id")
	}

	const deckQ = `
SELECT id, user_id, name, format, hero, hero_name, fabrary_link
FROM decks
WHERE id = $1 AND user_id = $2`

	var deck Deck
	err := r.pool.QueryRow(ctx, deckQ, deckID, userID).Scan(
		&deck.ID, &deck.UserID, &deck.Name, &deck.Format, &deck.Hero, &deck.HeroName, &deck.FabraryLink,
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

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("repository: create deck begin: %w", err)
	}
	defer tx.Rollback(ctx)

	const insertDeck = `
INSERT INTO decks (user_id, name, format, hero, hero_name, fabrary_link)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, user_id, name, format, hero, hero_name, fabrary_link`

	var deck Deck
	if err := tx.QueryRow(ctx, insertDeck, in.UserID, in.Name, in.Format, in.Hero, in.HeroName, in.FabraryLink).Scan(
		&deck.ID, &deck.UserID, &deck.Name, &deck.Format, &deck.Hero, &deck.HeroName, &deck.FabraryLink,
	); err != nil {
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
			batch.Queue(insertCard, deck.ID, c.CardID, c.Mainboard, count)
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
	return &deck, nil
}
