package repository

import (
	"context"
	"fmt"
)

const RunawaysDraftSourceID = 3

// RunawaysDraftSetMeta is a set that has Runaways Draft decks.
type RunawaysDraftSetMeta struct {
	SetID     int
	SetName   string
	DeckCount int
}

// RunawaysDraftHeroMeta is a hero with Runaways Draft decks in a set.
type RunawaysDraftHeroMeta struct {
	HeroID    int
	HeroName  string
	DeckCount int
}

// RunawaysDraftCountBucket is a labeled count for breakdown charts.
type RunawaysDraftCountBucket struct {
	Label string
	Key   string
	Count int
}

// RunawaysDraftTypeBucket is a type/class/talent id bucket.
type RunawaysDraftTypeBucket struct {
	ID    int
	Count int
}

// RunawaysDraftCardStat is per-card pick stats across filtered decks.
type RunawaysDraftCardStat struct {
	CardID               int
	Name                 string
	CardIdentifier       *string
	ImageURL             *string
	Type                 int16
	Pitch                *int16
	Cost                 *int16
	Power                *int16
	Block                *int16
	Rarity               *int16
	TotalCopies          int
	DecksWithCard        int
	PickRate             float64
	AvgCopiesWhenPresent float64
}

// RunawaysDraftAvgBucket is average mainboard count per deck for a pitch/cost bucket.
type RunawaysDraftAvgBucket struct {
	Label    string
	Key      string
	AvgCount float64
}

// RunawaysDraftAnalytics is aggregated deck composition for a set + hero slice.
type RunawaysDraftAnalytics struct {
	DeckCount              int
	TotalCopies            int
	AvgCopiesPerDeck       float64
	AvgCost                *float64
	AvgPitch               *float64
	AvgPower               *float64
	AvgDefense             *float64
	PitchBreakdown         []RunawaysDraftCountBucket
	CostBreakdown          []RunawaysDraftCountBucket
	AvgDeckPitchBreakdown  []RunawaysDraftAvgBucket
	AvgDeckCostBreakdown   []RunawaysDraftAvgBucket
	TypeBreakdown          []RunawaysDraftTypeBucket
	Cards                  []RunawaysDraftCardStat
	MostPicked             []RunawaysDraftCardStat
	LeastPicked            []RunawaysDraftCardStat
}

// ListRunawaysDraftSets returns sets represented by decks with the given source id.
func (r *Repository) ListRunawaysDraftSets(ctx context.Context, deckSourceID int) ([]RunawaysDraftSetMeta, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT s.id, s.name, COUNT(d.id)::int AS deck_count
FROM decks d
INNER JOIN sets s ON s.id = d.set_id
WHERE d.deck_source_id = $1 AND d.set_id IS NOT NULL
GROUP BY s.id, s.name
ORDER BY s.name ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID)
	if err != nil {
		return nil, fmt.Errorf("repository: runaways draft sets: %w", err)
	}
	defer rows.Close()

	var out []RunawaysDraftSetMeta
	for rows.Next() {
		var row RunawaysDraftSetMeta
		if err := rows.Scan(&row.SetID, &row.SetName, &row.DeckCount); err != nil {
			return nil, fmt.Errorf("repository: scan runaways draft set: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: runaways draft sets rows: %w", err)
	}
	return out, nil
}

// ListRunawaysDraftHeroes returns heroes with decks for source + set.
func (r *Repository) ListRunawaysDraftHeroes(ctx context.Context, deckSourceID, setID int) ([]RunawaysDraftHeroMeta, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT h.id, h.name, COUNT(d.id)::int AS deck_count
FROM decks d
INNER JOIN heroes h ON h.id = d.hero_id
WHERE d.deck_source_id = $1 AND d.set_id = $2
GROUP BY h.id, h.name
ORDER BY h.name ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID)
	if err != nil {
		return nil, fmt.Errorf("repository: runaways draft heroes: %w", err)
	}
	defer rows.Close()

	var out []RunawaysDraftHeroMeta
	for rows.Next() {
		var row RunawaysDraftHeroMeta
		if err := rows.Scan(&row.HeroID, &row.HeroName, &row.DeckCount); err != nil {
			return nil, fmt.Errorf("repository: scan runaways draft hero: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: runaways draft heroes rows: %w", err)
	}
	return out, nil
}

