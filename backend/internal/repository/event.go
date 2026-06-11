package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrEventNotFound = errors.New("event not found")
var ErrEventDataNotFound = errors.New("event data not found")
var ErrEventRoundNotFound = errors.New("event round not found")

type Event struct {
	ID        int
	EventURL  string
	Title     string
	ImageURL  *string
	DateText  *string
	Venue     *string
	StartDate *time.Time
	EndDate   *time.Time
	CreatedAt time.Time
}

type EventData struct {
	ID            int
	EventID       int
	EventType     int16
	StartDate     time.Time
	EndDate       time.Time
	CoverageSlug  string
	CoverageURL   string
	Label         *string
	Format        *int16
	StreamURLs    []string
	CreatedAt     time.Time
}

type EventRound struct {
	ID          int
	EventDataID int
	RoundNumber int
	RoundLabel  *string
	Pairings    json.RawMessage
	Results     json.RawMessage
	Standings   json.RawMessage
	SyncedAt    time.Time
}

type EventDataComment struct {
	ID            int
	EventDataID   int
	UserID        int
	Comment       string
	CreatedAt     time.Time
	OwnerUsername *string
	OwnerEmail    string
}

type NamedUser struct {
	ID        int
	FirstName string
	LastName  string
	Email     string
	Username  *string
}

type CreateEventParams struct {
	EventURL  string
	Title     string
	ImageURL  *string
	DateText  *string
	Venue     *string
	StartDate *time.Time
	EndDate   *time.Time
}

type CreateEventDataParams struct {
	EventID      int
	EventType    int16
	StartDate    time.Time
	EndDate      time.Time
	CoverageSlug string
	CoverageURL  string
	Label        *string
	Format       *int16
	StreamURLs   []string
}

type CreateEventRoundParams struct {
	EventDataID int
	RoundNumber int
	RoundLabel  *string
	Pairings    json.RawMessage
	Results     json.RawMessage
	Standings   json.RawMessage
}

func scanEvent(row pgx.Row) (Event, error) {
	var e Event
	err := row.Scan(&e.ID, &e.EventURL, &e.Title, &e.ImageURL, &e.DateText, &e.Venue, &e.StartDate, &e.EndDate, &e.CreatedAt)
	return e, err
}

func decodeStreamURLs(raw []byte) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal(raw, &out); err != nil {
		return []string{}
	}
	return out
}

