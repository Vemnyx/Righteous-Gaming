package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	PlayTestingHeroSideWith    int16 = 0
	PlayTestingHeroSideAgainst int16 = 1

	PlayTestingSessionStatusOpen   int16 = 0
	PlayTestingSessionStatusClosed int16 = 1

	// PlayTestingOpenEndedDuration is how long "now"/open-ended sessions stay current.
	PlayTestingOpenEndedDuration = 24 * time.Hour
)

var (
	ErrPlayTestingSessionNotFound = errors.New("repository: play testing session not found")
	ErrPlayTestingSessionClosed   = errors.New("repository: play testing session is closed")
)

// PlayTestingHeroMeta is a hero option for play-testing pickers.
type PlayTestingHeroMeta struct {
	ID           int
	Name         string
	Young        bool
	CardImageURL *string
	ArtImageURL  *string
	Formats      []int16
}

// PlayTestingSessionHero is a hero attached to a session on one side.
type PlayTestingSessionHero struct {
	HeroID       int
	Side         int16
	Name         string
	Young        bool
	CardImageURL *string
	ArtImageURL  *string
}

// PlayTestingSessionTimeframe is one availability window on a session.
type PlayTestingSessionTimeframe struct {
	ID        int
	StartsAt  time.Time
	EndsAt    *time.Time
	SortOrder int
}

// PlayTestingSession is a play-testing session with nested heroes and timeframes.
type PlayTestingSession struct {
	ID             int
	UserID         int
	Format         int16
	Status         int16
	CreatedAt      time.Time
	ClosedAt       *time.Time
	OwnerFirstName *string
	OwnerUsername  *string
	Heroes         []PlayTestingSessionHero
	Timeframes     []PlayTestingSessionTimeframe
}

// CreatePlayTestingSessionInput creates a session and its children.
type CreatePlayTestingSessionInput struct {
	UserID        int
	Format        int16
	HeroesWith    []int
	HeroesAgainst []int
	Timeframes    []CreatePlayTestingTimeframeInput
}

// CreatePlayTestingTimeframeInput is one timeframe to insert.
type CreatePlayTestingTimeframeInput struct {
	StartsAt  time.Time
	EndsAt    *time.Time
	SortOrder int
}

// PlayTestingSessionBucket is the list filter for Looking For Games.
type PlayTestingSessionBucket string

const (
	PlayTestingBucketCurrent  PlayTestingSessionBucket = "current"
	PlayTestingBucketUpcoming PlayTestingSessionBucket = "upcoming"
	PlayTestingBucketPast     PlayTestingSessionBucket = "past"
)

// ClassifyPlayTestingSession returns current, upcoming, or past for a session at now.
// Closed sessions are always past. Sessions with no timeframes are current for 24h after
// creation, then past. Open-ended timeframes (null ends_at) last 24h from starts_at.
func ClassifyPlayTestingSession(s *PlayTestingSession, now time.Time) PlayTestingSessionBucket {
	if s == nil {
		return PlayTestingBucketPast
	}
	if s.Status == PlayTestingSessionStatusClosed {
		return PlayTestingBucketPast
	}

	type window struct{ start, end time.Time }
	windows := make([]window, 0, len(s.Timeframes)+1)
	if len(s.Timeframes) == 0 {
		windows = append(windows, window{
			start: s.CreatedAt,
			end:   s.CreatedAt.Add(PlayTestingOpenEndedDuration),
		})
	} else {
		for _, tf := range s.Timeframes {
			end := tf.StartsAt.Add(PlayTestingOpenEndedDuration)
			if tf.EndsAt != nil {
				end = *tf.EndsAt
			}
			windows = append(windows, window{start: tf.StartsAt, end: end})
		}
	}

	hasCurrent := false
	hasUpcoming := false
	for _, w := range windows {
		if !w.start.After(now) && !w.end.Before(now) {
			hasCurrent = true
		}
		if w.start.After(now) {
			hasUpcoming = true
		}
	}
	if hasCurrent {
		return PlayTestingBucketCurrent
	}
	if hasUpcoming {
		return PlayTestingBucketUpcoming
	}
	return PlayTestingBucketPast
}

