package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrRecordingNotFound is returned when no recordings row matches.
var ErrRecordingNotFound = errors.New("repository: recording not found")

// Recording is a row from recordings with joined display fields.
type Recording struct {
	ID                   int
	UserID               int
	URL                  string
	Label                *string
	FirstHeroID          *int
	SecondHeroID         *int
	Format               int16
	StartSeconds         *int
	CreatedAt            time.Time
	OwnerUsername        *string
	OwnerEmail           string
	FirstHeroName        *string
	FirstHeroArtImageURL *string
	SecondHeroName       *string
	SecondHeroArtImageURL *string
}

// RecordingComment is a comment on a recording.
type RecordingComment struct {
	ID            int
	RecordingID   int
	UserID        int
	Comment       string
	CreatedAt     time.Time
	OwnerUsername *string
	OwnerEmail    string
}

// RecordingHeroMeta is a hero option for recording forms and filters.
type RecordingHeroMeta struct {
	ID          int
	Name        string
	ArtImageURL *string
	Formats     []int16
}

// RecordingUploaderMeta is a user who has uploaded at least one recording.
type RecordingUploaderMeta struct {
	ID       int
	Email    string
	Username *string
}

// ListRecordingsFilter scopes list/count queries.
type ListRecordingsFilter struct {
	Format *int16
	UserID *int
	HeroID *int
	Limit  int
	Offset int
}

// CreateRecordingInput inserts a new recording row.
type CreateRecordingInput struct {
	UserID       int
	URL          string
	Label        *string
	FirstHeroID  int
	SecondHeroID int
	Format       int16
	StartSeconds *int
}

const recordingSelectColumns = `
SELECT
  r.id,
  r.user_id,
  r.url,
  r.label,
  r.first_hero_id,
  r.second_hero_id,
  r.format,
  r.start_seconds,
  r.created_at,
  u.username,
  u.email,
  h1.name,
  h1.art_image_url,
  h2.name,
  h2.art_image_url
FROM recordings r
INNER JOIN users u ON u.id = r.user_id
LEFT JOIN heroes h1 ON h1.id = r.first_hero_id
LEFT JOIN heroes h2 ON h2.id = r.second_hero_id`

func scanRecording(row pgx.Row) (*Recording, error) {
	var rec Recording
	if err := row.Scan(
		&rec.ID, &rec.UserID, &rec.URL, &rec.Label,
		&rec.FirstHeroID, &rec.SecondHeroID, &rec.Format, &rec.StartSeconds, &rec.CreatedAt,
		&rec.OwnerUsername, &rec.OwnerEmail,
		&rec.FirstHeroName, &rec.FirstHeroArtImageURL,
		&rec.SecondHeroName, &rec.SecondHeroArtImageURL,
	); err != nil {
		return nil, err
	}
	return &rec, nil
}

func recordingFilterSQL(filter ListRecordingsFilter, startArg int) (where string, args []any) {
	var clauses []string
	args = make([]any, 0, 4)
	n := startArg
	if filter.Format != nil {
		clauses = append(clauses, fmt.Sprintf("r.format = $%d", n))
		args = append(args, *filter.Format)
		n++
	}
	if filter.UserID != nil {
		clauses = append(clauses, fmt.Sprintf("r.user_id = $%d", n))
		args = append(args, *filter.UserID)
		n++
	}
	if filter.HeroID != nil {
		clauses = append(clauses, fmt.Sprintf("(r.first_hero_id = $%d OR r.second_hero_id = $%d)", n, n))
		args = append(args, *filter.HeroID)
		n++
	}
	if len(clauses) == 0 {
		return "", args
	}
	return " WHERE " + strings.Join(clauses, " AND "), args
}

// CountRecordings returns total rows matching filter (ignores limit/offset).
func (r *Repository) CountRecordings(ctx context.Context, filter ListRecordingsFilter) (int, error) {
	if r.pool == nil {
		return 0, fmt.Errorf("repository: pool is closed")
	}
	where, args := recordingFilterSQL(filter, 1)
	var total int
	q := `SELECT COUNT(*)::int FROM recordings r` + where
	if err := r.pool.QueryRow(ctx, q, args...).Scan(&total); err != nil {
		return 0, fmt.Errorf("repository: count recordings: %w", err)
	}
	return total, nil
}

