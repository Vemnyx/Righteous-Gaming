package repository

import (
	"context"
	"fmt"
	"sort"
	"time"
)

const (
	runawaysMinTimedDecks       = 8
	runawaysMinPeriodDecks      = 3
	runawaysMinCardDecksForTrend = 4
	runawaysTrendPickLimit      = 12
)

// RunawaysDraftTimePeriod is one half of a median split by fabrary_created_at.
type RunawaysDraftTimePeriod struct {
	Label     string
	Key       string
	DeckCount int
	StartAt   *time.Time
	EndAt     *time.Time
}

// RunawaysDraftTimelineBucket is deck submission volume for one calendar day.
type RunawaysDraftTimelineBucket struct {
	Label     string
	Key       string
	DeckCount int
}

// RunawaysDraftCardTrend compares mainboard pick rate between early and late periods.
type RunawaysDraftCardTrend struct {
	CardID             int
	Name               string
	CardIdentifier     *string
	ImageURL           *string
	Type               int16
	Rarity             *int16
	EarlyPickRate      float64
	LatePickRate       float64
	PickRateDelta      float64
	EarlyDecksWithCard int
	LateDecksWithCard  int
	TotalDecksWithCard int
}

// RunawaysDraftCompositionTrend compares deck-level averages between periods.
type RunawaysDraftCompositionTrend struct {
	Metric     string
	EarlyValue *float64
	LateValue  *float64
	Delta      *float64
}

// RunawaysDraftTimeTrends summarizes pick-rate movement over submission time.
type RunawaysDraftTimeTrends struct {
	Available          bool
	TimedDeckCount     int
	UntimedDeckCount   int
	SplitAt            *time.Time
	Periods            []RunawaysDraftTimePeriod
	Timeline           []RunawaysDraftTimelineBucket
	RisingPicks        []RunawaysDraftCardTrend
	FallingPicks       []RunawaysDraftCardTrend
	CompositionTrends  []RunawaysDraftCompositionTrend
	MinDeckAppearances int
}

func (r *Repository) scanRunawaysDraftTimeTrends(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	trends := &RunawaysDraftTimeTrends{
		MinDeckAppearances: runawaysMinCardDecksForTrend,
	}
	out.TimeTrends = trends

	const untimedQ = `
SELECT COUNT(*)::int
FROM decks d
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NULL`
	if err := r.pool.QueryRow(ctx, untimedQ, deckSourceID, setID, heroID).Scan(&trends.UntimedDeckCount); err != nil {
		return fmt.Errorf("repository: runaways untimed deck count: %w", err)
	}

	const timedCountQ = `
SELECT COUNT(*)::int
FROM decks d
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL`
	if err := r.pool.QueryRow(ctx, timedCountQ, deckSourceID, setID, heroID).Scan(&trends.TimedDeckCount); err != nil {
		return fmt.Errorf("repository: runaways timed deck count: %w", err)
	}
	if trends.TimedDeckCount < runawaysMinTimedDecks {
		return nil
	}

	var splitAt time.Time
	const medianQ = `
SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY d.fabrary_created_at)
FROM decks d
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL`
	if err := r.pool.QueryRow(ctx, medianQ, deckSourceID, setID, heroID).Scan(&splitAt); err != nil {
		return fmt.Errorf("repository: runaways median split: %w", err)
	}
	trends.SplitAt = &splitAt

	const periodBoundsQ = `
SELECT
  CASE WHEN d.fabrary_created_at <= $4::timestamptz THEN 'early' ELSE 'late' END AS period,
  COUNT(*)::int,
  MIN(d.fabrary_created_at),
  MAX(d.fabrary_created_at)
FROM decks d
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL
GROUP BY 1
ORDER BY 1`
	periodRows, err := r.pool.Query(ctx, periodBoundsQ, deckSourceID, setID, heroID, splitAt)
	if err != nil {
		return fmt.Errorf("repository: runaways period bounds: %w", err)
	}
	defer periodRows.Close()

	periodCounts := map[string]int{}
	for periodRows.Next() {
		var key string
		var count int
		var startAt, endAt time.Time
		if err := periodRows.Scan(&key, &count, &startAt, &endAt); err != nil {
			return fmt.Errorf("repository: runaways period bounds scan: %w", err)
		}
		periodCounts[key] = count
		label := "Early submissions"
		if key == "late" {
			label = "Late submissions"
		}
		startCopy := startAt
		endCopy := endAt
		trends.Periods = append(trends.Periods, RunawaysDraftTimePeriod{
			Label:     label,
			Key:       key,
			DeckCount: count,
			StartAt:   &startCopy,
			EndAt:     &endCopy,
		})
	}
	if err := periodRows.Err(); err != nil {
		return err
	}
	if periodCounts["early"] < runawaysMinPeriodDecks || periodCounts["late"] < runawaysMinPeriodDecks {
		return nil
	}
	trends.Available = true

	const timelineQ = `
SELECT (d.fabrary_created_at AT TIME ZONE 'UTC')::date AS day, COUNT(*)::int
FROM decks d
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL
GROUP BY 1
ORDER BY 1 ASC`
	timelineRows, err := r.pool.Query(ctx, timelineQ, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways timeline: %w", err)
	}
	defer timelineRows.Close()
	for timelineRows.Next() {
		var day time.Time
		var count int
		if err := timelineRows.Scan(&day, &count); err != nil {
			return fmt.Errorf("repository: runaways timeline scan: %w", err)
		}
		key := day.Format("2006-01-02")
		trends.Timeline = append(trends.Timeline, RunawaysDraftTimelineBucket{
			Label:     day.Format("Jan 2"),
			Key:       key,
			DeckCount: count,
		})
	}
	if err := timelineRows.Err(); err != nil {
		return err
	}

	if err := r.scanRunawaysDraftCompositionTrends(ctx, deckSourceID, setID, heroID, splitAt, trends); err != nil {
		return err
	}
	if err := r.scanRunawaysDraftCardTrends(ctx, deckSourceID, setID, heroID, splitAt, periodCounts, trends); err != nil {
		return err
	}
	return nil
}

