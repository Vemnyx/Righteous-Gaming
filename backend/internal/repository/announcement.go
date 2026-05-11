package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrAnnouncementNotFound is returned when no announcement matches the id.
var ErrAnnouncementNotFound = errors.New("repository: announcement not found")

// Announcement is a row from announcements.
type Announcement struct {
	ID          int
	Title       string
	ImageURL    *string
	YoutubeURL  *string
	BodyHTML    string
	PublishedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// AnnouncementSummary is a lightweight row for admin lists (no body_html).
type AnnouncementSummary struct {
	ID          int
	Title       string
	ImageURL    *string
	YoutubeURL  *string
	PublishedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// CreateAnnouncementInput holds fields for a new announcement.
type CreateAnnouncementInput struct {
	Title       string
	ImageURL    *string
	YoutubeURL  *string
	BodyHTML    string
	PublishedAt *time.Time
}

// UpdateAnnouncementInput replaces mutable fields on an announcement.
type UpdateAnnouncementInput struct {
	Title       string
	ImageURL    *string
	YoutubeURL  *string
	BodyHTML    string
	PublishedAt *time.Time
}

// CreateAnnouncement inserts a row and returns it.
func (r *Repository) CreateAnnouncement(ctx context.Context, in CreateAnnouncementInput) (*Announcement, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO announcements (title, image_url, youtube_url, body_html, published_at)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, title, image_url, youtube_url, body_html, published_at, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, in.Title, in.ImageURL, in.YoutubeURL, in.BodyHTML, in.PublishedAt)
	return scanAnnouncement(row)
}

func scanAnnouncement(row pgx.Row) (*Announcement, error) {
	var a Announcement
	if err := row.Scan(
		&a.ID, &a.Title, &a.ImageURL, &a.YoutubeURL, &a.BodyHTML, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAnnouncementNotFound
		}
		return nil, fmt.Errorf("repository: scan announcement: %w", err)
	}
	return &a, nil
}

// UpdateAnnouncement updates an announcement by id.
func (r *Repository) UpdateAnnouncement(ctx context.Context, id int, in UpdateAnnouncementInput) (*Announcement, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
UPDATE announcements
SET title = $2,
    image_url = $3,
    youtube_url = $4,
    body_html = $5,
    published_at = $6,
    updated_at = now()
WHERE id = $1
RETURNING id, title, image_url, youtube_url, body_html, published_at, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, id, in.Title, in.ImageURL, in.YoutubeURL, in.BodyHTML, in.PublishedAt)
	a, err := scanAnnouncement(row)
	if err != nil {
		if errors.Is(err, ErrAnnouncementNotFound) {
			return nil, ErrAnnouncementNotFound
		}
		return nil, err
	}
	return a, nil
}

// DeleteAnnouncement removes a row by id.
func (r *Repository) DeleteAnnouncement(ctx context.Context, id int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	cmd, err := r.pool.Exec(ctx, `DELETE FROM announcements WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("repository: delete announcement: %w", err)
	}
	if cmd.RowsAffected() == 0 {
		return ErrAnnouncementNotFound
	}
	return nil
}

// AnnouncementByID returns a row by id (published or not).
func (r *Repository) AnnouncementByID(ctx context.Context, id int) (*Announcement, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, title, image_url, youtube_url, body_html, published_at, created_at, updated_at
FROM announcements
WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	a, err := scanAnnouncement(row)
	if err != nil {
		return nil, err
	}
	return a, nil
}

// ListPublishedAnnouncements returns published rows with full body, newest first.
func (r *Repository) ListPublishedAnnouncements(ctx context.Context) ([]Announcement, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, title, image_url, youtube_url, body_html, published_at, created_at, updated_at
FROM announcements
WHERE published_at IS NOT NULL
ORDER BY published_at DESC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list published announcements: %w", err)
	}
	defer rows.Close()

	out := make([]Announcement, 0, 32)
	for rows.Next() {
		var a Announcement
		if err := rows.Scan(
			&a.ID, &a.Title, &a.ImageURL, &a.YoutubeURL, &a.BodyHTML, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("repository: list published announcements scan: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list published announcements rows: %w", err)
	}
	return out, nil
}

// ListAllSummaries returns every announcement without body_html for admin lists.
func (r *Repository) ListAllSummaries(ctx context.Context) ([]AnnouncementSummary, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, title, image_url, youtube_url, published_at, created_at, updated_at
FROM announcements
ORDER BY updated_at DESC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list all summaries: %w", err)
	}
	defer rows.Close()

	out := make([]AnnouncementSummary, 0, 32)
	for rows.Next() {
		var a AnnouncementSummary
		if err := rows.Scan(
			&a.ID, &a.Title, &a.ImageURL, &a.YoutubeURL, &a.PublishedAt, &a.CreatedAt, &a.UpdatedAt,
		); err != nil {
			return nil, fmt.Errorf("repository: list all summaries scan: %w", err)
		}
		out = append(out, a)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list all summaries rows: %w", err)
	}
	return out, nil
}
