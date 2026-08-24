package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrMeetingNotFound is returned when no meetings row matches.
var ErrMeetingNotFound = errors.New("repository: meeting not found")

// ErrMeetingVideoExists is returned when attaching a video to a meeting that already has one.
var ErrMeetingVideoExists = errors.New("repository: meeting already has a video")

// Meeting is a row from meetings.
type Meeting struct {
	ID              int
	MeetingAt       time.Time
	Summary         string
	VideoURL        *string
	CreatedByUserID int
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// CreateMeetingInput holds fields for a new meeting.
type CreateMeetingInput struct {
	MeetingAt       time.Time
	Summary         string
	VideoURL        *string
	CreatedByUserID int
}

// ListMeetings returns meetings newest-first by meeting_at.
func (r *Repository) ListMeetings(ctx context.Context) ([]Meeting, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, meeting_at, summary, video_url, created_by_user_id, created_at, updated_at
FROM meetings
ORDER BY meeting_at DESC, id DESC`

	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list meetings: %w", err)
	}
	defer rows.Close()

	out := make([]Meeting, 0, 32)
	for rows.Next() {
		var m Meeting
		if err := rows.Scan(
			&m.ID, &m.MeetingAt, &m.Summary, &m.VideoURL, &m.CreatedByUserID, &m.CreatedAt, &m.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("repository: scan meeting: %w", err)
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list meetings rows: %w", err)
	}
	return out, nil
}

// CreateMeeting inserts a meeting and returns it.
func (r *Repository) CreateMeeting(ctx context.Context, in CreateMeetingInput) (*Meeting, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if in.CreatedByUserID <= 0 {
		return nil, fmt.Errorf("repository: invalid user id")
	}
	summary := strings.TrimSpace(in.Summary)
	if summary == "" {
		return nil, fmt.Errorf("repository: summary is required")
	}

	const q = `
INSERT INTO meetings (meeting_at, summary, video_url, created_by_user_id)
VALUES ($1, $2, $3, $4)
RETURNING id, meeting_at, summary, video_url, created_by_user_id, created_at, updated_at`

	var m Meeting
	err := r.pool.QueryRow(ctx, q, in.MeetingAt, summary, in.VideoURL, in.CreatedByUserID).Scan(
		&m.ID, &m.MeetingAt, &m.Summary, &m.VideoURL, &m.CreatedByUserID, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("repository: create meeting: %w", err)
	}
	return &m, nil
}

// MeetingByID loads one meeting.
func (r *Repository) MeetingByID(ctx context.Context, id int) (*Meeting, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return nil, fmt.Errorf("repository: invalid meeting id")
	}
	const q = `
SELECT id, meeting_at, summary, video_url, created_by_user_id, created_at, updated_at
FROM meetings
WHERE id = $1`

	var m Meeting
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&m.ID, &m.MeetingAt, &m.Summary, &m.VideoURL, &m.CreatedByUserID, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrMeetingNotFound
		}
		return nil, fmt.Errorf("repository: meeting by id: %w", err)
	}
	return &m, nil
}

// SetMeetingVideoURL sets video_url only when it is currently null.
func (r *Repository) SetMeetingVideoURL(ctx context.Context, id int, videoURL string) (*Meeting, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return nil, fmt.Errorf("repository: invalid meeting id")
	}
	videoURL = strings.TrimSpace(videoURL)
	if videoURL == "" {
		return nil, fmt.Errorf("repository: video url is required")
	}

	const q = `
UPDATE meetings
SET video_url = $2, updated_at = now()
WHERE id = $1 AND video_url IS NULL
RETURNING id, meeting_at, summary, video_url, created_by_user_id, created_at, updated_at`

	var m Meeting
	err := r.pool.QueryRow(ctx, q, id, videoURL).Scan(
		&m.ID, &m.MeetingAt, &m.Summary, &m.VideoURL, &m.CreatedByUserID, &m.CreatedAt, &m.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			existing, lookupErr := r.MeetingByID(ctx, id)
			if lookupErr != nil {
				return nil, lookupErr
			}
			if existing.VideoURL != nil && strings.TrimSpace(*existing.VideoURL) != "" {
				return nil, ErrMeetingVideoExists
			}
			return nil, ErrMeetingNotFound
		}
		return nil, fmt.Errorf("repository: set meeting video: %w", err)
	}
	return &m, nil
}
