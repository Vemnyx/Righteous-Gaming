package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// CardRaterSummaryStats aggregates all ratings for one rater session (ignores card filters).
type CardRaterSummaryStats struct {
	TotalRatings  int
	UniqueUsers   int
	AvgRating     float64
	DistinctCards int
}

// CardRaterRatingBin is one bucket in the rating histogram.
type CardRaterRatingBin struct {
	Rating int16
	Count  int
}

// CardRaterRankedCard is a card with aggregate vote stats for a session.
type CardRaterRankedCard struct {
	Card      Card
	AvgRating float64
	VoteCount int
}

// CardRaterFilterOptions lists distinct class / talent / type values present among rated cards.
type CardRaterFilterOptions struct {
	Classes  []int16
	Talents  []int16
	CardTypes []int16
}

// CardRaterAnalytics aggregates analytics for one card_rater id.
type CardRaterAnalytics struct {
	Summary       CardRaterSummaryStats
	Distribution  []CardRaterRatingBin
	FilterOptions CardRaterFilterOptions
	TopCards      []CardRaterRankedCard
	RankedTable   []CardRaterRankedCard
}

func scanCardStatsRow(row pgx.Row) (CardRaterRankedCard, error) {
	var e CardRaterRankedCard
	c := &e.Card
	err := row.Scan(
		&c.ID,
		&c.SetID,
		&c.Name,
		&c.CardIdentifier,
		&c.ImageURL,
		&c.FunctionalText,
		&c.Rarity,
		&c.SetCode,
		&c.SetNum,
		&c.Type,
		&c.Subtypes,
		&c.Classes,
		&c.Hybrid,
		&c.Talents,
		&c.Pitch,
		&c.Cost,
		&c.Power,
		&c.Block,
		&c.Heroes,
		&c.Life,
		&c.Intellect,
		&c.Keywords,
		&c.Formats,
		&c.Specializations,
		&c.Fusions,
		&c.SetName,
		&e.AvgRating,
		&e.VoteCount,
	)
	if err != nil {
		return CardRaterRankedCard{}, err
	}
	return e, nil
}

const rankedCardsFromSession = `
SELECT ` + cardSelectColumnsFromC + `, MAX(s.name) AS set_name,
	AVG(r.rating)::float8 AS avg_rating,
	COUNT(*)::int AS vote_count
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id
INNER JOIN sets s ON s.id = c.set_id
WHERE r.rater_id = $1
	AND ($2::smallint IS NULL OR $2 = ANY(c.classes))
	AND ($3::smallint IS NULL OR $3 = ANY(c.talents))
	AND ($4::smallint IS NULL OR c.type = $4)
GROUP BY c.id
ORDER BY avg_rating DESC NULLS LAST, vote_count DESC, c.id ASC
`

// CardRaterAnalytics loads summary, distribution, filter facets, and ranked card lists for a rater session.
func (r *Repository) CardRaterAnalytics(ctx context.Context, raterID int, classFilter, talentFilter, typeFilter *int16, topLimit, tableLimit int) (*CardRaterAnalytics, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if topLimit <= 0 {
		topLimit = 10
	}
	if topLimit > 50 {
		topLimit = 50
	}
	if tableLimit <= 0 {
		tableLimit = 50
	}
	if tableLimit > 200 {
		tableLimit = 200
	}

	var classArg any
	var talentArg any
	var typeArg any
	if classFilter != nil {
		classArg = *classFilter
	}
	if talentFilter != nil {
		talentArg = *talentFilter
	}
	if typeFilter != nil {
		typeArg = *typeFilter
	}

	out := &CardRaterAnalytics{
		Distribution: []CardRaterRatingBin{},
		TopCards:     []CardRaterRankedCard{},
		RankedTable:  []CardRaterRankedCard{},
	}

	const summaryQ = `
SELECT
	COUNT(*)::int,
	COUNT(DISTINCT user_id)::int,
	COALESCE(AVG(rating)::float8, 0),
	COUNT(DISTINCT card_id)::int
FROM user_card_ratings
WHERE rater_id = $1`
	err := r.pool.QueryRow(ctx, summaryQ, raterID).Scan(
		&out.Summary.TotalRatings,
		&out.Summary.UniqueUsers,
		&out.Summary.AvgRating,
		&out.Summary.DistinctCards,
	)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics summary: %w", err)
	}

	const distQ = `
SELECT rating, COUNT(*)::int
FROM user_card_ratings
WHERE rater_id = $1
GROUP BY rating
ORDER BY rating ASC`
	rows, err := r.pool.Query(ctx, distQ, raterID)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics distribution: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var bin CardRaterRatingBin
		if err := rows.Scan(&bin.Rating, &bin.Count); err != nil {
			return nil, fmt.Errorf("repository: card rater analytics distribution scan: %w", err)
		}
		out.Distribution = append(out.Distribution, bin)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics distribution rows: %w", err)
	}

	const classesQ = `
SELECT DISTINCT x::smallint
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id,
LATERAL unnest(c.classes) AS x
WHERE r.rater_id = $1
ORDER BY 1`
	out.FilterOptions.Classes, err = r.queryDistinctSmallints(ctx, classesQ, raterID)
	if err != nil {
		return nil, err
	}

	const talentsQ = `
SELECT DISTINCT x::smallint
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id,
LATERAL unnest(c.talents) AS x
WHERE r.rater_id = $1
ORDER BY 1`
	out.FilterOptions.Talents, err = r.queryDistinctSmallints(ctx, talentsQ, raterID)
	if err != nil {
		return nil, err
	}

	const typesQ = `
SELECT DISTINCT c.type
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id
WHERE r.rater_id = $1
ORDER BY 1`
	out.FilterOptions.CardTypes, err = r.queryDistinctSmallints(ctx, typesQ, raterID)
	if err != nil {
		return nil, err
	}

	topQ := rankedCardsFromSession + ` LIMIT $5`
	topRows, err := r.pool.Query(ctx, topQ, raterID, classArg, talentArg, typeArg, topLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics top cards: %w", err)
	}
	defer topRows.Close()
	for topRows.Next() {
		e, err := scanCardStatsRow(topRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics top cards scan: %w", err)
		}
		out.TopCards = append(out.TopCards, e)
	}
	if err := topRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics top cards rows: %w", err)
	}

	tableQ := rankedCardsFromSession + ` LIMIT $5`
	tableRows, err := r.pool.Query(ctx, tableQ, raterID, classArg, talentArg, typeArg, tableLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics ranked table: %w", err)
	}
	defer tableRows.Close()
	for tableRows.Next() {
		e, err := scanCardStatsRow(tableRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics ranked table scan: %w", err)
		}
		out.RankedTable = append(out.RankedTable, e)
	}
	if err := tableRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics ranked table rows: %w", err)
	}

	return out, nil
}

func (r *Repository) queryDistinctSmallints(ctx context.Context, q string, raterID int) ([]int16, error) {
	rows, err := r.pool.Query(ctx, q, raterID)
	if err != nil {
		return nil, fmt.Errorf("repository: distinct smallints: %w", err)
	}
	defer rows.Close()
	var out []int16
	for rows.Next() {
		var v int16
		if err := rows.Scan(&v); err != nil {
			return nil, fmt.Errorf("repository: distinct smallints scan: %w", err)
		}
		out = append(out, v)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: distinct smallints rows: %w", err)
	}
	return out, nil
}
