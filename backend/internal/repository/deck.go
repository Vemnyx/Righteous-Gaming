package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// Deck is a row from decks.
type Deck struct {
	ID          int
	UserID      int
	Name        string
	Format      int16
	Hero        int16
	FabraryLink *string
}

// CreateDeckInput holds fields for inserting a deck and its cards.
type CreateDeckInput struct {
	UserID      int
	Name        string
	Format      int16
	Hero        int16
	FabraryLink *string
}

// DeckCardInput is one deck_cards row.
type DeckCardInput struct {
	CardID    int
	Mainboard bool
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
SELECT id, user_id, name, format, hero, fabrary_link
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
		if err := rows.Scan(&d.ID, &d.UserID, &d.Name, &d.Format, &d.Hero, &d.FabraryLink); err != nil {
			return nil, fmt.Errorf("repository: scan deck: %w", err)
		}
		out = append(out, d)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list decks rows: %w", err)
	}
	return out, nil
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
INSERT INTO decks (user_id, name, format, hero, fabrary_link)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, user_id, name, format, hero, fabrary_link`

	var deck Deck
	if err := tx.QueryRow(ctx, insertDeck, in.UserID, in.Name, in.Format, in.Hero, in.FabraryLink).Scan(
		&deck.ID, &deck.UserID, &deck.Name, &deck.Format, &deck.Hero, &deck.FabraryLink,
	); err != nil {
		return nil, fmt.Errorf("repository: insert deck: %w", err)
	}

	if len(cards) > 0 {
		batch := &pgx.Batch{}
		const insertCard = `
INSERT INTO deck_cards (deck_id, card_id, mainboard)
VALUES ($1, $2, $3)
ON CONFLICT (deck_id, card_id, mainboard) DO NOTHING`
		for _, c := range cards {
			if c.CardID <= 0 {
				return nil, fmt.Errorf("repository: invalid card_id")
			}
			batch.Queue(insertCard, deck.ID, c.CardID, c.Mainboard)
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