// ListPlayTestingHeroes returns heroes with format legality and image URLs for pickers.
func (r *Repository) ListPlayTestingHeroes(ctx context.Context) ([]PlayTestingHeroMeta, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, h.name, h.young, h.card_image_url, h.art_image_url, COALESCE(c.formats, '{}'::smallint[])
FROM heroes h
LEFT JOIN cards c ON c.id = h.card_id
ORDER BY h.name ASC, h.id ASC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing heroes: %w", err)
	}
	defer rows.Close()

	out := make([]PlayTestingHeroMeta, 0, 64)
	for rows.Next() {
		var row PlayTestingHeroMeta
		if err := rows.Scan(&row.ID, &row.Name, &row.Young, &row.CardImageURL, &row.ArtImageURL, &row.Formats); err != nil {
			return nil, fmt.Errorf("repository: scan play testing hero: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing heroes rows: %w", err)
	}
	return out, nil
}

// ListPlayTestingSessions returns sessions newest-first with heroes and timeframes.
// When bucket is non-empty, only sessions in that lifecycle bucket are returned.
func (r *Repository) ListPlayTestingSessions(ctx context.Context, bucket PlayTestingSessionBucket) ([]PlayTestingSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT s.id, s.user_id, s.format, s.status, s.created_at, s.closed_at, u.first_name, u.username
FROM play_testing_sessions s
INNER JOIN users u ON u.id = s.user_id
ORDER BY s.created_at DESC, s.id DESC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing sessions: %w", err)
	}
	defer rows.Close()

	sessions := make([]PlayTestingSession, 0, 32)
	ids := make([]int, 0, 32)
	for rows.Next() {
		var s PlayTestingSession
		if err := rows.Scan(
			&s.ID, &s.UserID, &s.Format, &s.Status, &s.CreatedAt, &s.ClosedAt, &s.OwnerFirstName, &s.OwnerUsername,
		); err != nil {
			return nil, fmt.Errorf("repository: scan play testing session: %w", err)
		}
		s.Heroes = []PlayTestingSessionHero{}
		s.Timeframes = []PlayTestingSessionTimeframe{}
		sessions = append(sessions, s)
		ids = append(ids, s.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing sessions rows: %w", err)
	}
	if len(ids) == 0 {
		return sessions, nil
	}

	heroesBySession, err := r.listPlayTestingSessionHeroes(ctx, ids)
	if err != nil {
		return nil, err
	}
	timeframesBySession, err := r.listPlayTestingSessionTimeframes(ctx, ids)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	filtered := make([]PlayTestingSession, 0, len(sessions))
	for i := range sessions {
		if hs, ok := heroesBySession[sessions[i].ID]; ok {
			sessions[i].Heroes = hs
		}
		if ts, ok := timeframesBySession[sessions[i].ID]; ok {
			sessions[i].Timeframes = ts
		}
		if bucket == "" || ClassifyPlayTestingSession(&sessions[i], now) == bucket {
			filtered = append(filtered, sessions[i])
		}
	}
	return filtered, nil
}

