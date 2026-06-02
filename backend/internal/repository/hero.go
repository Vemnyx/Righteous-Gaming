package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
)

// ErrHeroNotFound is returned when no heroes row matches the lookup.
var ErrHeroNotFound = errors.New("repository: hero not found")

// Hero is a row from heroes.
type Hero struct {
	ID           int
	Name         string
	Type         int16
	Young        bool
	Classes      []int16
	Talents      []int16
	CardID       *int
	CardImageURL *string
	ArtImageURL  *string
}

// HeroByID loads one hero row.
func (r *Repository) HeroByID(ctx context.Context, id int) (*Hero, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return nil, fmt.Errorf("repository: invalid hero id")
	}

	const q = `
SELECT id, name, type, young, classes, talents, card_id, card_image_url, art_image_url
FROM heroes
WHERE id = $1`

	var h Hero
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&h.ID, &h.Name, &h.Type, &h.Young, &h.Classes, &h.Talents,
		&h.CardID, &h.CardImageURL, &h.ArtImageURL,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHeroNotFound
		}
		return nil, fmt.Errorf("repository: hero by id: %w", err)
	}
	return &h, nil
}

// HeroIDByCardID returns heroes.id for the hero row linked to a catalog card, if any.
func (r *Repository) HeroIDByCardID(ctx context.Context, cardID int) (int, error) {
	if r.pool == nil {
		return 0, fmt.Errorf("repository: pool is closed")
	}
	if cardID <= 0 {
		return 0, fmt.Errorf("repository: invalid card id")
	}

	const q = `SELECT id FROM heroes WHERE card_id = $1 ORDER BY id ASC LIMIT 1`

	var id int
	err := r.pool.QueryRow(ctx, q, cardID).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrHeroNotFound
		}
		return 0, fmt.Errorf("repository: hero by card id: %w", err)
	}
	return id, nil
}

// HeroIDByCardIdentifier returns heroes.id for a hero whose catalog card matches identifier (case-insensitive).
func (r *Repository) HeroIDByCardIdentifier(ctx context.Context, identifierLower string) (int, error) {
	ident := strings.ToLower(strings.TrimSpace(identifierLower))
	if ident == "" {
		return 0, fmt.Errorf("repository: empty card identifier")
	}

	idMap, err := r.ListCardIDsByIdentifierLower(ctx)
	if err != nil {
		return 0, err
	}
	cardID, ok := idMap[ident]
	if !ok {
		return 0, ErrHeroNotFound
	}
	return r.HeroIDByCardID(ctx, cardID)
}

// HeroArtCropRow is a hero with a source card image URL for portrait cropping.
type HeroArtCropRow struct {
	HeroID         int
	CardID         *int
	CardIdentifier *string
	CardImageURL   string
	CropCenterX    *float64
	CropCenterY    *float64
}

// HeroAdminRow is a hero row for the admin art tool.
type HeroAdminRow struct {
	ID              int
	Name            string
	CardIdentifier  *string
	CardImageURL    *string
	ArtImageURL     *string
	CropCenterX     *float64
	CropCenterY     *float64
}

// ListHeroesAdmin returns all heroes for the admin art UI.
func (r *Repository) ListHeroesAdmin(ctx context.Context) ([]HeroAdminRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, h.name, c.card_identifier, h.card_image_url, h.art_image_url, h.crop_center_x, h.crop_center_y
FROM heroes h
LEFT JOIN cards c ON c.id = h.card_id
ORDER BY h.name ASC, h.id ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list heroes admin: %w", err)
	}
	defer rows.Close()

	var out []HeroAdminRow
	for rows.Next() {
		var row HeroAdminRow
		if err := rows.Scan(
			&row.ID, &row.Name, &row.CardIdentifier, &row.CardImageURL, &row.ArtImageURL,
			&row.CropCenterX, &row.CropCenterY,
		); err != nil {
			return nil, fmt.Errorf("repository: list heroes admin scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list heroes admin rows: %w", err)
	}
	return out, nil
}

// ListHeroesForArtCrop returns heroes that have a non-empty card_image_url.
func (r *Repository) ListHeroesForArtCrop(ctx context.Context) ([]HeroArtCropRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, h.card_id, c.card_identifier, h.card_image_url, h.crop_center_x, h.crop_center_y
FROM heroes h
LEFT JOIN cards c ON c.id = h.card_id
WHERE h.card_image_url IS NOT NULL AND btrim(h.card_image_url) <> ''
ORDER BY h.id ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list heroes for art crop: %w", err)
	}
	defer rows.Close()

	var out []HeroArtCropRow
	for rows.Next() {
		var row HeroArtCropRow
		var cardID *int
		var ident *string
		if err := rows.Scan(&row.HeroID, &cardID, &ident, &row.CardImageURL, &row.CropCenterX, &row.CropCenterY); err != nil {
			return nil, fmt.Errorf("repository: list heroes for art crop scan: %w", err)
		}
		row.CardID = cardID
		row.CardIdentifier = ident
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list heroes for art crop rows: %w", err)
	}
	return out, nil
}

// UpdateHeroArtCrop updates art URL and optional normalized crop center.
func (r *Repository) UpdateHeroArtCrop(ctx context.Context, heroID int, artURL string, centerX, centerY float64) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if heroID <= 0 {
		return fmt.Errorf("repository: invalid hero id")
	}
	artURL = strings.TrimSpace(artURL)
	if artURL == "" {
		return fmt.Errorf("repository: empty art url")
	}
	const q = `
UPDATE heroes
SET art_image_url = $2, crop_center_x = $3, crop_center_y = $4
WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, heroID, artURL, centerX, centerY)
	if err != nil {
		return fmt.Errorf("repository: update hero art crop: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrHeroNotFound
	}
	return nil
}

// HeroIDByType returns a heroes.id for the given CardHero enum type (prefers adult, then lowest id).
func (r *Repository) HeroIDByType(ctx context.Context, heroType int16) (int, error) {
	if r.pool == nil {
		return 0, fmt.Errorf("repository: pool is closed")
	}

	const q = `
SELECT id FROM heroes
WHERE type = $1
ORDER BY young ASC, id ASC
LIMIT 1`

	var id int
	err := r.pool.QueryRow(ctx, q, heroType).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 0, ErrHeroNotFound
		}
		return 0, fmt.Errorf("repository: hero by type: %w", err)
	}
	return id, nil
}
