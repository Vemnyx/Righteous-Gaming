package repository

import (
	"context"
	"fmt"
	"strconv"

	"righteous-gaming/backend/internal/domain"
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
	AvgCostPerDeck         *float64
	AvgPitchPerDeck        *float64
	AvgDeckPitchBreakdown      []RunawaysDraftAvgBucket
	AvgDeckCostBreakdown       []RunawaysDraftAvgBucket
	AvgDeckTypeBreakdown       []RunawaysDraftAvgBucket
	AvgDeckBlockBreakdown []RunawaysDraftAvgBucket
	Cards                  []RunawaysDraftCardStat
	MostPicked             []RunawaysDraftCardStat
	LeastPicked            []RunawaysDraftCardStat
	TopSideboard           []RunawaysDraftCardStat
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

const runawaysDraftInventoryCardWhere = `
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3 AND dc.mainboard = false`

// Distribution stats exclude arena equipment and weapons; card type breakdown includes all types.
const runawaysDraftDistributionCardFilter = ` AND c.type NOT IN (7, 14)` // domain.CardTypeEquipment, domain.CardTypeWeapon

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

	if err := r.scanRunawaysDraftPerDeckAverages(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftAvgDeckPitchBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftAvgDeckCostBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftAvgDeckTypeBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftAvgDeckBlockBreakdown(ctx, deckSourceID, setID, heroID, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftCards(ctx, deckSourceID, setID, heroID, deckCount, out); err != nil {
		return nil, err
	}
	if err := r.scanRunawaysDraftTopSideboard(ctx, deckSourceID, setID, heroID, deckCount, out); err != nil {
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

func (r *Repository) scanRunawaysDraftPerDeckAverages(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
WITH deck_stats AS (
  SELECT
    d.id AS deck_id,
    SUM(c.cost * dc.count)::float / NULLIF(SUM(CASE WHEN c.cost IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_cost,
    SUM(c.pitch * dc.count)::float / NULLIF(SUM(CASE WHEN c.pitch IS NOT NULL THEN dc.count ELSE 0 END), 0) AS avg_pitch
` + runawaysDraftCardJoin + runawaysDraftCardWhere + runawaysDraftDistributionCardFilter + `
  GROUP BY d.id
)
SELECT AVG(avg_cost), AVG(avg_pitch)
FROM deck_stats`

	return r.pool.QueryRow(ctx, q, deckSourceID, setID, heroID).Scan(&out.AvgCostPerDeck, &out.AvgPitchPerDeck)
}

func (r *Repository) scanRunawaysDraftAvgDeckPitchBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
WITH deck_pitch AS (
  SELECT d.id AS deck_id,
         COALESCE(c.pitch::text, 'none') AS pitch_key,
         SUM(dc.count)::float AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + runawaysDraftDistributionCardFilter + `
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
` + runawaysDraftCardJoin + runawaysDraftCardWhere + runawaysDraftDistributionCardFilter + `
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

func (r *Repository) scanRunawaysDraftAvgDeckTypeBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
WITH deck_type AS (
  SELECT d.id AS deck_id,
         c.type::int AS type_id,
         SUM(dc.count)::float AS cnt
` + runawaysDraftCardJoin + runawaysDraftCardWhere + `
  GROUP BY d.id, c.type
)
SELECT type_id::text, COALESCE(AVG(cnt), 0)::float8 AS avg_cnt
FROM deck_type
GROUP BY type_id
ORDER BY avg_cnt DESC, type_id ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways avg deck type breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var avgCount float64
		if err := rows.Scan(&key, &avgCount); err != nil {
			return err
		}
		out.AvgDeckTypeBreakdown = append(out.AvgDeckTypeBreakdown, RunawaysDraftAvgBucket{
			Label:    typeLabel(key),
			Key:      key,
			AvgCount: avgCount,
		})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftAvgDeckBlockBreakdown(ctx context.Context, deckSourceID, setID, heroID int, out *RunawaysDraftAnalytics) error {
	const q = `
WITH per_deck AS (
  SELECT d.id AS deck_id,
         SUM(CASE WHEN c.block = 3 THEN dc.count ELSE 0 END)::float AS cnt_3,
         SUM(CASE WHEN c.block = 2 THEN dc.count ELSE 0 END)::float AS cnt_2,
         SUM(CASE WHEN c.block IS NULL THEN dc.count ELSE 0 END)::float AS cnt_none
` + runawaysDraftCardJoin + runawaysDraftCardWhere + runawaysDraftDistributionCardFilter + `
  GROUP BY d.id
)
SELECT block_key, COALESCE(AVG(cnt), 0)::float8 AS avg_cnt
FROM (
  SELECT '3' AS block_key, cnt_3 AS cnt FROM per_deck
  UNION ALL SELECT '2', cnt_2 FROM per_deck
  UNION ALL SELECT 'none', cnt_none FROM per_deck
) buckets
GROUP BY block_key
ORDER BY CASE block_key WHEN '3' THEN 0 WHEN '2' THEN 1 WHEN 'none' THEN 2 ELSE 3 END, block_key`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return fmt.Errorf("repository: runaways avg deck block breakdown: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var key string
		var avgCount float64
		if err := rows.Scan(&key, &avgCount); err != nil {
			return err
		}
		out.AvgDeckBlockBreakdown = append(out.AvgDeckBlockBreakdown, RunawaysDraftAvgBucket{
			Label:    blockLabel(key),
			Key:      key,
			AvgCount: avgCount,
		})
	}
	return rows.Err()
}

func (r *Repository) scanRunawaysDraftCards(ctx context.Context, deckSourceID, setID, heroID, deckCount int, out *RunawaysDraftAnalytics) error {
	cards, err := r.queryRunawaysDraftCardStats(ctx, deckSourceID, setID, heroID, deckCount, runawaysDraftCardWhere)
	if err != nil {
		return err
	}
	out.Cards = cards
	return nil
}

func (r *Repository) scanRunawaysDraftTopSideboard(ctx context.Context, deckSourceID, setID, heroID, deckCount int, out *RunawaysDraftAnalytics) error {
	cards, err := r.queryRunawaysDraftCardStats(ctx, deckSourceID, setID, heroID, deckCount, runawaysDraftInventoryCardWhere)
	if err != nil {
		return err
	}
	const sideboardLimit = 10
	if len(cards) > sideboardLimit {
		cards = cards[:sideboardLimit]
	}
	out.TopSideboard = cards
	return nil
}

func (r *Repository) queryRunawaysDraftCardStats(ctx context.Context, deckSourceID, setID, heroID, deckCount int, whereClause string) ([]RunawaysDraftCardStat, error) {
	q := `
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
` + runawaysDraftCardJoin + whereClause + `
GROUP BY c.id, c.name, c.card_identifier, cp.image_url, c.type, c.pitch, c.cost, c.power, c.block, cp.rarity
ORDER BY decks_with_card DESC, total_copies DESC, c.name ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: runaways card stats: %w", err)
	}
	defer rows.Close()

	deckF := float64(deckCount)
	out := make([]RunawaysDraftCardStat, 0, 64)
	for rows.Next() {
		var row RunawaysDraftCardStat
		if err := rows.Scan(
			&row.CardID, &row.Name, &row.CardIdentifier, &row.ImageURL,
			&row.Type, &row.Pitch, &row.Cost, &row.Power, &row.Block, &row.Rarity,
			&row.TotalCopies, &row.DecksWithCard, &row.AvgCopiesWhenPresent,
		); err != nil {
			return nil, err
		}
		if deckF > 0 {
			row.PickRate = float64(row.DecksWithCard) / deckF
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
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

func blockLabel(key string) string {
	switch key {
	case "3":
		return "3 block"
	case "2":
		return "2 block"
	case "1":
		return "1 block"
	case "none":
		return "No block"
	default:
		return "Block " + key
	}
}

func typeLabel(key string) string {
	id, err := strconv.Atoi(key)
	if err != nil {
		return key
	}
	return domain.CardType(int16(id)).String()
}

// RunawaysDraftDeckRow is a deck summary for the runaways draft decklists tab.
type RunawaysDraftDeckRow struct {
	ID             int
	Name           string
	OwnerUsername  *string
	OwnerEmail     string
	MainboardCount int
	FabraryLink    *string
}

// ListRunawaysDraftDecks returns decks for source + set + hero, ordered by name.
func (r *Repository) ListRunawaysDraftDecks(ctx context.Context, deckSourceID, setID, heroID int) ([]RunawaysDraftDeckRow, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if deckSourceID <= 0 || setID <= 0 || heroID <= 0 {
		return nil, fmt.Errorf("repository: invalid runaways draft filter")
	}
	const q = `
SELECT d.id, d.name, u.username, u.email,
  COALESCE(SUM(CASE WHEN dc.mainboard THEN dc.count ELSE 0 END), 0)::int AS mainboard_count,
  d.fabrary_link
FROM decks d
LEFT JOIN users u ON u.id = d.user_id
LEFT JOIN deck_cards dc ON dc.deck_id = d.id
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3
GROUP BY d.id, d.name, u.username, u.email, d.fabrary_link
ORDER BY LOWER(d.name) ASC, d.id ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: list runaways draft decks: %w", err)
	}
	defer rows.Close()

	out := make([]RunawaysDraftDeckRow, 0, 64)
	for rows.Next() {
		var row RunawaysDraftDeckRow
		if err := rows.Scan(&row.ID, &row.Name, &row.OwnerUsername, &row.OwnerEmail, &row.MainboardCount, &row.FabraryLink); err != nil {
			return nil, fmt.Errorf("repository: scan runaways draft deck: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list runaways draft decks rows: %w", err)
	}
	return out, nil
}

// GetRunawaysDraftDeck loads a deck and its cards when it belongs to the runaways draft slice.
func (r *Repository) GetRunawaysDraftDeck(ctx context.Context, deckSourceID, setID, heroID, deckID int) (*Deck, []DeckCardEntry, error) {
	deck, entries, err := r.GetDeckByID(ctx, deckID)
	if err != nil {
		return nil, nil, err
	}
	if deck.DeckSourceID != deckSourceID {
		return nil, nil, ErrDeckNotFound
	}
	if deck.SetID == nil || *deck.SetID != setID || deck.HeroID != heroID {
		return nil, nil, ErrDeckNotFound
	}
	return deck, entries, nil
}
