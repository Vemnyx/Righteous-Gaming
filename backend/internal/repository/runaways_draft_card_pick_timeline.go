package repository

import (
	"context"
	"fmt"
	"time"
)

// RunawaysDraftCardPickTimelineBucket is daily mainboard pick rate for one card.
type RunawaysDraftCardPickTimelineBucket struct {
	Label         string
	Key           string
	DeckCount     int
	DecksWithCard int
	PickRate      float64
}

// RunawaysDraftCardPickTimeline is pick-rate movement for one card by submission day.
type RunawaysDraftCardPickTimeline struct {
	Available         bool
	Card              RunawaysDraftCardLite
	Buckets           []RunawaysDraftCardPickTimelineBucket
	UnavailableReason string
}

// RunawaysDraftCardPickTimeline loads daily pick rates for a card in a hero slice.
func (r *Repository) RunawaysDraftCardPickTimeline(
	ctx context.Context,
	deckSourceID, setID, heroID, cardID int,
) (*RunawaysDraftCardPickTimeline, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if deckSourceID <= 0 || setID <= 0 || heroID <= 0 || cardID <= 0 {
		return nil, fmt.Errorf("repository: invalid runaways draft card pick timeline filter")
	}

	out := &RunawaysDraftCardPickTimeline{
		Buckets: []RunawaysDraftCardPickTimelineBucket{},
	}

	const cardQ = `
SELECT c.id, c.name, c.card_identifier, cp.image_url
FROM cards c
` + cardPrintingLateralJoin + `
WHERE c.id = $1`
	if err := r.pool.QueryRow(ctx, cardQ, cardID).Scan(
		&out.Card.CardID, &out.Card.Name, &out.Card.CardIdentifier, &out.Card.ImageURL,
	); err != nil {
		return nil, fmt.Errorf("repository: runaways card pick timeline card: %w", err)
	}

	const q = `
SELECT
  (d.fabrary_created_at AT TIME ZONE 'UTC')::date AS day,
  COUNT(DISTINCT d.id)::int AS deck_count,
  COUNT(DISTINCT CASE WHEN dc.card_id IS NOT NULL THEN d.id END)::int AS decks_with_card
FROM decks d
LEFT JOIN deck_cards dc ON dc.deck_id = d.id AND dc.mainboard = true AND dc.card_id = $4
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL
GROUP BY 1
ORDER BY 1 ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID, cardID)
	if err != nil {
		return nil, fmt.Errorf("repository: runaways card pick timeline: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var day time.Time
		var deckCount, decksWithCard int
		if err := rows.Scan(&day, &deckCount, &decksWithCard); err != nil {
			return nil, fmt.Errorf("repository: runaways card pick timeline scan: %w", err)
		}
		var pickRate float64
		if deckCount > 0 {
			pickRate = float64(decksWithCard) / float64(deckCount)
		}
		out.Buckets = append(out.Buckets, RunawaysDraftCardPickTimelineBucket{
			Label:         day.Format("Jan 2"),
			Key:           day.Format("2006-01-02"),
			DeckCount:     deckCount,
			DecksWithCard: decksWithCard,
			PickRate:      pickRate,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if len(out.Buckets) == 0 {
		out.UnavailableReason = "No dated deck submissions for this hero."
		return out, nil
	}

	out.Available = true
	return out, nil
}
