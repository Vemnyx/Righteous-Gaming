package repository

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrEventNotFound = errors.New("event not found")
var ErrEventStreamNotFound = errors.New("event stream not found")

type Event struct {
	ID        int
	EventURL  string
	Title     string
	ImageURL  *string
	DateText  *string
	Venue     *string
	DayCount  int16
	CreatedAt time.Time
}

type EventStream struct {
	ID            int
	EventID       int
	DayNumber     int16
	URL           string
	Label         *string
	CoverageSlug  string
	YoutubeURL    *string
	CreatedAt     time.Time
}

type EventStreamComment struct {
	ID             int
	EventStreamID  int
	UserID         int
	Comment        string
	CreatedAt      time.Time
	OwnerUsername  *string
	OwnerEmail     string
}

type NamedUser struct {
	ID        int
	FirstName string
	LastName  string
	Email     string
	Username  *string
}

type CreateEventParams struct {
	EventURL string
	Title    string
	ImageURL *string
	DateText *string
	Venue    *string
	DayCount int16
}

type CreateEventStreamParams struct {
	EventID      int
	DayNumber    int16
	URL          string
	Label        *string
	CoverageSlug string
	YoutubeURL   *string
}

func (r *Repository) ListEvents(ctx context.Context) ([]Event, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, event_url, title, image_url, date_text, venue, day_count, created_at
FROM events
ORDER BY id DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.EventURL, &e.Title, &e.ImageURL, &e.DateText, &e.Venue, &e.DayCount, &e.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (r *Repository) GetEventByID(ctx context.Context, id int) (Event, error) {
	var e Event
	err := r.pool.QueryRow(ctx, `
SELECT id, event_url, title, image_url, date_text, venue, day_count, created_at
FROM events
WHERE id = $1`, id).Scan(&e.ID, &e.EventURL, &e.Title, &e.ImageURL, &e.DateText, &e.Venue, &e.DayCount, &e.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Event{}, ErrEventNotFound
	}
	return e, err
}

func (r *Repository) CreateEvent(ctx context.Context, p CreateEventParams) (Event, error) {
	var e Event
	err := r.pool.QueryRow(ctx, `
INSERT INTO events (event_url, title, image_url, date_text, venue, day_count)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, event_url, title, image_url, date_text, venue, day_count, created_at`,
		p.EventURL, p.Title, p.ImageURL, p.DateText, p.Venue, p.DayCount,
	).Scan(&e.ID, &e.EventURL, &e.Title, &e.ImageURL, &e.DateText, &e.Venue, &e.DayCount, &e.CreatedAt)
	return e, err
}

func (r *Repository) ListEventStreamsByEventID(ctx context.Context, eventID int) ([]EventStream, error) {
	rows, err := r.pool.Query(ctx, `
SELECT id, event_id, day_number, url, label, coverage_slug, youtube_url, created_at
FROM event_streams
WHERE event_id = $1
ORDER BY day_number ASC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventStream
	for rows.Next() {
		var s EventStream
		if err := rows.Scan(&s.ID, &s.EventID, &s.DayNumber, &s.URL, &s.Label, &s.CoverageSlug, &s.YoutubeURL, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func (r *Repository) GetEventStreamByID(ctx context.Context, id int) (EventStream, error) {
	var s EventStream
	err := r.pool.QueryRow(ctx, `
SELECT id, event_id, day_number, url, label, coverage_slug, youtube_url, created_at
FROM event_streams
WHERE id = $1`, id).Scan(&s.ID, &s.EventID, &s.DayNumber, &s.URL, &s.Label, &s.CoverageSlug, &s.YoutubeURL, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return EventStream{}, ErrEventStreamNotFound
	}
	return s, err
}

func (r *Repository) CreateEventStream(ctx context.Context, p CreateEventStreamParams) (EventStream, error) {
	var s EventStream
	err := r.pool.QueryRow(ctx, `
INSERT INTO event_streams (event_id, day_number, url, label, coverage_slug, youtube_url)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, event_id, day_number, url, label, coverage_slug, youtube_url, created_at`,
		p.EventID, p.DayNumber, p.URL, p.Label, p.CoverageSlug, p.YoutubeURL,
	).Scan(&s.ID, &s.EventID, &s.DayNumber, &s.URL, &s.Label, &s.CoverageSlug, &s.YoutubeURL, &s.CreatedAt)
	return s, err
}

func (r *Repository) UpdateEventStreamYoutubeURL(ctx context.Context, streamID int, youtubeURL *string) (EventStream, error) {
	var s EventStream
	err := r.pool.QueryRow(ctx, `
UPDATE event_streams
SET youtube_url = $2
WHERE id = $1
RETURNING id, event_id, day_number, url, label, coverage_slug, youtube_url, created_at`,
		streamID, youtubeURL,
	).Scan(&s.ID, &s.EventID, &s.DayNumber, &s.URL, &s.Label, &s.CoverageSlug, &s.YoutubeURL, &s.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return EventStream{}, ErrEventStreamNotFound
	}
	return s, err
}

func (r *Repository) ListEventStreamComments(ctx context.Context, streamID int) ([]EventStreamComment, error) {
	rows, err := r.pool.Query(ctx, `
SELECT c.id, c.event_stream_id, c.user_id, c.comment, c.created_at, u.username, u.email
FROM event_stream_comments c
JOIN users u ON u.id = c.user_id
WHERE c.event_stream_id = $1
ORDER BY c.created_at ASC`, streamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventStreamComment
	for rows.Next() {
		var c EventStreamComment
		if err := rows.Scan(&c.ID, &c.EventStreamID, &c.UserID, &c.Comment, &c.CreatedAt, &c.OwnerUsername, &c.OwnerEmail); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (r *Repository) CreateEventStreamComment(ctx context.Context, streamID, userID int, comment string) (EventStreamComment, error) {
	var c EventStreamComment
	err := r.pool.QueryRow(ctx, `
INSERT INTO event_stream_comments (event_stream_id, user_id, comment)
VALUES ($1, $2, $3)
RETURNING id, event_stream_id, user_id, comment, created_at`,
		streamID, userID, comment,
	).Scan(&c.ID, &c.EventStreamID, &c.UserID, &c.Comment, &c.CreatedAt)
	if err != nil {
		return EventStreamComment{}, err
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