const runawaysDraftDeckFilter = `
FROM decks d
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3`

const runawaysDraftCardJoin = `
FROM deck_cards dc
INNER JOIN cards c ON c.id = dc.card_id
` + cardPrintingLateralJoin + `
INNER JOIN decks d ON d.id = dc.deck_id`

const runawaysDraftCardWhere = `
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND dc.mainboard = true`

// RunawaysDraftAnalytics loads composition stats for decks matching source, set, and hero.
func (r *Repository) RunawaysDraftAnalytics(ctx context.Context, deckSourceID, setID, heroID int) (*RunawaysDraftAnalytics, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if deckSourceID <= 0 || setID <= 0 || heroID <= 0 {
		return nil, fmt.Errorf("repository: invalid runaways draft filter")
	}

	var deckCount int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*)::int `+runawaysDraftDeckFilter, deckSourceID, setID, heroID).Scan(&deckCount); err != nil {
		return nil, fmt.Errorf("repository: runaways draft deck count: %w", err)
	}

	out := &RunawaysDraftAnalytics{DeckCount: deckCount}
	if deckCount == 0 {
		return out, nil
	}

	if err := r.scanRunawaysDraftSummary(ctx, deckSourceID, setID, heroID, deckCount, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftPitchBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftCostBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftTypeBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftAvgDeckPitchBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftAvgDeckCostBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftCards(ctx, deckSourceID, setID, heroID, deckCount, out); err != nil {
		return nil, err
	}

	const pickLimit = 12
	if len(out.Cards) > 0 {
		most := append([]RunawaysDraftCardStat(nil), out.Cards...)
		least := append([]RunawaysDraftCardStat(nil), out.Cards...)
		sortRunawaysCardsByPick(most, true)
		sortRunawaysCardsByPick(least, false)
		if len(most) > pickLimit {
			most = most[:pickLimit]
		}
		if len(least) > pickLimit {
			least = least[:pickLimit]
		}
		out.MostPicked = most
		out.LeastPicked = least
	}

	return out, nil
}

func sortRunawaysCardsByPick(cards []RunawaysDraftCardStat, desc bool) {
	for i := 0; i < len(cards); i++ {
		for j := i + 1; j < len(cards); j++ {
			swap := false
			if desc {
				swap = cards[j].PickRate > cards[i].PickRate ||
					(cards[j].PickRate == cards[i].PickRate && cards[j].TotalCopies > cards[i].TotalCopies)
			} else {
				swap = cards[j].PickRate < cards[i].PickRate ||
					(cards[j].PickRate == cards[i].PickRate && cards[j].TotalCopies < cards[i].TotalCopies)
			}
			if swap {
				cards[i], cards[j] = cards[j], cards[i]
			}
		}
	}
}

func (r *Repository) scanRunawaysDraftSummary(ctx context.Context, deckSourceID, setID, heroID, deckCount int, out *RunawaysDraftAnalytics) error {
	const q = `
