package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// CardRater is a row from card_rater.
type CardRater struct {
	ID          int
	SetID       int
	Format      int16
	StartedAt   time.Time
	CompletedAt *time.Time
}

// ErrCardRaterNotFound is returned when no card_rater row matches.
var ErrCardRaterNotFound = errors.New("repository: card rater not found")

// ErrActiveCardRaterExists is returned when inserting a new active rater while one is already open.
var ErrActiveCardRaterExists = errors.New("repository: active card rater already exists")

// ListCardRaters returns card_rater rows, newest first. When activeOnly, only rows with completed_at IS NULL.
func (r *Repository) ListCardRaters(ctx context.Context, activeOnly bool) ([]CardRater, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	var q string
	if activeOnly {
		q = `SELECT id, set_id, format, started_at, completed_at FROM card_rater WHERE completed_at IS NULL ORDER BY id DESC`
	} else {
		q = `SELECT id, set_id, format, started_at, completed_at FROM card_rater ORDER BY id DESC`
	}
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list card raters: %w", err)
	}
	defer rows.Close()

	out := make([]CardRater, 0, 8)
	for rows.Next() {
		var row CardRater
		if err := rows.Scan(&row.ID, &row.SetID, &row.Format, &row.StartedAt, &row.CompletedAt); err != nil {
			return nil, fmt.Errorf("repository: list card raters scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list card raters rows: %w", err)
	}
	return out, nil
}

// GetCardRater returns one card_rater row by id.
func (r *Repository) GetCardRater(ctx context.Context, id int) (*CardRater, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `SELECT id, set_id, format, started_at, completed_at FROM card_rater WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	var cr CardRater
	err := row.Scan(&cr.ID, &cr.SetID, &cr.Format, &cr.StartedAt, &cr.CompletedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCardRaterNotFound
		}
		return nil, fmt.Errorf("repository: get card rater: %w", err)
	}
	return &cr, nil
}

// InsertCardRater inserts a new row with completed_at NULL. Fails if another active row exists.
func (r *Repository) InsertCardRater(ctx context.Context, setID int, format int16) (*CardRater, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO card_rater (set_id, format)
VALUES ($1, $2)
RETURNING id, set_id, format, started_at, completed_at`
	row := r.pool.QueryRow(ctx, q, setID, format)
	var cr CardRater
	err := row.Scan(&cr.ID, &cr.SetID, &cr.Format, &cr.StartedAt, &cr.CompletedAt)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, ErrActiveCardRaterExists
		}
		return nil, fmt.Errorf("repository: insert card rater: %w", err)
	}
	return &cr, nil
}

// CompleteActiveCardRater sets completed_at = now() on the row where completed_at IS NULL.
func (r *Repository) CompleteActiveCardRater(ctx context.Context) (bool, error) {
	if r.pool == nil {
		return false, fmt.Errorf("repository: pool is closed")
	}
	tag, err := r.pool.Exec(ctx, `UPDATE card_rater SET completed_at = now() WHERE completed_at IS NULL`)
	if err != nil {
		return false, fmt.Errorf("repository: complete active card rater: %w", err)
	}
	return tag.RowsAffected() > 0, nil
}
