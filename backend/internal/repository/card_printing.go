package repository

import (
	"context"
	"fmt"
	"strings"
)

// CardPrinting is a row from card_printings, optionally joined to sets for display name.
type CardPrinting struct {
	ID       int
	CardID   int
	SetCode  string
	SetNum   int16
	Rarity   *int16
	ImageURL *string
	SetName  string
}

// ListPrintingsByCardIDs returns printings grouped by card_id, ordered by id ascending.
func (r *Repository) ListPrintingsByCardIDs(ctx context.Context, cardIDs []int) (map[int][]CardPrinting, error) {
	if len(cardIDs) == 0 {
		return map[int][]CardPrinting{}, nil
	}
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT cp.id, cp.card_id, cp.set_code, cp.set_num, cp.rarity, cp.image_url, COALESCE(s.name, '') AS set_name
FROM card_printings cp
LEFT JOIN sets s ON s.code = cp.set_code
WHERE cp.card_id = ANY($1)
ORDER BY cp.card_id ASC, cp.id ASC`
	rows, err := r.pool.Query(ctx, q, cardIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list printings by card ids: %w", err)
	}
	defer rows.Close()

	out := make(map[int][]CardPrinting, len(cardIDs))
	for rows.Next() {
		var p CardPrinting
		if err := rows.Scan(&p.ID, &p.CardID, &p.SetCode, &p.SetNum, &p.Rarity, &p.ImageURL, &p.SetName); err != nil {
			return nil, fmt.Errorf("repository: list printings scan: %w", err)
		}
		out[p.CardID] = append(out[p.CardID], p)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list printings rows: %w", err)
	}
	return out, nil
}

// AttachPrintings loads printings for the given cards and sets Card.Printings on each.
func (r *Repository) AttachPrintings(ctx context.Context, cards []*Card) error {
	if len(cards) == 0 {
		return nil
	}
	ids := make([]int, 0, len(cards))
	seen := make(map[int]struct{}, len(cards))
	for _, c := range cards {
		if c == nil {
			continue
		}
		if _, ok := seen[c.ID]; ok {
			continue
		}
		seen[c.ID] = struct{}{}
		ids = append(ids, c.ID)
	}
	byCard, err := r.ListPrintingsByCardIDs(ctx, ids)
	if err != nil {
		return err
	}
	for _, c := range cards {
		if c == nil {
			continue
		}
		ps := byCard[c.ID]
		if ps == nil {
			c.Printings = []CardPrinting{}
		} else {
			c.Printings = ps
		}
	}
	return nil
}

// ListCardIDsByIdentifierLower maps lower(trim(card_identifier)) to card id.
func (r *Repository) ListCardIDsByIdentifierLower(ctx context.Context) (map[string]int, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, lower(trim(card_identifier))
FROM cards
WHERE card_identifier IS NOT NULL AND trim(card_identifier) <> ''`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list card ids by identifier: %w", err)
	}
	defer rows.Close()
	out := make(map[string]int)
	for rows.Next() {
		var id int
		var ident string
		if err := rows.Scan(&id, &ident); err != nil {
			return nil, fmt.Errorf("repository: list card ids by identifier scan: %w", err)
		}
		if ident != "" {
			out[ident] = id
		}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list card ids by identifier rows: %w", err)
	}
	return out, nil
}

// ListPrintingImageKeysByCardID returns existing image_url values per card_id (trimmed).
func (r *Repository) ListPrintingImageKeysByCardID(ctx context.Context) (map[int]map[string]struct{}, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `SELECT card_id, image_url FROM card_printings`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list printing image keys: %w", err)
	}
	defer rows.Close()
	out := make(map[int]map[string]struct{})
	for rows.Next() {
		var cardID int
		var imageURL *string
		if err := rows.Scan(&cardID, &imageURL); err != nil {
			return nil, fmt.Errorf("repository: list printing image keys scan: %w", err)
		}
		key := printingImageKey(imageURL)
		if out[cardID] == nil {
			out[cardID] = make(map[string]struct{})
		}
		out[cardID][key] = struct{}{}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list printing image keys rows: %w", err)
	}
	return out, nil
}

func printingImageKey(imageURL *string) string {
	if imageURL == nil {
		return ""
	}
	return strings.TrimSpace(*imageURL)
}

// InsertCardPrintings inserts printings for an existing card. Skips duplicates by image_url.
func (r *Repository) InsertCardPrintings(ctx context.Context, cardID int, printings []CreateCardPrintingInput, existingKeys map[string]struct{}) (int, error) {
	if r.pool == nil {
		return 0, fmt.Errorf("repository: pool is closed")
	}
	if len(printings) == 0 {
		return 0, nil
	}
	if existingKeys == nil {
		existingKeys = make(map[string]struct{})
	}
	const q = `
INSERT INTO card_printings (card_id, set_code, set_num, rarity, image_url)
VALUES ($1, $2, $3, $4, $5)`
	inserted := 0
	for _, p := range printings {
		key := printingImageKey(p.ImageURL)
		if _, ok := existingKeys[key]; ok {
			continue
		}
		if _, err := r.pool.Exec(ctx, q, cardID, p.SetCode, p.SetNum, p.Rarity, p.ImageURL); err != nil {
			return inserted, fmt.Errorf("repository: insert card printing: %w", err)
		}
		existingKeys[key] = struct{}{}
		inserted++
	}
	return inserted, nil
}
