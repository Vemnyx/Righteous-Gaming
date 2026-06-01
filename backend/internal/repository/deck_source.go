package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrDeckSourceNotFound is returned when no deck_source row matches.
var ErrDeckSourceNotFound = errors.New("repository: deck source not found")

// ErrDeckSourceDuplicate is returned when source name already exists.
var ErrDeckSourceDuplicate = errors.New("repository: deck source already exists")

// DeckSource is a row from deck_source.
type DeckSource struct {
	ID     int
	Source string
}

// ListDeckSources returns all deck sources ordered by source name.
func (r *Repository) ListDeckSources(ctx context.Context) ([]DeckSource, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}

	const q = `SELECT id, source FROM deck_source ORDER BY source ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list deck sources: %w", err)
	}
	defer rows.Close()

	var out []DeckSource
	for rows.Next() {
		var s DeckSource
		if err := rows.Scan(&s.ID, &s.Source); err != nil {
			return nil, fmt.Errorf("repository: scan deck source: %w", err)
		}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list deck sources rows: %w", err)
	}
	return out, nil
}

// DeckSourceByID loads one deck_source by id.
func (r *Repository) DeckSourceByID(ctx context.Context, id int) (*DeckSource, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return nil, fmt.Errorf("repository: invalid deck source id")
	}

	const q = `SELECT id, source FROM deck_source WHERE id = $1`
	var s DeckSource
	err := r.pool.QueryRow(ctx, q, id).Scan(&s.ID, &s.Source)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrDeckSourceNotFound
		}
		return nil, fmt.Errorf("repository: deck source by id: %w", err)
	}
	return &s, nil
}

// CreateDeckSource inserts a new deck source.
func (r *Repository) CreateDeckSource(ctx context.Context, source string) (*DeckSource, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	source = strings.TrimSpace(source)
	if source == "" {
		return nil, fmt.Errorf("repository: source required")
	}

	const q = `
INSERT INTO deck_source (source)
VALUES ($1)
RETURNING id, source`

	var s DeckSource
	err := r.pool.QueryRow(ctx, q, source).Scan(&s.ID, &s.Source)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrDeckSourceDuplicate
		}
		return nil, fmt.Errorf("repository: create deck source: %w", err)
	}
	return &s, nil
}