SELECT
  COALESCE(SUM(dc.count), 0)::int AS total_copies,
  COALESCE(SUM(dc.count)::float / $4, 0) AS avg_copies_per_deck,
  SUM(c.cost * dc.count)::float / NULLIF(SUM(CASE WHEN c.cost IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_cost,
  SUM(c.pitch * dc.count)::float / NULLIF(SUM(CASE WHEN c.pitch IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_pitch,
  SUM(c.power * dc.count)::float / NULLIF(SUM(CASE WHEN c.power IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_power,
  SUM(c.block * dc.count)::float / NULLIF(SUM(CASE WHEN c.block IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_defense
` + runawaysDraftCardJoin + runawaysDraftCardWhere

	return r.pool.QueryRow(ctx, q, deckSourceID, setID, heroID, deckCount).Scan(
		&out.TotalCopies,
		&out.AvgCopiesPerDeck,
		&out.AvgCost,
		&out.AvgPitch,
		&out.AvgPower,
		&out.AvgDefense,
	)
}

func (r *Repository) scanRunawaysDraftPitchBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
SELECT COALESCE(c.pitch::text, 'none') AS pitch_key, SUM(dc.count)::int AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
GROUP BY c.pitch
ORDER BY c.pitch NULLS LAST`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways pitch breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			return err
		}
		label := pitchLabel(key)
		out.PitchBreakdown = append(out.PitchBreakdown, RunawaysDraftCountBucket{Label: label, Key: key, Count: count})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftCostBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
SELECT COALESCE(c.cost::text, 'none') AS cost_key, SUM(dc.count)::int AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
GROUP BY c.cost
ORDER BY c.cost NULLS LAST`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways cost breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var count int
		if err := rows.Scan(&key, &count); err != nil {
			return err
		}
		label := costLabel(key)
		out.CostBreakdown = append(out.CostBreakdown, RunawaysDraftCountBucket{Label: label, Key: key, Count: count})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftTypeBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
SELECT c.type::int, SUM(dc.count)::int AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
GROUP BY c.type
ORDER BY cnt DESC, c.type ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways type breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return err
		}
		out.TypeBreakdown = append(out.TypeBreakdown, RunawaysDraftTypeBucket{ID: id, Count: count})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftAvgDeckPitchBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
WITH deck_pitch AS (
  SELECT d.id AS deck_id,
         COALESCE(c.pitch::text, 'none') AS pitch_key,
         SUM(dc.count)::float AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
  GROUP BY d.id, c.pitch
)
SELECT pitch_key, COALESCE(AVG(cnt), 0)::float8 AS avg_cnt
FROM deck_pitch
GROUP BY pitch_key
ORDER BY pitch_key`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways avg deck pitch breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var avgCount float64
		if err := rows.Scan(&key, &avgCount); err != nil {
			return err
		}
		out.AvgDeckPitchBreakdown = append(out.AvgDeckPitchBreakdown, RunawaysDraftAvgBucket{
			Label:    pitchLabel(key),
			Key:      key,
			AvgCount: avgCount,
		})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftAvgDeckCostBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
WITH deck_cost AS (
  SELECT d.id AS deck_id,
         COALESCE(c.cost::text, 'none') AS cost_key,
         SUM(dc.count)::float AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
  GROUP BY d.id, c.cost
)
SELECT cost_key, COALESCE(AVG(cnt), 0)::float8 AS avg_cnt
FROM deck_cost
GROUP BY cost_key
ORDER BY cost_key`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways avg deck cost breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var avgCount float64
		if err := rows.Scan(&key, &avgCount); err != nil {
			return err
		}
		out.AvgDeckCostBreakdown = append(out.AvgDeckCostBreakdown, RunawaysDraftAvgBucket{
			Label:    costLabel(key),
			Key:      key,
			AvgCount: avgCount,
		})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftCards(ctx context.Context, deckSourceID, setID, heroID, deckCount int, out *RunawaysDraftAnalytics) error {
	const q = `
SELECT
  c.id,
  c.name,
  c.card_identifier,
  cp.image_url,
  c.type,
  c.pitch,
  c.cost,
  c.power,
  c.block,
  cp.rarity,
  SUM(dc.count)::int AS total_copies,
  COUNT(DISTINCT dc.deck_id)::int AS decks_with_card,
  SUM(dc.count)::float / NULLIF(COUNT(DISTINCT dc.deck_id), 0) AS avg_copies_when_present
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
GROUP BY c.id, c.name, c.card_identifier, cp.image_url, c.type, c.pitch, c.cost, c.power, c.block, cp.rarity
ORDER BY decks_with_card DESC, total_copies DESC, c.name ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways card stats: %w", err)
	}
	defer rows.Close()

	deckF := float64(deckCount)
	for rows.Next() {
		var row RunawaysDraftCardStat
		if err := rows.Scan(
			&row.CardID, &row.Name, &row.CardIdentifier, &row.ImageURL,
			&row.Type, &row.Pitch, &row.Cost, &row.Power, &row.Block, &row.Rarity,
			&row.TotalCopies, &row.DecksWithCard, &row.AvgCopiesWhenPresent,
		); err != nil {
			return err
		}
		if deckF > 0 {
			row.PickRate = float64(row.DecksWithCard) / deckF
		}
		out.Cards = append(out.Cards, row)
	}
	return rows.Err()
}

func pitchLabel(key string) string {
	switch key {
	case "1":
		return "Red (1)"
	case "2":
		return "Yellow (2)"
	case "3":
		return "Blue (3)"
	case "none":
		return "No pitch"
	default:
		return key
	}
}

func costLabel(key string) string {
	if key == "none" {
		return "No cost"
	}
	return "Cost " + key
}
