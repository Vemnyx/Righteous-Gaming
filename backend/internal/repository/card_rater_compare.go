package repository

import (
	"context"
	"fmt"
	"sort"
)

// ErrCardRaterCompareInvalid is returned when two sessions cannot be compared.
var ErrCardRaterCompareInvalid = fmt.Errorf("repository: invalid card rater compare")

// CardRaterCompareCardStats is aggregate rating stats for one card in one session.
type CardRaterCompareCardStats struct {
	AvgRating float64
	VoteCount int
	Rank      int
}

// CardRaterCompareCardRow is one card's stats in baseline vs current sessions.
type CardRaterCompareCardRow struct {
	Card            Card
	Baseline        *CardRaterCompareCardStats
	Current         *CardRaterCompareCardStats
	AvgRatingDelta  *float64
	RankDelta       *int
}

// CardRaterCompareResult is a side-by-side comparison of two card_rater sessions.
type CardRaterCompareResult struct {
	Baseline        CardRater
	Current         CardRater
	BaselineSummary CardRaterSummaryStats
	CurrentSummary  CardRaterSummaryStats
	Cards           []CardRaterCompareCardRow
}

type sessionCardAgg struct {
	CardID    int
	AvgRating float64
	VoteCount int
}

func (r *Repository) cardRaterSummary(ctx context.Context, raterID int) (CardRaterSummaryStats, error) {
	var out CardRaterSummaryStats
	const q = `
SELECT
	COUNT(*)::int,
	COUNT(DISTINCT user_id)::int,
	COALESCE(AVG(rating)::float8, 0),
	COUNT(DISTINCT card_id)::int
FROM user_card_ratings
WHERE rater_id = $1`
	err := r.pool.QueryRow(ctx, q, raterID).Scan(
		&out.TotalRatings,
		&out.UniqueUsers,
		&out.AvgRating,
		&out.DistinctCards,
	)
	if err != nil {
		return CardRaterSummaryStats{}, fmt.Errorf("repository: card rater compare summary: %w", err)
	}
	return out, nil
}

func (r *Repository) listSessionCardAggs(ctx context.Context, raterID int) ([]sessionCardAgg, error) {
	const q = `
SELECT r.card_id,
	AVG(r.rating)::float8,
	COUNT(*)::int
FROM user_card_ratings r
WHERE r.rater_id = $1
GROUP BY r.card_id
ORDER BY AVG(r.rating) DESC NULLS LAST, COUNT(*) DESC, r.card_id ASC`
	rows, err := r.pool.Query(ctx, q, raterID)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater compare card aggs: %w", err)
	}
	defer rows.Close()
	out := make([]sessionCardAgg, 0, 128)
	for rows.Next() {
		var row sessionCardAgg
		if err := rows.Scan(&row.CardID, &row.AvgRating, &row.VoteCount); err != nil {
			return nil, fmt.Errorf("repository: card rater compare card aggs scan: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater compare card aggs rows: %w", err)
	}
	return out, nil
}

func rankSessionCardAggs(aggs []sessionCardAgg) map[int]CardRaterCompareCardStats {
	out := make(map[int]CardRaterCompareCardStats, len(aggs))
	for i, row := range aggs {
		out[row.CardID] = CardRaterCompareCardStats{
			AvgRating: row.AvgRating,
			VoteCount: row.VoteCount,
			Rank:      i + 1,
		}
	}
	return out
}

func (r *Repository) listCardsByIDs(ctx context.Context, ids []int) (map[int]Card, error) {
	if len(ids) == 0 {
		return map[int]Card{}, nil
	}
	q := cardSelectJoinSet + ` WHERE c.id = ANY($1) ORDER BY c.id ASC`
	rows, err := r.pool.Query(ctx, q, ids)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater compare cards by ids: %w", err)
	}
	defer rows.Close()
	out := make(map[int]Card, len(ids))
	for rows.Next() {
		c, err := scanCardWithSetName(rows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater compare cards by ids scan: %w", err)
		}
		out[c.ID] = *c
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater compare cards by ids rows: %w", err)
	}
	return out, nil
}

// CardRaterCompare loads a comparison between baseline (older reference) and current sessions.
func (r *Repository) CardRaterCompare(ctx context.Context, currentID, baselineID int) (*CardRaterCompareResult, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if currentID <= 0 || baselineID <= 0 || currentID == baselineID {
		return nil, ErrCardRaterCompareInvalid
	}

	current, err := r.GetCardRater(ctx, currentID)
	if err != nil {
		return nil, err
	}
	baseline, err := r.GetCardRater(ctx, baselineID)
	if err != nil {
		return nil, err
	}
	if current.SetID != baseline.SetID {
		return nil, ErrCardRaterCompareInvalid
	}
	if baseline.CompletedAt == nil {
		return nil, ErrCardRaterCompareInvalid
	}

	baselineSummary, err := r.cardRaterSummary(ctx, baselineID)
	if err != nil {
		return nil, err
	}
	currentSummary, err := r.cardRaterSummary(ctx, currentID)
	if err != nil {
		return nil, err
	}

	baselineAggs, err := r.listSessionCardAggs(ctx, baselineID)
	if err != nil {
		return nil, err
	}
	currentAggs, err := r.listSessionCardAggs(ctx, currentID)
	if err != nil {
		return nil, err
	}

	baselineStats := rankSessionCardAggs(baselineAggs)
	currentStats := rankSessionCardAggs(currentAggs)

	idSet := make(map[int]struct{}, len(baselineStats)+len(currentStats))
	for id := range baselineStats {
		idSet[id] = struct{}{}
	}
	for id := range currentStats {
		idSet[id] = struct{}{}
	}
	ids := make([]int, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	sort.Ints(ids)

	cardsByID, err := r.listCardsByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}

	rows := make([]CardRaterCompareCardRow, 0, len(ids))
	for _, id := range ids {
		card, ok := cardsByID[id]
		if !ok {
			continue
		}
		var baselinePtr *CardRaterCompareCardStats
		var currentPtr *CardRaterCompareCardStats
		if s, ok := baselineStats[id]; ok {
			sCopy := s
			baselinePtr = &sCopy
		}
		if s, ok := currentStats[id]; ok {
			sCopy := s
			currentPtr = &sCopy
		}
		row := CardRaterCompareCardRow{
			Card:     card,
			Baseline: baselinePtr,
			Current:  currentPtr,
		}
		if baselinePtr != nil && currentPtr != nil {
			delta := currentPtr.AvgRating - baselinePtr.AvgRating
			row.AvgRatingDelta = &delta
			rankDelta := currentPtr.Rank - baselinePtr.Rank
			row.RankDelta = &rankDelta
		}
		rows = append(rows, row)
	}

	sort.Slice(rows, func(i, j int) bool {
		di := rows[i].AvgRatingDelta
		dj := rows[j].AvgRatingDelta
		if di != nil && dj != nil {
			if *di != *dj {
				return *di > *dj
			}
		} else if di != nil {
			return true
		} else if dj != nil {
			return false
		}
		ci := rows[i].Current
		cj := rows[j].Current
		if ci != nil && cj != nil && ci.Rank != cj.Rank {
			return ci.Rank < cj.Rank
		}
		return rows[i].Card.ID < rows[j].Card.ID
	})

	return &CardRaterCompareResult{
		Baseline:        *baseline,
		Current:         *current,
		BaselineSummary: baselineSummary,
		CurrentSummary:  currentSummary,
		Cards:           rows,
	}, nil
}
