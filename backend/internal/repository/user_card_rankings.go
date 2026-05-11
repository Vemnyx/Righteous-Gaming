package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// UserCardRanking is a row from user_card_rankings.
type UserCardRanking struct {
	UserID int
	SetID  int
	CardID int
	Format int16
	Rank   int16
	Notes  *string
}

// UserCardRankingWithCard is a ranking row joined to its card (and set name on the card).
type UserCardRankingWithCard struct {
	UserCardRanking
	Card Card
}

// ListUserCardRankingsWithCards returns ranked rows with full card rows for the user, set, and format.
func (r *Repository) ListUserCardRankingsWithCards(ctx context.Context, userID, setID int, format int16) ([]UserCardRankingWithCard, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	q := `
SELECT r.user_id, r.set_id, r.card_id, r.format, r.rank, r.notes,
` + cardSelectColumnsFromC + `, s.name AS set_name
FROM user_card_rankings r
INNER JOIN cards c ON c.id = r.card_id
INNER JOIN sets s ON s.id = c.set_id
WHERE r.user_id = $1 AND r.set_id = $2 AND r.format = $3
ORDER BY r.rank ASC, r.card_id ASC`
	rows, err := r.pool.Query(ctx, q, userID, setID, format)
	if err != nil {
		return nil, fmt.Errorf("repository: list user card rankings with cards: %w", err)
	}
	defer rows.Close()

	out := make([]UserCardRankingWithCard, 0, 64)
	for rows.Next() {
		var row UserCardRankingWithCard
		err := rows.Scan(
			&row.UserID,
			&row.SetID,
			&row.CardID,
			&row.Format,
			&row.Rank,
			&row.Notes,
			&row.Card.ID,
			&row.Card.SetID,
			&row.Card.Name,
			&row.Card.CardIdentifier,
			&row.Card.ImageURL,
			&row.Card.FunctionalText,
			&row.Card.Rarity,
			&row.Card.SetCode,
			&row.Card.SetNum,
			&row.Card.Type,
			&row.Card.Subtypes,
			&row.Card.Classes,
			&row.Card.Hybrid,
			&row.Card.Talents,
			&row.Card.Pitch,
			&row.Card.Cost,
			&row.Card.Power,
			&row.Card.Block,
			&row.Card.Heroes,
			&row.Card.Life,
			&row.Card.Intellect,
			&row.Card.Keywords,
			&row.Card.Formats,
			&row.Card.Specializations,
			&row.Card.Fusions,
			&row.Card.SetName,
		)
		if err != nil {
			return nil, fmt.Errorf("repository: list user card rankings with cards scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list user card rankings with cards rows: %w", err)
	}
	return out, nil
}

// ErrUserCardRankingNotFound is returned when no ranking row matches.
var ErrUserCardRankingNotFound = errors.New("repository: user card ranking not found")

// GetUserCardRanking returns one ranking row or ErrUserCardRankingNotFound.
func (r *Repository) GetUserCardRanking(ctx context.Context, userID, setID, cardID int, format int16) (*UserCardRanking, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT user_id, set_id, card_id, format, rank, notes
FROM user_card_rankings
WHERE user_id = $1 AND set_id = $2 AND card_id = $3 AND format = $4`
	dbRow := r.pool.QueryRow(ctx, q, userID, setID, cardID, format)
	var ranking UserCardRanking
	err := dbRow.Scan(&ranking.UserID, &ranking.SetID, &ranking.CardID, &ranking.Format, &ranking.Rank, &ranking.Notes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserCardRankingNotFound
		}
		return nil, fmt.Errorf("repository: get user card ranking: %w", err)
	}
	return &ranking, nil
}

// InsertUserCardRanking inserts a new ranking row.
func (r *Repository) InsertUserCardRanking(ctx context.Context, userID, setID, cardID int, format int16, rank int16, notes *string) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO user_card_rankings (user_id, set_id, card_id, format, rank, notes)
VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := r.pool.Exec(ctx, q, userID, setID, cardID, format, rank, notes)
	if err != nil {
		return fmt.Errorf("repository: insert user card ranking: %w", err)
	}
	return nil
}

// UpdateUserCardRankingNotes updates only the notes column for an existing row.
func (r *Repository) UpdateUserCardRankingNotes(ctx context.Context, userID, setID, cardID int, format int16, notes *string) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	const q = `
UPDATE user_card_rankings
SET notes = $5
WHERE user_id = $1 AND set_id = $2 AND card_id = $3 AND format = $4`
	tag, err := r.pool.Exec(ctx, q, userID, setID, cardID, format, notes)
	if err != nil {
		return fmt.Errorf("repository: update user card ranking notes: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUserCardRankingNotFound
	}
	return nil
}

// ListUnrankedCardsForUserSetFormat returns cards in the set that include the format in their
// formats array and have no user_card_rankings row for this user, set, and format.
func (r *Repository) ListUnrankedCardsForUserSetFormat(ctx context.Context, userID, setID int, format int16) ([]Card, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	q := cardSelectJoinSet + `
WHERE c.set_id = $1
  AND $2::smallint = ANY (c.formats)
  AND NOT EXISTS (
    SELECT 1 FROM user_card_rankings r
    WHERE r.user_id = $3 AND r.set_id = $1 AND r.format = $2 AND r.card_id = c.id
  )
ORDER BY c.set_num ASC, c.id ASC`
	rows, err := r.pool.Query(ctx, q, setID, format, userID)
	if err != nil {
		return nil, fmt.Errorf("repository: list unranked cards: %w", err)
	}
	defer rows.Close()

	out := make([]Card, 0, 128)
	for rows.Next() {
		c, err := scanCardWithSetName(rows)
		if err != nil {
			return nil, fmt.Errorf("repository: list unranked cards scan: %w", err)
		}
		out = append(out, *c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list unranked cards rows: %w", err)
	}
	return out, nil
}

// SetExists reports whether a set with the given id exists.
func (r *Repository) SetExists(ctx context.Context, setID int) (bool, error) {
	if r.pool == nil {
		return false, fmt.Errorf("repository: pool is closed")
	}
	var one int
	err := r.pool.QueryRow(ctx, `SELECT 1 FROM sets WHERE id = $1 LIMIT 1`, setID).Scan(&one)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, fmt.Errorf("repository: set exists: %w", err)
	}
	return true, nil
}
