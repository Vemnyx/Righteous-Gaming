package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"righteous-gaming/backend/internal/domain"

	"github.com/jackc/pgx/v5"
)

// ErrHeroNotFound is returned when no heroes row matches the lookup.
var ErrHeroNotFound = errors.New("repository: hero not found")

// ErrHeroCardAlreadyLinked is returned when a heroes row already references the card.
var ErrHeroCardAlreadyLinked = errors.New("repository: hero already exists for card")

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

// HeroDisplayRow is used for event meta charts (name + art + card).
type HeroDisplayRow struct {
	ID            int
	Name          string
	ArtImageURL   *string
	CardImageURL  *string
}

// ListHeroDisplayRows returns hero id, name, art, and card image for meta UI.
func (r *Repository) ListHeroDisplayRows(ctx context.Context) ([]HeroDisplayRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	rows, err := r.pool.Query(ctx, `
SELECT id, name, art_image_url, card_image_url
FROM heroes
ORDER BY id ASC`)
	if err != nil {
		return nil, fmt.Errorf("repository: list hero display rows: %w", err)
	}
	defer rows.Close()
	var out []HeroDisplayRow
	for rows.Next() {
		var h HeroDisplayRow
		if err := rows.Scan(&h.ID, &h.Name, &h.ArtImageURL, &h.CardImageURL); err != nil {
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

// HeroAdminRow is a hero row for the admin heroes UI.
type HeroAdminRow struct {
	ID             int
	Name           string
	Type           int16
	Young          bool
	Classes        []int16
	Talents        []int16
	CardID         *int
	CardIdentifier *string
	CardImageURL   *string
	ArtImageURL    *string
	CropCenterX    *float64
	CropCenterY    *float64
}

const heroAdminSelect = `
SELECT h.id, h.name, h.type, h.young, h.classes, h.talents, h.card_id,
       c.card_identifier, h.card_image_url, h.art_image_url, h.crop_center_x, h.crop_center_y
FROM heroes h
LEFT JOIN cards c ON c.id = h.card_id`

func scanHeroAdminRow(scan func(dest ...any) error) (HeroAdminRow, error) {
	var row HeroAdminRow
	err := scan(
		&row.ID, &row.Name, &row.Type, &row.Young, &row.Classes, &row.Talents, &row.CardID,
		&row.CardIdentifier, &row.CardImageURL, &row.ArtImageURL,
		&row.CropCenterX, &row.CropCenterY,
	)
	return row, err
}

// ListHeroesAdmin returns all heroes for the admin UI.
func (r *Repository) ListHeroesAdmin(ctx context.Context) ([]HeroAdminRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	q := heroAdminSelect + `
ORDER BY h.name ASC, h.id ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list heroes admin: %w", err)
	}
	defer rows.Close()

	var out []HeroAdminRow
	for rows.Next() {
		row, err := scanHeroAdminRow(rows.Scan)
		if err != nil {
			return nil, fmt.Errorf("repository: list heroes admin scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list heroes admin rows: %w", err)
	}
	return out, nil
}

// GetHeroAdminByID loads one hero for the admin UI.
func (r *Repository) GetHeroAdminByID(ctx context.Context, heroID int) (*HeroAdminRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if heroID <= 0 {
		return nil, fmt.Errorf("repository: invalid hero id")
	}
	q := heroAdminSelect + `
WHERE h.id = $1`
	row, err := scanHeroAdminRow(func(dest ...any) error {
		return r.pool.QueryRow(ctx, q, heroID).Scan(dest...)
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrHeroNotFound
		}
		return nil, fmt.Errorf("repository: get hero admin: %w", err)
	}
	return &row, nil
}

// HeroAdminUpdate is the editable fields for an admin hero PATCH.
type HeroAdminUpdate struct {
	Name         string
	Type         int16
	Young        bool
	Classes      []int16
	Talents      []int16
	CardID       *int
	CardImageURL *string
	ArtImageURL  *string
}

// UpdateHeroAdmin updates hero metadata for the admin UI.
func (r *Repository) UpdateHeroAdmin(ctx context.Context, heroID int, in HeroAdminUpdate) (*HeroAdminRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if heroID <= 0 {
		return nil, fmt.Errorf("repository: invalid hero id")
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return nil, fmt.Errorf("repository: empty hero name")
	}
	classes := in.Classes
	if classes == nil {
		classes = []int16{}
	}
	talents := in.Talents
	if talents == nil {
		talents = []int16{}
	}

	const q = `
UPDATE heroes
SET name = $2,
    type = $3,
    young = $4,
    classes = $5,
    talents = $6,
    card_id = $7,
    card_image_url = $8,
    art_image_url = $9
WHERE id = $1`
	tag, err := r.pool.Exec(ctx, q,
		heroID, name, in.Type, in.Young, classes, talents,
		in.CardID, in.CardImageURL, in.ArtImageURL,
	)
	if err != nil {
		return nil, fmt.Errorf("repository: update hero admin: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return nil, ErrHeroNotFound
	}
	return r.GetHeroAdminByID(ctx, heroID)
}

// MissingHeroCard is a catalog Hero card with no heroes.card_id row yet.
type MissingHeroCard struct {
	CardID         int
	Name           string
	CardIdentifier *string
	HeroType       *int16
	Young          bool
	Classes        []int16
	Talents        []int16
	CardImageURL   *string
	Eligible       bool
	SkipReason     string
}

// ListMissingHeroCards returns Hero-type cards that do not yet have a heroes row linked by card_id.
func (r *Repository) ListMissingHeroCards(ctx context.Context) ([]MissingHeroCard, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT
  c.id,
  c.name,
  c.card_identifier,
  CASE WHEN c.heroes IS NOT NULL AND cardinality(c.heroes) >= 1 THEN c.heroes[1] ELSE NULL END AS hero_type,
  COALESCE($1 = ANY (c.subtypes), false) AS young,
  COALESCE(c.classes, '{}'::smallint[]) AS classes,
  COALESCE(c.talents, '{}'::smallint[]) AS talents,
  (
    SELECT cp.image_url
    FROM card_printings cp
    WHERE cp.card_id = c.id
    ORDER BY cp.id ASC
    LIMIT 1
  ) AS card_image_url
FROM cards c
WHERE c.type = $2
  AND NOT EXISTS (SELECT 1 FROM heroes h WHERE h.card_id = c.id)
ORDER BY c.name ASC, c.id ASC`
	rows, err := r.pool.Query(ctx, q, int16(domain.CardSubtypeYoung), int16(domain.CardTypeHero))
	if err != nil {
		return nil, fmt.Errorf("repository: list missing hero cards: %w", err)
	}
	defer rows.Close()

	var out []MissingHeroCard
	for rows.Next() {
		var row MissingHeroCard
		if err := rows.Scan(
			&row.CardID, &row.Name, &row.CardIdentifier, &row.HeroType, &row.Young,
			&row.Classes, &row.Talents, &row.CardImageURL,
		); err != nil {
			return nil, fmt.Errorf("repository: list missing hero cards scan: %w", err)
		}
		name := strings.TrimSpace(row.Name)
		switch {
		case name == "":
			row.Eligible = false
			row.SkipReason = "card has empty name"
		case row.HeroType == nil:
			row.Eligible = false
			row.SkipReason = "card has no heroes enum"
		case !domain.CardHero(*row.HeroType).Valid():
			row.Eligible = false
			row.SkipReason = "card has invalid heroes enum"
		default:
			row.Eligible = true
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list missing hero cards rows: %w", err)
	}
	return out, nil
}

// CreateHeroFromCard inserts a heroes row for a Hero-type catalog card that is not already linked.
func (r *Repository) CreateHeroFromCard(ctx context.Context, cardID int) (*HeroAdminRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if cardID <= 0 {
		return nil, fmt.Errorf("repository: invalid card id")
	}

	const sel = `
SELECT
  c.name,
  CASE WHEN c.heroes IS NOT NULL AND cardinality(c.heroes) >= 1 THEN c.heroes[1] ELSE NULL END AS hero_type,
  COALESCE($2 = ANY (c.subtypes), false) AS young,
  COALESCE(c.classes, '{}'::smallint[]) AS classes,
  COALESCE(c.talents, '{}'::smallint[]) AS talents,
  (
    SELECT cp.image_url
    FROM card_printings cp
    WHERE cp.card_id = c.id
    ORDER BY cp.id ASC
    LIMIT 1
  ) AS card_image_url,
  EXISTS (SELECT 1 FROM heroes h WHERE h.card_id = c.id) AS already_linked,
  c.type
FROM cards c
WHERE c.id = $1`

	var (
		name           string
		heroType       *int16
		young          bool
		classes        []int16
		talents        []int16
		cardImageURL   *string
		alreadyLinked  bool
		cardType       int16
	)
	err := r.pool.QueryRow(ctx, sel, cardID, int16(domain.CardSubtypeYoung)).Scan(
		&name, &heroType, &young, &classes, &talents, &cardImageURL, &alreadyLinked, &cardType,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrCardNotFound
		}
		return nil, fmt.Errorf("repository: create hero from card load: %w", err)
	}
	if alreadyLinked {
		return nil, ErrHeroCardAlreadyLinked
	}
	if cardType != int16(domain.CardTypeHero) {
		return nil, fmt.Errorf("repository: card is not a hero card")
	}
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("repository: empty hero name")
	}
	if len(name) > 100 {
		name = name[:100]
	}
	if heroType == nil || !domain.CardHero(*heroType).Valid() {
		return nil, fmt.Errorf("repository: card has no valid heroes enum")
	}
	if classes == nil {
		classes = []int16{}
	}
	if talents == nil {
		talents = []int16{}
	}

	const ins = `
INSERT INTO heroes (name, type, young, classes, talents, card_id, card_image_url, art_image_url)
VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
RETURNING id`
	var heroID int
	if err := r.pool.QueryRow(ctx, ins, name, *heroType, young, classes, talents, cardID, cardImageURL).Scan(&heroID); err != nil {
		return nil, fmt.Errorf("repository: create hero from card insert: %w", err)
	}
	return r.GetHeroAdminByID(ctx, heroID)
}

// UpdateHeroArtCrop updates art URL and normalized crop center.
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
