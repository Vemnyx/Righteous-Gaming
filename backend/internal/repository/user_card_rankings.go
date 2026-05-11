package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// UserCardRating is a row from user_card_ratings.
type UserCardRating struct {
	UserID  int
	RaterID int
	CardID  int
	Rating  int16
	Notes   *string
}

// UserCardRatingWithCard is a rating row joined to its card (and set name on the card).
type UserCardRatingWithCard struct {
	UserCardRating
	Card Card
}

// ListUserCardRatingsWithCards returns rated rows with full card rows for the user and rater.
// Basic-rarity cards are omitted (they are not part of the rating experience).
// For Limited format (0), legendary (7) and fabled (8) rarities are omitted — see domain.CardRarity / CardFormat.
func (r *Repository) ListUserCardRatingsWithCards(ctx context.Context, userID, raterID int) ([]UserCardRatingWithCard, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	q := `
SELECT r.user_id, r.rater_id, r.card_id, r.rating, r.notes,
` + cardSelectColumnsFromC + `, s.name AS set_name
FROM user_card_ratings r
INNER JOIN card_rater cr ON cr.id = r.rater_id
INNER JOIN cards c ON c.id = r.card_id
INNER JOIN sets s ON s.id = c.set_id
WHERE r.user_id = $1 AND r.rater_id = $2
  AND (c.rarity IS NULL OR c.rarity <> 0)
  AND (cr.format <> 0 OR c.rarity IS NULL OR c.rarity NOT IN (7, 8))
ORDER BY r.rating ASC, r.card_id ASC`
	rows, err := r.pool.Query(ctx, q, userID, raterID)
	if err != nil {
		return nil, fmt.Errorf("repository: list user card ratings with cards: %w", err)
	}
	defer rows.Close()

	out := make([]UserCardRatingWithCard, 0, 64)
	for rows.Next() {
		var row UserCardRatingWithCard
		err := rows.Scan(
			&row.UserID,
			&row.RaterID,
			&row.CardID,
			&row.Rating,
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
			return nil, fmt.Errorf("repository: list user card ratings with cards scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list user card ratings with cards rows: %w", err)
	}
	return out, nil
}

// ErrUserCardRatingNotFound is returned when no rating row matches.
var ErrUserCardRatingNotFound = errors.New("repository: user card rating not found")

// GetUserCardRating returns one rating row or ErrUserCardRatingNotFound.
func (r *Repository) GetUserCardRating(ctx context.Context, userID, raterID, cardID int) (*UserCardRating, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT user_id, rater_id, card_id, rating, notes
FROM user_card_ratings
WHERE user_id = $1 AND rater_id = $2 AND card_id = $3`
	dbRow := r.pool.QueryRow(ctx, q, userID, raterID, cardID)
	var rating UserCardRating
	err := dbRow.Scan(&rating.UserID, &rating.RaterID, &rating.CardID, &rating.Rating, &rating.Notes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserCardRatingNotFound
		}
		return nil, fmt.Errorf("repository: get user card rating: %w", err)
	}
	return &rating, nil
}

// InsertUserCardRating inserts a new rating row.
func (r *Repository) InsertUserCardRating(ctx context.Context, userID, raterID, cardID int, rating int16, notes *string) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO user_card_ratings (user_id, rater_id, card_id, rating, notes)
VALUES ($1, $2, $3, $4, $5)`
	_, err := r.pool.Exec(ctx, q, userID, raterID, cardID, rating, notes)
	if err != nil {
		return fmt.Errorf("repository: insert user card rating: %w", err)
	}
	return nil
}

// UpdateUserCardRatingNotes updates only the notes column for an existing row.
func (r *Repository) UpdateUserCardRatingNotes(ctx context.Context, userID, raterID, cardID int, notes *string) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	const q = `
UPDATE user_card_ratings
SET notes = $4
WHERE user_id = $1 AND rater_id = $2 AND card_id = $3`
	tag, err := r.pool.Exec(ctx, q, userID, raterID, cardID, notes)
	if err != nil {
		return fmt.Errorf("repository: update user card rating notes: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrUserCardRatingNotFound
	}
	return nil
}

// ListUnrankedCardsForUserRater returns cards in the rater's set that include the rater's format in their
// formats array and have no user_card_ratings row for this user and rater.
// Basic-rarity cards (rarity = 0, domain.CardRarityBasic) are omitted.
// For Limited format (0), legendary (7) and fabled (8) are omitted.
func (r *Repository) ListUnrankedCardsForUserRater(ctx context.Context, userID, raterID int) ([]Card, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	q := cardSelectJoinSet + `
INNER JOIN card_rater cr ON cr.id = $2
WHERE c.set_id = cr.set_id
  AND cr.format = ANY (c.formats)
  AND (c.rarity IS NULL OR c.rarity <> 0)
  AND (cr.format <> 0 OR c.rarity IS NULL OR c.rarity NOT IN (7, 8))
  AND NOT EXISTS (
    SELECT 1 FROM user_card_ratings r
    WHERE r.user_id = $1 AND r.rater_id = $2 AND r.card_id = c.id
  )
ORDER BY c.set_num ASC, c.id ASC`
	rows, err := r.pool.Query(ctx, q, userID, raterID)
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

// CardTeamRatingRow is one user's rating for a card in a set+format (for team aggregate UI).
type CardTeamRatingRow struct {
	UserID   int
	CardID   int
	Username *string
	Email    string
	Rating   int16
	Notes    *string
}

// ListCardTeamRatings returns all users' ratings for one card/set/format, ordered for display.
// When len(rows) > 0, avg is the arithmetic mean of rating; otherwise avg is nil.
func (r *Repository) ListCardTeamRatings(ctx context.Context, setID, cardID int, format int16) ([]CardTeamRatingRow, *float64, error) {
	if r.pool == nil {
		return nil, nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT r.user_id, u.username, u.email, r.rating, r.notes
FROM user_card_ratings r
INNER JOIN card_rater cr ON cr.id = r.rater_id
INNER JOIN users u ON u.id = r.user_id
WHERE cr.set_id = $1 AND r.card_id = $2 AND cr.format = $3
ORDER BY COALESCE(NULLIF(TRIM(u.username), ''), u.email) ASC, r.user_id ASC`
	rows, err := r.pool.Query(ctx, q, setID, cardID, format)
	if err != nil {
		return nil, nil, fmt.Errorf("repository: list card team ratings: %w", err)
	}
	defer rows.Close()

	out := make([]CardTeamRatingRow, 0, 32)
	var sum float64
	for rows.Next() {
		var row CardTeamRatingRow
		if err := rows.Scan(&row.UserID, &row.Username, &row.Email, &row.Rating, &row.Notes); err != nil {
			return nil, nil, fmt.Errorf("repository: list card team ratings scan: %w", err)
		}
		row.CardID = cardID
		out = append(out, row)
		sum += float64(row.Rating)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("repository: list card team ratings rows: %w", err)
	}
	var avg *float64
	if len(out) > 0 {
		v := sum / float64(len(out))
		avg = &v
	}
	return out, avg, nil
}

// ListCardTeamRatingsForSetFormat returns all users' ratings for every card in a set+format.
func (r *Repository) ListCardTeamRatingsForSetFormat(ctx context.Context, setID int, format int16) ([]CardTeamRatingRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT r.user_id, r.card_id, u.username, u.email, r.rating, r.notes
FROM user_card_ratings r
INNER JOIN card_rater cr ON cr.id = r.rater_id
INNER JOIN users u ON u.id = r.user_id
WHERE cr.set_id = $1 AND cr.format = $2
ORDER BY r.card_id ASC, COALESCE(NULLIF(TRIM(u.username), ''), u.email) ASC, r.user_id ASC`
	rows, err := r.pool.Query(ctx, q, setID, format)
	if err != nil {
		return nil, fmt.Errorf("repository: list card team ratings for set format: %w", err)
	}
	defer rows.Close()

	out := make([]CardTeamRatingRow, 0, 128)
	for rows.Next() {
		var row CardTeamRatingRow
		if err := rows.Scan(&row.UserID, &row.CardID, &row.Username, &row.Email, &row.Rating, &row.Notes); err != nil {
			return nil, fmt.Errorf("repository: list card team ratings for set format scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list card team ratings for set format rows: %w", err)
	}
	return out, nil
}

// CardRaterSessionNote is a non-empty note for one card in one card_rater session.
type CardRaterSessionNote struct {
	UserID    int
	UserLabel string
	Rating    int16
	Notes     string
}

// ListCardRaterSessionNotes returns trimmed non-empty notes for a card in a rater session.
func (r *Repository) ListCardRaterSessionNotes(ctx context.Context, raterID, cardID int) ([]CardRaterSessionNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT r.user_id,
	COALESCE(NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'User ' || u.id::text),
	r.rating,
	TRIM(r.notes)
FROM user_card_ratings r
INNER JOIN users u ON u.id = r.user_id
WHERE r.rater_id = $1 AND r.card_id = $2
	AND r.notes IS NOT NULL AND btrim(r.notes) <> ''
ORDER BY r.user_id ASC`
	rows, err := r.pool.Query(ctx, q, raterID, cardID)
	if err != nil {
		return nil, fmt.Errorf("repository: list card rater session notes: %w", err)
	}
	defer rows.Close()
	out := make([]CardRaterSessionNote, 0, 32)
	for rows.Next() {
		var n CardRaterSessionNote
		if err := rows.Scan(&n.UserID, &n.UserLabel, &n.Rating, &n.Notes); err != nil {
			return nil, fmt.Errorf("repository: list card rater session notes scan: %w", err)
		}
		out = append(out, n)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list card rater session notes rows: %w", err)
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