func (r *Repository) listPlayTestingSessionHeroes(ctx context.Context, sessionIDs []int) (map[int][]PlayTestingSessionHero, error) {
	const q = `
SELECT sh.session_id, sh.hero_id, sh.side, h.name, h.young, h.card_image_url, h.art_image_url
FROM play_testing_session_heroes sh
INNER JOIN heroes h ON h.id = sh.hero_id
WHERE sh.session_id = ANY ($1)
ORDER BY sh.side ASC, h.name ASC, h.id ASC`

	rows, err := r.pool.Query(ctx, q, sessionIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing session heroes: %w", err)
	}
	defer rows.Close()

	out := make(map[int][]PlayTestingSessionHero, len(sessionIDs))
	for rows.Next() {
		var sessionID int
		var h PlayTestingSessionHero
		if err := rows.Scan(&sessionID, &h.HeroID, &h.Side, &h.Name, &h.Young, &h.CardImageURL, &h.ArtImageURL); err != nil {
			return nil, fmt.Errorf("repository: scan play testing session hero: %w", err)
		}
		out[sessionID] = append(out[sessionID], h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing session heroes rows: %w", err)
	}
	return out, nil
}

func (r *Repository) listPlayTestingSessionTimeframes(ctx context.Context, sessionIDs []int) (map[int][]PlayTestingSessionTimeframe, error) {
	const q = `
SELECT id, session_id, starts_at, ends_at, sort_order
FROM play_testing_session_timeframes
WHERE session_id = ANY ($1)
ORDER BY sort_order ASC, id ASC`

	rows, err := r.pool.Query(ctx, q, sessionIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing session timeframes: %w", err)
	}
	defer rows.Close()

	out := make(map[int][]PlayTestingSessionTimeframe, len(sessionIDs))
	for rows.Next() {
		var sessionID int
		var tf PlayTestingSessionTimeframe
		if err := rows.Scan(&tf.ID, &sessionID, &tf.StartsAt, &tf.EndsAt, &tf.SortOrder); err != nil {
			return nil, fmt.Errorf("repository: scan play testing session timeframe: %w", err)
		}
		out[sessionID] = append(out[sessionID], tf)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing session timeframes rows: %w", err)
	}
	return out, nil
}

// GetPlayTestingSessionByID returns one session with nested children.
func (r *Repository) GetPlayTestingSessionByID(ctx context.Context, sessionID int) (*PlayTestingSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if sessionID <= 0 {
		return nil, fmt.Errorf("repository: invalid session id")
	}
	const q = `
SELECT s.id, s.user_id, s.format, s.status, s.created_at, s.closed_at, u.first_name, u.username
FROM play_testing_sessions s
INNER JOIN users u ON u.id = s.user_id
WHERE s.id = $1`
	var s PlayTestingSession
	err := r.pool.QueryRow(ctx, q, sessionID).Scan(
		&s.ID, &s.UserID, &s.Format, &s.Status, &s.CreatedAt, &s.ClosedAt, &s.OwnerFirstName, &s.OwnerUsername,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPlayTestingSessionNotFound
		}
		return nil, fmt.Errorf("repository: get play testing session: %w", err)
	}
	s.Heroes = []PlayTestingSessionHero{}
	s.Timeframes = []PlayTestingSessionTimeframe{}
	heroesBySession, err := r.listPlayTestingSessionHeroes(ctx, []int{s.ID})
	if err != nil {
		return nil, err
	}
	timeframesBySession, err := r.listPlayTestingSessionTimeframes(ctx, []int{s.ID})
	if err != nil {
		return nil, err
	}
	if hs, ok := heroesBySession[s.ID]; ok {
		s.Heroes = hs
	}
	if ts, ok := timeframesBySession[s.ID]; ok {
		s.Timeframes = ts
	}
	return &s, nil
}