func (r *Repository) scanRunawaysDraftCompositionTrends(
	ctx context.Context,
	deckSourceID, setID, heroID int,
	splitAt time.Time,
	trends *RunawaysDraftTimeTrends,
) error {
	const q = `
WITH timed AS (
  SELECT d.id,
    CASE WHEN d.fabrary_created_at <= $4::timestamptz THEN 'early' ELSE 'late' END AS period
  FROM decks d
  WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL
),
deck_stats AS (
  SELECT
    t.period,
    SUM(c.cost * dc.count)::float / NULLIF(SUM(CASE WHEN c.cost IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_cost,
    SUM(c.pitch * dc.count)::float / NULLIF(SUM(CASE WHEN c.pitch IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_pitch
  FROM timed t
  INNER JOIN deck_cards dc ON dc.deck_id = t.id AND dc.mainboard = true
  INNER JOIN cards c ON c.id = dc.card_id
  WHERE c.type NOT IN (7, 14)
  GROUP BY t.id, t.period
)
SELECT period,
  AVG(avg_cost)::float8,
  AVG(avg_pitch)::float8
FROM deck_stats
GROUP BY period
ORDER BY period`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID, splitAt)
	if err != nil {
		return fmt.Errorf("repository: runaways composition trends: %w", err)
	}
	defer rows.Close()

	earlyCost, lateCost := (*float64)(nil), (*float64)(nil)
	earlyPitch, latePitch := (*float64)(nil), (*float64)(nil)
	for rows.Next() {
		var period string
		var avgCost, avgPitch *float64
		if err := rows.Scan(&period, &avgCost, &avgPitch); err != nil {
			return err
		}
		if period == "early" {
			earlyCost, earlyPitch = avgCost, avgPitch
		} else {
			lateCost, latePitch = avgCost, avgPitch
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	trends.CompositionTrends = []RunawaysDraftCompositionTrend{
		compositionTrend("avg_cost", "Avg card cost / deck", earlyCost, lateCost),
		compositionTrend("avg_pitch", "Avg pitch / deck", earlyPitch, latePitch),
	}
	return nil
}

func compositionTrend(metric, _ string, early, late *float64) RunawaysDraftCompositionTrend {
	row := RunawaysDraftCompositionTrend{
		Metric:     metric,
		EarlyValue: early,
		LateValue:  late,
	}
	if early != nil && late != nil {
		d := *late - *early
		row.Delta = &d
	}
	return row
}

func (r *Repository) scanRunawaysDraftCardTrends(
	ctx context.Context,
	deckSourceID, setID, heroID int,
	splitAt time.Time,
	periodCounts map[string]int,
	trends *RunawaysDraftTimeTrends,
) error {
	const q = `
WITH timed AS (
  SELECT d.id,
    CASE WHEN d.fabrary_created_at <= $4::timestamptz THEN 'early' ELSE 'late' END AS period
  FROM decks d
  WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND d.fabrary_created_at IS NOT NULL
)
SELECT
  c.id,
  c.name,
  c.card_identifier,
  cp.image_url,
  c.type,
  cp.rarity,
  COUNT(DISTINCT CASE WHEN t.period = 'early' THEN t.id END)::int AS early_decks,
  COUNT(DISTINCT CASE WHEN t.period = 'late' THEN t.id END)::int AS late_decks
FROM timed t
INNER JOIN deck_cards dc ON dc.deck_id = t.id AND dc.mainboard = true
INNER JOIN cards c ON c.id = dc.card_id
` + cardPrintingLateralJoin + `
GROUP BY c.id, c.name, c.card_identifier, cp.image_url, c.type, cp.rarity
HAVING COUNT(DISTINCT t.id) >= $5
ORDER BY c.name ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID, splitAt, runawaysMinCardDecksForTrend)
	if err != nil {
		return fmt.Errorf("repository: runaways card trends: %w", err)
	}
	defer rows.Close()

	earlyTotal := float64(periodCounts["early"])
	lateTotal := float64(periodCounts["late"])
	var cards []RunawaysDraftCardTrend
	for rows.Next() {
		var row RunawaysDraftCardTrend
		if err := rows.Scan(
			&row.CardID, &row.Name, &row.CardIdentifier, &row.ImageURL,
			&row.Type, &row.Rarity,
			&row.EarlyDecksWithCard, &row.LateDecksWithCard,
		); err != nil {
			return fmt.Errorf("repository: runaways card trends scan: %w", err)
		}
		row.TotalDecksWithCard = row.EarlyDecksWithCard + row.LateDecksWithCard
		if earlyTotal > 0 {
			row.EarlyPickRate = float64(row.EarlyDecksWithCard) / earlyTotal
		}
		if lateTotal > 0 {
			row.LatePickRate = float64(row.LateDecksWithCard) / lateTotal
		}
		row.PickRateDelta = row.LatePickRate - row.EarlyPickRate
		cards = append(cards, row)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	rising := append([]RunawaysDraftCardTrend(nil), cards...)
	falling := append([]RunawaysDraftCardTrend(nil), cards...)
	sortRunawaysCardTrends(rising, true)
	sortRunawaysCardTrends(falling, false)
	if len(rising) > runawaysTrendPickLimit {
		rising = rising[:runawaysTrendPickLimit]
	}
	if len(falling) > runawaysTrendPickLimit {
		falling = falling[:runawaysTrendPickLimit]
	}
	trends.RisingPicks = rising
	trends.FallingPicks = falling
	return nil
}

func sortRunawaysCardTrends(cards []RunawaysDraftCardTrend, rising bool) {
	sort.Slice(cards, func(i, j int) bool {
		if cards[i].PickRateDelta != cards[j].PickRateDelta {
			if rising {
				return cards[i].PickRateDelta > cards[j].PickRateDelta
			}
			return cards[i].PickRateDelta < cards[j].PickRateDelta
		}
		if cards[i].TotalDecksWithCard != cards[j].TotalDecksWithCard {
			return cards[i].TotalDecksWithCard > cards[j].TotalDecksWithCard
		}
		return cards[i].Name < cards[j].Name
	})
}
