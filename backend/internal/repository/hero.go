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