// ClosePlayTestingSession marks a session closed (past). Idempotent if already closed.
func (r *Repository) ClosePlayTestingSession(ctx context.Context, sessionID int) (*PlayTestingSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if sessionID <= 0 {
		return nil, fmt.Errorf("repository: invalid session id")
	}
	tag, err := r.pool.Exec(ctx, `
UPDATE play_testing_sessions
SET status = $2, closed_at = COALESCE(closed_at, now())
WHERE id = $1`, sessionID, PlayTestingSessionStatusClosed)
	if err != nil {
		return nil, fmt.Errorf("repository: close play testing session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrPlayTestingSessionNotFound
	}
	return r.GetPlayTestingSessionByID(ctx, sessionID)
}

// CreatePlayTestingSession inserts a session and children in one transaction.
// Timeframes may be empty (treated as "now" for 24 hours via classification).
func (r *Repository) CreatePlayTestingSession(ctx context.Context, in CreatePlayTestingSessionInput) (*PlayTestingSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if in.UserID <= 0 {
		return nil, fmt.Errorf("repository: invalid user id")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("repository: begin play testing session: %w", err)
	}
	defer tx.Rollback(ctx)

	const insertSession = `
INSERT INTO play_testing_sessions (user_id, format, status)
VALUES ($1, $2, $3)
RETURNING id, user_id, format, status, created_at, closed_at`

	var s PlayTestingSession
	if err := tx.QueryRow(ctx, insertSession, in.UserID, in.Format, PlayTestingSessionStatusOpen).Scan(
		&s.ID, &s.UserID, &s.Format, &s.Status, &s.CreatedAt, &s.ClosedAt,
	); err != nil {
		return nil, fmt.Errorf("repository: insert play testing session: %w", err)
	}

	const insertHero = `
INSERT INTO play_testing_session_heroes (session_id, hero_id, side)
VALUES ($1, $2, $3)`

	insertHeroes := func(ids []int, side int16) error {
		seen := make(map[int]struct{}, len(ids))
		for _, id := range ids {
			if id <= 0 {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			if _, err := tx.Exec(ctx, insertHero, s.ID, id, side); err != nil {
				return fmt.Errorf("repository: insert play testing session hero: %w", err)
			}
		}
		return nil
	}
	if err := insertHeroes(in.HeroesWith, PlayTestingHeroSideWith); err != nil {
		return nil, err
	}
	if err := insertHeroes(in.HeroesAgainst, PlayTestingHeroSideAgainst); err != nil {
		return nil, err
	}

	const insertTF = `
INSERT INTO play_testing_session_timeframes (session_id, starts_at, ends_at, sort_order)
VALUES ($1, $2, $3, $4)
RETURNING id, starts_at, ends_at, sort_order`

	s.Timeframes = make([]PlayTestingSessionTimeframe, 0, len(in.Timeframes))
	for i, tf := range in.Timeframes {
		sortOrder := tf.SortOrder
		if sortOrder == 0 {
			sortOrder = i
		}
		var row PlayTestingSessionTimeframe
		if err := tx.QueryRow(ctx, insertTF, s.ID, tf.StartsAt, tf.EndsAt, sortOrder).Scan(
			&row.ID, &row.StartsAt, &row.EndsAt, &row.SortOrder,
		); err != nil {
			return nil, fmt.Errorf("repository: insert play testing timeframe: %w", err)
		}
		s.Timeframes = append(s.Timeframes, row)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("repository: commit play testing session: %w", err)
	}

	const ownerQ = `SELECT first_name, username FROM users WHERE id = $1`
	if err := r.pool.QueryRow(ctx, ownerQ, s.UserID).Scan(&s.OwnerFirstName, &s.OwnerUsername); err != nil {
		return nil, fmt.Errorf("repository: load play testing session owner: %w", err)
	}

	heroesBySession, err := r.listPlayTestingSessionHeroes(ctx, []int{s.ID})
	if err != nil {
		return nil, err
	}
	if hs, ok := heroesBySession[s.ID]; ok {
		s.Heroes = hs
	} else {
		s.Heroes = []PlayTestingSessionHero{}
	}
	return &s, nil
}

// HeroesExistAndLegalInFormat verifies every hero id exists and is legal in format.
func (r *Repository) HeroesExistAndLegalInFormat(ctx context.Context, heroIDs []int, format int16) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	seen := make(map[int]struct{}, len(heroIDs))
	unique := make([]int, 0, len(heroIDs))
	for _, id := range heroIDs {
		if id <= 0 {
			return fmt.Errorf("repository: invalid hero id")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return nil
	}

	const q = `
SELECT h.id
FROM heroes h
INNER JOIN cards c ON c.id = h.card_id
WHERE h.id = ANY ($1) AND $2 = ANY (c.formats)`

	rows, err := r.pool.Query(ctx, q, unique, format)
	if err != nil {
		return fmt.Errorf("repository: heroes legal in format: %w", err)
	}
	defer rows.Close()

	found := make(map[int]struct{}, len(unique))
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return fmt.Errorf("repository: scan hero legal in format: %w", err)
		}
		found[id] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("repository: heroes legal in format rows: %w", err)
	}
	for _, id := range unique {
		if _, ok := found[id]; !ok {
			return fmt.Errorf("repository: hero %d is not legal in format %d", id, format)
		}
	}
	return nil
}