func (r *Repository) ListEvents(ctx context.Context) ([]Event, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, event_url, title, image_url, date_text, venue, start_date, end_date, created_at
FROM events
ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		e, err := scanEvent(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *Repository) GetEventByID(ctx context.Context, id int) (Event, error) {
	e, err := scanEvent(r.pool.QueryRow(ctx, `
SELECT id, event_url, title, image_url, date_text, venue, start_date, end_date, created_at
FROM events
WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Event{}, ErrEventNotFound
	}
	return e, err
}

func (r *Repository) CreateEvent(ctx context.Context, p CreateEventParams) (Event, error) {
	return scanEvent(r.pool.QueryRow(ctx, `
INSERT INTO events (event_url, title, image_url, date_text, venue, start_date, end_date)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, event_url, title, image_url, date_text, venue, start_date, end_date, created_at`,
		p.EventURL, p.Title, p.ImageURL, p.DateText, p.Venue, p.StartDate, p.EndDate,
	))
}

// DeleteEvent removes an event and cascades to event_data, rounds, and related rows.
func (r *Repository) DeleteEvent(ctx context.Context, id int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return fmt.Errorf("repository: invalid event id")
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM events WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("repository: delete event: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrEventNotFound
	}
	return nil
}

func (r *Repository) ListEventDataByEventID(ctx context.Context, eventID int) ([]EventData, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, event_id, event_type, start_date, end_date, coverage_slug, coverage_url, label, format, stream_urls, created_at
FROM event_data
WHERE event_id = $1
ORDER BY start_date ASC, id ASC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventData
	for rows.Next() {
		var ed EventData
		var raw []byte
		if err := rows.Scan(&ed.ID, &ed.EventID, &ed.EventType, &ed.StartDate, &ed.EndDate,
			&ed.CoverageSlug, &ed.CoverageURL, &ed.Label, &ed.Format, &raw, &ed.CreatedAt); err != nil {
			return nil, err
		}
		ed.StreamURLs = decodeStreamURLs(raw)
		out = append(out, ed)
	}
	return out, rows.Err()
}

func (r *Repository) GetEventDataByID(ctx context.Context, id int) (EventData, error) {
	var ed EventData
	var raw []byte
	err := r.pool.QueryRow(ctx, `
SELECT id, event_id, event_type, start_date, end_date, coverage_slug, coverage_url, label, format, stream_urls, created_at
FROM event_data
WHERE id = $1`, id).Scan(&ed.ID, &ed.EventID, &ed.EventType, &ed.StartDate, &ed.EndDate,
		&ed.CoverageSlug, &ed.CoverageURL, &ed.Label, &ed.Format, &raw, &ed.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return EventData{}, ErrEventDataNotFound
	}
	if err != nil {
		return EventData{}, err
	}
	ed.StreamURLs = decodeStreamURLs(raw)
	return ed, nil
}

func (r *Repository) ListActiveEventData(ctx context.Context, now time.Time) ([]EventData, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, event_id, event_type, start_date, end_date, coverage_slug, coverage_url, label, format, stream_urls, created_at
FROM event_data
WHERE start_date <= $1 AND end_date >= $1
ORDER BY id ASC`, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventData
	for rows.Next() {
		var ed EventData
		var raw []byte
		if err := rows.Scan(&ed.ID, &ed.EventID, &ed.EventType, &ed.StartDate, &ed.EndDate,
			&ed.CoverageSlug, &ed.CoverageURL, &ed.Label, &ed.Format, &raw, &ed.CreatedAt); err != nil {
			return nil, err
		}
		ed.StreamURLs = decodeStreamURLs(raw)
		out = append(out, ed)
	}
	return out, rows.Err()
}

func (r *Repository) CreateEventData(ctx context.Context, p CreateEventDataParams) (EventData, error) {
	raw, err := json.Marshal(p.StreamURLs)
	if err != nil {
		return EventData{}, err
	}
	var ed EventData
	var stored []byte
	err = r.pool.QueryRow(ctx, `
INSERT INTO event_data (event_id, event_type, start_date, end_date, coverage_slug, coverage_url, label, format, stream_urls)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
RETURNING id, event_id, event_type, start_date, end_date, coverage_slug, coverage_url, label, format, stream_urls, created_at`,
		p.EventID, p.EventType, p.StartDate, p.EndDate, p.CoverageSlug, p.CoverageURL, p.Label, p.Format, raw,
	).Scan(&ed.ID, &ed.EventID, &ed.EventType, &ed.StartDate, &ed.EndDate,
		&ed.CoverageSlug, &ed.CoverageURL, &ed.Label, &ed.Format, &stored, &ed.CreatedAt)
	if err != nil {
		return EventData{}, err
	}
	ed.StreamURLs = decodeStreamURLs(stored)
	return ed, nil
}

func (r *Repository) UpdateEventDataStreamURLs(ctx context.Context, id int, urls []string) (EventData, error) {
	raw, err := json.Marshal(urls)
	if err != nil {
		return EventData{}, err
	}
	var ed EventData
	var stored []byte
	err = r.pool.QueryRow(ctx, `
UPDATE event_data SET stream_urls = $2::jsonb WHERE id = $1
RETURNING id, event_id, event_type, start_date, end_date, coverage_slug, coverage_url, label, stream_urls, created_at`,
		id, raw,
	).Scan(&ed.ID, &ed.EventID, &ed.EventType, &ed.StartDate, &ed.EndDate,
		&ed.CoverageSlug, &ed.CoverageURL, &ed.Label, &stored, &ed.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return EventData{}, ErrEventDataNotFound
	}
	if err != nil {
		return EventData{}, err
	}
	ed.StreamURLs = decodeStreamURLs(stored)
	return ed, nil
}

func (r *Repository) ListEventRoundNumbers(ctx context.Context, eventDataID int) ([]int, error) {
	rows, err := r.pool.Query(ctx, `
SELECT round_number FROM event_rounds WHERE event_data_id = $1 ORDER BY round_number ASC`, eventDataID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int
	for rows.Next() {
		var n int
		if err := rows.Scan(&n); err != nil {
			return nil, err
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

func (r *Repository) ListEventRoundsByEventDataID(ctx context.Context, eventDataID int) ([]EventRound, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, event_data_id, round_number, round_label, pairings, results, standings, synced_at
FROM event_rounds
WHERE event_data_id = $1
ORDER BY round_number ASC`, eventDataID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventRound
	for rows.Next() {
		var er EventRound
		if err := rows.Scan(&er.ID, &er.EventDataID, &er.RoundNumber, &er.RoundLabel,
			&er.Pairings, &er.Results, &er.Standings, &er.SyncedAt); err != nil {
			return nil, err
		}
		out = append(out, er)
	}
	return out, rows.Err()
}

func (r *Repository) GetEventRound(ctx context.Context, eventDataID, roundNumber int) (EventRound, error) {
	var er EventRound
	err := r.pool.QueryRow(ctx, `
SELECT id, event_data_id, round_number, round_label, pairings, results, standings, synced_at
FROM event_rounds
WHERE event_data_id = $1 AND round_number = $2`, eventDataID, roundNumber).
		Scan(&er.ID, &er.EventDataID, &er.RoundNumber, &er.RoundLabel,
			&er.Pairings, &er.Results, &er.Standings, &er.SyncedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return EventRound{}, ErrEventRoundNotFound
	}
	return er, err
}

func (r *Repository) CreateEventRound(ctx context.Context, p CreateEventRoundParams) (EventRound, error) {
	var er EventRound
	err := r.pool.QueryRow(ctx, `
INSERT INTO event_rounds (event_data_id, round_number, round_label, pairings, results, standings)
VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
RETURNING id, event_data_id, round_number, round_label, pairings, results, standings, synced_at`,
		p.EventDataID, p.RoundNumber, p.RoundLabel, p.Pairings, p.Results, p.Standings,
	).Scan(&er.ID, &er.EventDataID, &er.RoundNumber, &er.RoundLabel,
		&er.Pairings, &er.Results, &er.Standings, &er.SyncedAt)
	return er, err
}

func (r *Repository) ListEventDataComments(ctx context.Context, eventDataID int) ([]EventDataComment, error) {
	rows, err := r.pool.Query(ctx, `
SELECT c.id, c.event_data_id, c.user_id, c.comment, c.created_at, u.username, u.email
FROM event_data_comments c
JOIN users u ON u.id = c.user_id
WHERE c.event_data_id = $1
ORDER BY c.created_at ASC`, eventDataID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventDataComment
	for rows.Next() {
		var c EventDataComment
		if err := rows.Scan(&c.ID, &c.EventDataID, &c.UserID, &c.Comment, &c.CreatedAt, &c.OwnerUsername, &c.OwnerEmail); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repository) CreateEventDataComment(ctx context.Context, eventDataID, userID int, comment string) (EventDataComment, error) {
	var c EventDataComment
	err := r.pool.QueryRow(ctx, `
INSERT INTO event_data_comments (event_data_id, user_id, comment)
VALUES ($1, $2, $3)
RETURNING id, event_data_id, user_id, comment, created_at`,
		eventDataID, userID, comment,
	).Scan(&c.ID, &c.EventDataID, &c.UserID, &c.Comment, &c.CreatedAt)
	if err != nil {
		return EventDataComment{}, err
	}
	err = r.pool.QueryRow(ctx, `SELECT username, email FROM users WHERE id = $1`, userID).
		Scan(&c.OwnerUsername, &c.OwnerEmail)
	return c, err
}

func (r *Repository) ListUsersWithNames(ctx context.Context) ([]NamedUser, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, first_name, last_name, email, username
FROM users
WHERE first_name IS NOT NULL AND btrim(first_name) <> ''
  AND last_name IS NOT NULL AND btrim(last_name) <> ''
ORDER BY id ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NamedUser
	for rows.Next() {
		var u NamedUser
		if err := rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Username); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}