// ListRecordings returns recordings newest first.
func (r *Repository) ListRecordings(ctx context.Context, filter ListRecordingsFilter) ([]Recording, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 10
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	where, args := recordingFilterSQL(filter, 1)
	n := len(args) + 1
	q := recordingSelectColumns + where + fmt.Sprintf(`
ORDER BY r.created_at DESC, r.id DESC
LIMIT $%d OFFSET $%d`, n, n+1)
	args = append(args, limit, offset)

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("repository: list recordings: %w", err)
	}
	defer rows.Close()

	out := make([]Recording, 0, limit)
	for rows.Next() {
		rec, err := scanRecording(rows)
		if err != nil {
			return nil, fmt.Errorf("repository: scan recording: %w", err)
		}
		out = append(out, *rec)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list recordings rows: %w", err)
	}
	return out, nil
}

// GetRecordingByID loads one recording row.
func (r *Repository) GetRecordingByID(ctx context.Context, id int) (*Recording, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return nil, fmt.Errorf("repository: invalid recording id")
	}
	q := recordingSelectColumns + ` WHERE r.id = $1`
	rec, err := scanRecording(r.pool.QueryRow(ctx, q, id))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrRecordingNotFound
		}
		return nil, fmt.Errorf("repository: get recording: %w", err)
	}
	return rec, nil
}

// DeleteRecordingByID removes a recording. recording_comments cascade via FK.
func (r *Repository) DeleteRecordingByID(ctx context.Context, id int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return fmt.Errorf("repository: invalid recording id")
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM recordings WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("repository: delete recording: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrRecordingNotFound
	}
	return nil
}

