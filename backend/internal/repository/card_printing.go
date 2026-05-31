package repository

import (
	"context"
	"fmt"
)

// CardPrinting is a row from card_printings.
type CardPrinting struct {
	ID       int
	CardID   int
	SetCode  string
	SetNum   int16
	Rarity   *int16
	ImageURL *string
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
SELECT id, card_id, set_code, set_num, rarity, image_url
FROM card_printings
WHERE card_id = ANY($1)
ORDER BY card_id ASC, id ASC`
	rows, err := r.pool.Query(ctx, q, cardIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list printings by card ids: %w", err)
	}
	defer rows.Close()

	out := make(map[int][]CardPrinting, len(cardIDs))
	for rows.Next() {
		var p CardPrinting
		if err := rows.Scan(&p.ID, &p.CardID, &p.SetCode, &p.SetNum, &p.Rarity, &p.ImageURL); err != nil {
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
