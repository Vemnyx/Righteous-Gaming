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

// HeroMatchRow is a minimal heroes row for FabTCG name matching.
type HeroMatchRow struct {
	ID    int
	Name  string
	Young bool
}

// HeroDisplayRow is used for event meta charts (name + art).
type HeroDisplayRow struct {
	ID          int
	Name        string
	ArtImageURL *string
}

// ListHeroDisplayRows returns hero id, name, and art for meta UI.
func (r *Repository) ListHeroDisplayRows(ctx context.Context) ([]HeroDisplayRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	rows, err := r.pool.Query(ctx, `
SELECT id, name, art_image_url
FROM heroes
ORDER BY id ASC`)
	if err != nil {
		return nil, fmt.Errorf("repository: list hero display rows: %w", err)
	}
	defer rows.Close()
	var out []HeroDisplayRow
	for rows.Next() {
		var h HeroDisplayRow
		if err := rows.Scan(&h.ID, &h.Name, &h.ArtImageURL); err != nil {
			return nil, fmt.Errorf("repository: scan hero display row: %w", err)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// ListHeroesForMatch returns all heroes for event coverage name resolution.
func (r *Repository) ListHeroesForMatch(ctx context.Context) ([]HeroMatchRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	rows, err := r.pool.Query(ctx, `
SELECT id, name, young
FROM heroes
ORDER BY young ASC, char_length(name) DESC, id ASC`)
	if err != nil {
		return nil, fmt.Errorf("repository: list heroes for match: %w", err)
	}
	defer rows.Close()
	var out []HeroMatchRow
	for rows.Next() {
		var h HeroMatchRow
		if err := rows.Scan(&h.ID, &h.Name, &h.Young); err != nil {
			return nil, fmt.Errorf("repository: scan hero for match: %w", err)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// HeroLegalInFormat reports whether the hero's linked catalog card includes the format.
func (r *Repository) HeroLegalInFormat(ctx context.Context, heroID int, format int16) (bool, error) {
	if r.pool == nil {
		return false, fmt.Errorf("repository: pool is closed")
	}
	if heroID <= 0 {
		return false, fmt.Errorf("repository: invalid hero id")
	}

	const q = `
SELECT EXISTS (
  SELECT 1
  FROM heroes h
  INNER JOIN cards c ON c.id = h.card_id
  WHERE h.id = $1 AND $2 = ANY (c.formats)
)`

	var ok bool
	if err := r.pool.QueryRow(ctx, q, heroID, format).Scan(&ok); err != nil {
		return false, fmt.Errorf("repository: hero legal in format: %w", err)
	}
	return ok, nil
}

// HeroArtCropRow is a hero with a source card image URL for portrait cropping.
type HeroArtCropRow struct {
	HeroID         int
	CardIdentifier *string
	CardImageURL   string
}

// ListHeroesForArtCrop returns heroes that have a non-empty card_image_url.
func (r *Repository) ListHeroesForArtCrop(ctx context.Context) ([]HeroArtCropRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, c.card_identifier, h.card_image_url
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
		if err := rows.Scan(&row.HeroID, &row.CardIdentifier, &row.CardImageURL); err != nil {
			return nil, fmt.Errorf("repository: list heroes for art crop scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list heroes for art crop rows: %w", err)
	}
	return out, nil
}

// UpdateHeroArtImageURL sets heroes.art_image_url for one row.
func (r *Repository) UpdateHeroArtImageURL(ctx context.Context, heroID int, artURL string) error {
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
	const q = `UPDATE heroes SET art_image_url = $2 WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q, heroID, artURL)
	if err != nil {
		return fmt.Errorf("repository: update hero art url: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrHeroNotFound
	}
	return nil
}