// CreateRecording inserts a recording and returns the new row.
func (r *Repository) CreateRecording(ctx context.Context, in CreateRecordingInput) (*Recording, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO recordings (user_id, url, label, first_hero_id, second_hero_id, format, start_seconds)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id`

	var id int
	if err := r.pool.QueryRow(ctx, q,
		in.UserID, in.URL, in.Label, in.FirstHeroID, in.SecondHeroID, in.Format, in.StartSeconds,
	).Scan(&id); err != nil {
		return nil, fmt.Errorf("repository: create recording: %w", err)
	}
	return r.GetRecordingByID(ctx, id)
}

// ListRecordingComments returns comments for a recording oldest first.
func (r *Repository) ListRecordingComments(ctx context.Context, recordingID int) ([]RecordingComment, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT c.id, c.recording_id, c.user_id, c.comment, c.created_at, u.username, u.email
FROM recording_comments c
INNER JOIN users u ON u.id = c.user_id
WHERE c.recording_id = $1
ORDER BY c.created_at ASC, c.id ASC`

	rows, err := r.pool.Query(ctx, q, recordingID)
	if err != nil {
		return nil, fmt.Errorf("repository: list recording comments: %w", err)
	}
	defer rows.Close()

	out := make([]RecordingComment, 0, 16)
	for rows.Next() {
		var row RecordingComment
		if err := rows.Scan(
			&row.ID, &row.RecordingID, &row.UserID, &row.Comment, &row.CreatedAt,
			&row.OwnerUsername, &row.OwnerEmail,
		); err != nil {
			return nil, fmt.Errorf("repository: scan recording comment: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list recording comments rows: %w", err)
	}
	return out, nil
}

// CreateRecordingComment inserts a comment on a recording.
func (r *Repository) CreateRecordingComment(ctx context.Context, recordingID, userID int, comment string) (*RecordingComment, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	comment = strings.TrimSpace(comment)
	if recordingID <= 0 || userID <= 0 || comment == "" {
		return nil, fmt.Errorf("repository: invalid recording comment")
	}

	const q = `
INSERT INTO recording_comments (recording_id, user_id, comment)
VALUES ($1, $2, $3)
RETURNING id, recording_id, user_id, comment, created_at`

	var row RecordingComment
	row.UserID = userID
	if err := r.pool.QueryRow(ctx, q, recordingID, userID, comment).Scan(
		&row.ID, &row.RecordingID, &row.UserID, &row.Comment, &row.CreatedAt,
	); err != nil {
		return nil, fmt.Errorf("repository: create recording comment: %w", err)
	}

	u, err := r.UserByID(ctx, userID)
	if err != nil {
		return &row, nil
	}
	row.OwnerEmail = u.Email
	row.OwnerUsername = u.Username
	return &row, nil
}

// ListRecordingFormats returns distinct format values present in recordings.
func (r *Repository) ListRecordingFormats(ctx context.Context) ([]int16, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `SELECT DISTINCT format FROM recordings ORDER BY format ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list recording formats: %w", err)
	}
	defer rows.Close()

	out := make([]int16, 0, 8)
	for rows.Next() {
		var format int16
		if err := rows.Scan(&format); err != nil {
			return nil, fmt.Errorf("repository: scan recording format: %w", err)
		}
		out = append(out, format)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list recording formats rows: %w", err)
	}
	return out, nil
}

// ListRecordingFilterHeroes returns heroes that appear in recordings, with the formats they appear in.
func (r *Repository) ListRecordingFilterHeroes(ctx context.Context) ([]RecordingHeroMeta, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, h.name, h.art_image_url, COALESCE(array_agg(DISTINCT sub.format ORDER BY sub.format), '{}'::smallint[])
FROM heroes h
INNER JOIN (
	SELECT first_hero_id AS hero_id, format FROM recordings WHERE first_hero_id IS NOT NULL
	UNION
	SELECT second_hero_id AS hero_id, format FROM recordings WHERE second_hero_id IS NOT NULL
) sub ON sub.hero_id = h.id
GROUP BY h.id, h.name, h.art_image_url
ORDER BY h.name ASC, h.id ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list recording filter heroes: %w", err)
	}
	defer rows.Close()

	out := make([]RecordingHeroMeta, 0, 64)
	for rows.Next() {
		var row RecordingHeroMeta
		if err := rows.Scan(&row.ID, &row.Name, &row.ArtImageURL, &row.Formats); err != nil {
			return nil, fmt.Errorf("repository: scan recording filter hero: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list recording filter heroes rows: %w", err)
	}
	return out, nil
}

// ListRecordingHeroes returns heroes for recording pickers.
func (r *Repository) ListRecordingHeroes(ctx context.Context) ([]RecordingHeroMeta, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, h.name, h.art_image_url, COALESCE(c.formats, '{}'::smallint[])
FROM heroes h
LEFT JOIN cards c ON c.id = h.card_id
ORDER BY h.name ASC, h.id ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list recording heroes: %w", err)
	}
	defer rows.Close()

	out := make([]RecordingHeroMeta, 0, 64)
	for rows.Next() {
		var row RecordingHeroMeta
		if err := rows.Scan(&row.ID, &row.Name, &row.ArtImageURL, &row.Formats); err != nil {
			return nil, fmt.Errorf("repository: scan recording hero: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list recording heroes rows: %w", err)
	}
	return out, nil
}

// ListRecordingUploaders returns distinct users with at least one recording.
func (r *Repository) ListRecordingUploaders(ctx context.Context) ([]RecordingUploaderMeta, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT u.id, u.email, u.username
FROM users u
WHERE u.id IN (SELECT DISTINCT user_id FROM recordings)
ORDER BY COALESCE(NULLIF(TRIM(u.username), ''), u.email) ASC, u.id ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list recording uploaders: %w", err)
	}
	defer rows.Close()

	out := make([]RecordingUploaderMeta, 0, 32)
	for rows.Next() {
		var row RecordingUploaderMeta
		if err := rows.Scan(&row.ID, &row.Email, &row.Username); err != nil {
			return nil, fmt.Errorf("repository: scan recording uploader: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list recording uploaders rows: %w", err)
	}
	return out, nil
}
