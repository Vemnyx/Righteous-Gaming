package repository

import (
	"context"
	"database/sql"
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

// CardRaterRatedCard is a card with aggregate vote stats for a session.
type CardRaterRatedCard struct {
	Card      Card
	AvgRating float64
	VoteCount int
}

// CardRaterControversialCard is a card with high population variance among its session ratings.
type CardRaterControversialCard struct {
	Card         Card
	MinRating    int16
	MaxRating    int16
	Spread       int
	StdDev       float64
	Variance     float64 // VAR_POP of ratings (1–5 scale)
	AvgRating    float64
	VoteCount    int
	LowRatings   int // ratings 1–2
	HighRatings  int // ratings 4–5
}

// CardRaterNotedCard is a card with many non-empty notes in the session.
type CardRaterNotedCard struct {
	Card      Card
	AvgRating float64
	VoteCount int
	NoteCount int
}

// CardRaterFilterOptions lists distinct class / talent / type / rarity values present among rated cards.
type CardRaterFilterOptions struct {
	Classes   []int16
	Talents   []int16
	CardTypes []int16
	Rarities  []int16
}

// CardRaterUserAvgRating is one user's mean rating across all cards they rated in a session.
type CardRaterUserAvgRating struct {
	UserID       int
	UserLabel    string
	AvgRating    float64
	RatingCount  int
}

// CardRaterRatedListPage is a paginated list of rated cards.
type CardRaterRatedListPage struct {
	Rows   []CardRaterRatedCard
	Total  int
	Offset int
	Limit  int
}

// CardRaterControversialListPage is a paginated list of controversial cards.
type CardRaterControversialListPage struct {
	Rows   []CardRaterControversialCard
	Total  int
	Offset int
	Limit  int
}

// CardRaterNotedListPage is a paginated list of cards with notes.
type CardRaterNotedListPage struct {
	Rows   []CardRaterNotedCard
	Total  int
	Offset int
	Limit  int
}

// CardRaterAnalyticsPaging controls top-N and per-list table pagination.
type CardRaterAnalyticsPaging struct {
	TopLimit            int
	RatedOffset         int
	RatedLimit          int
	ControversialOffset int
	ControversialLimit  int
	TalkedOffset        int
	TalkedLimit         int
}

// CardRaterAnalytics aggregates analytics for one card_rater id.
type CardRaterAnalytics struct {
	Summary           CardRaterSummaryStats
	Distribution      []CardRaterRatingBin
	FilterOptions     CardRaterFilterOptions
	UserAvgRatings    []CardRaterUserAvgRating
	TopCards          []CardRaterRatedCard
	RatedTable        CardRaterRatedListPage
	ControversialTop  []CardRaterControversialCard
	ControversialTable CardRaterControversialListPage
	TalkedTop         []CardRaterNotedCard
	TalkedTable       CardRaterNotedListPage
}

func clampAnalyticsPaging(p *CardRaterAnalyticsPaging) {
	if p.TopLimit <= 0 {
		p.TopLimit = 10
	}
	if p.TopLimit > 50 {
		p.TopLimit = 50
	}
	if p.RatedLimit <= 0 {
		p.RatedLimit = 50
	}
	if p.RatedLimit > 200 {
		p.RatedLimit = 200
	}
	if p.RatedOffset < 0 {
		p.RatedOffset = 0
	}
	if p.ControversialLimit <= 0 {
		p.ControversialLimit = 50
	}
	if p.ControversialLimit > 200 {
		p.ControversialLimit = 200
	}
	if p.ControversialOffset < 0 {
		p.ControversialOffset = 0
	}
	if p.TalkedLimit <= 0 {
		p.TalkedLimit = 50
	}
	if p.TalkedLimit > 200 {
		p.TalkedLimit = 200
	}
	if p.TalkedOffset < 0 {
		p.TalkedOffset = 0
	}
}

func scanCardStatsRow(row pgx.Row) (CardRaterRatedCard, error) {
	var e CardRaterRatedCard
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
		return CardRaterRatedCard{}, err
	}
	return e, nil
}

func scanCardControversialRow(row pgx.Row) (CardRaterControversialCard, error) {
	var e CardRaterControversialCard
	c := &e.Card
	var std, variance sql.NullFloat64
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
		&e.MinRating,
		&e.MaxRating,
		&e.Spread,
		&std,
		&variance,
		&e.AvgRating,
		&e.VoteCount,
		&e.LowRatings,
		&e.HighRatings,
	)
	if err != nil {
		return CardRaterControversialCard{}, err
	}
	if std.Valid {
		e.StdDev = std.Float64
	}
	if variance.Valid {
		e.Variance = variance.Float64
	}
	return e, nil
}

func scanCardNotedRow(row pgx.Row) (CardRaterNotedCard, error) {
	var e CardRaterNotedCard
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
		&e.NoteCount,
	)
	if err != nil {
		return CardRaterNotedCard{}, err
	}
	return e, nil
}

const ratedCardsFromSession = `
SELECT ` + cardSelectColumnsFromC + `, MAX(s.name) AS set_name,
	AVG(r.rating)::float8 AS avg_rating,
	COUNT(*)::int AS vote_count
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id
` + cardPrintingLateralJoin + `
INNER JOIN sets s ON s.id = c.set_id
WHERE r.rater_id = $1
	AND ($2::smallint IS NULL OR $2 = ANY(c.classes))
	AND ($3::smallint IS NULL OR $3 = ANY(c.talents))
	AND ($4::smallint IS NULL OR c.type = $4)
	AND ($5::smallint IS NULL OR c.rarity = $5)
GROUP BY ` + cardPrintingGroupBy + `
ORDER BY avg_rating DESC NULLS LAST, vote_count DESC, c.id ASC
`

// CardRaterAnalytics loads summary, distribution, filter facets, and ranked card lists for a rater session.
func (r *Repository) CardRaterAnalytics(ctx context.Context, raterID int, classFilter, talentFilter, typeFilter, rarityFilter *int16, paging CardRaterAnalyticsPaging) (*CardRaterAnalytics, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	clampAnalyticsPaging(&paging)
	topLimit := paging.TopLimit

	var classArg any
	var talentArg any
	var typeArg any
	var rarityArg any
	if classFilter != nil {
		classArg = *classFilter
	}
	if talentFilter != nil {
		talentArg = *talentFilter
	}
	if typeFilter != nil {
		typeArg = *typeFilter
	}
	if rarityFilter != nil {
		rarityArg = *rarityFilter
	}

	out := &CardRaterAnalytics{
		Distribution:      []CardRaterRatingBin{},
		UserAvgRatings:    []CardRaterUserAvgRating{},
		TopCards:          []CardRaterRatedCard{},
		RatedTable:        CardRaterRatedListPage{Offset: paging.RatedOffset, Limit: paging.RatedLimit},
		ControversialTop:  []CardRaterControversialCard{},
		ControversialTable: CardRaterControversialListPage{Offset: paging.ControversialOffset, Limit: paging.ControversialLimit},
		TalkedTop:         []CardRaterNotedCard{},
		TalkedTable:       CardRaterNotedListPage{Offset: paging.TalkedOffset, Limit: paging.TalkedLimit},
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

	const userAvgQ = `
SELECT r.user_id,
	COALESCE(NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'User ' || u.id::text),
	AVG(r.rating)::float8,
	COUNT(*)::int
FROM user_card_ratings r
INNER JOIN users u ON u.id = r.user_id
WHERE r.rater_id = $1
GROUP BY r.user_id, u.username, u.email, u.id
ORDER BY COALESCE(NULLIF(TRIM(u.username), ''), NULLIF(TRIM(u.email), ''), 'User ' || u.id::text) ASC, r.user_id ASC`
	userAvgRows, err := r.pool.Query(ctx, userAvgQ, raterID)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics user averages: %w", err)
	}
	defer userAvgRows.Close()
	for userAvgRows.Next() {
		var row CardRaterUserAvgRating
		if err := userAvgRows.Scan(&row.UserID, &row.UserLabel, &row.AvgRating, &row.RatingCount); err != nil {
			return nil, fmt.Errorf("repository: card rater analytics user averages scan: %w", err)
		}
		out.UserAvgRatings = append(out.UserAvgRatings, row)
	}
	if err := userAvgRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics user averages rows: %w", err)
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

	const raritiesQ = `
SELECT DISTINCT c.rarity
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id
WHERE r.rater_id = $1 AND c.rarity IS NOT NULL
ORDER BY 1`
	out.FilterOptions.Rarities, err = r.queryDistinctSmallints(ctx, raritiesQ, raterID)
	if err != nil {
		return nil, err
	}

	topQ := ratedCardsFromSession + ` LIMIT $6`
	topRows, err := r.pool.Query(ctx, topQ, raterID, classArg, talentArg, typeArg, rarityArg, topLimit)
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

	const ratedCountQ = `
SELECT COUNT(*)::int
FROM (
	SELECT c.id
	FROM user_card_ratings r
	INNER JOIN cards c ON c.id = r.card_id
	WHERE r.rater_id = $1
		AND ($2::smallint IS NULL OR $2 = ANY(c.classes))
		AND ($3::smallint IS NULL OR $3 = ANY(c.talents))
		AND ($4::smallint IS NULL OR c.type = $4)
		AND ($5::smallint IS NULL OR c.rarity = $5)
	GROUP BY c.id
) sub`
	if err := r.pool.QueryRow(ctx, ratedCountQ, raterID, classArg, talentArg, typeArg, rarityArg).Scan(&out.RatedTable.Total); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics rated table count: %w", err)
	}

	tableQ := ratedCardsFromSession + ` OFFSET $6 LIMIT $7`
	tableRows, err := r.pool.Query(ctx, tableQ, raterID, classArg, talentArg, typeArg, rarityArg, paging.RatedOffset, paging.RatedLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics rated table: %w", err)
	}
	defer tableRows.Close()
	for tableRows.Next() {
		e, err := scanCardStatsRow(tableRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics rated table scan: %w", err)
		}
		out.RatedTable.Rows = append(out.RatedTable.Rows, e)
	}
	if err := tableRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics rated table rows: %w", err)
	}

	const controversialSelect = `
SELECT ` + cardSelectColumnsFromC + `, MAX(s.name) AS set_name,
	MIN(r.rating)::smallint AS min_rating,
	MAX(r.rating)::smallint AS max_rating,
	(MAX(r.rating) - MIN(r.rating))::int AS spread,
	STDDEV_POP(r.rating::double precision) AS stddev,
	VAR_POP(r.rating::double precision) AS rating_variance,
	AVG(r.rating)::float8 AS avg_rating,
	COUNT(*)::int AS vote_count,
	COUNT(*) FILTER (WHERE r.rating <= 2)::int AS low_ratings,
	COUNT(*) FILTER (WHERE r.rating >= 4)::int AS high_ratings
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id
` + cardPrintingLateralJoin + `
INNER JOIN sets s ON s.id = c.set_id
WHERE r.rater_id = $1
GROUP BY ` + cardPrintingGroupBy + `
HAVING COUNT(*) >= 2 AND VAR_POP(r.rating::double precision) IS NOT NULL`
	const controversialOrder = `
ORDER BY rating_variance DESC NULLS LAST, vote_count DESC, c.id ASC`

	const controversialCountQ = `
SELECT COUNT(*)::int
FROM (
	SELECT c.id
	FROM user_card_ratings r
	INNER JOIN cards c ON c.id = r.card_id
	WHERE r.rater_id = $1
	GROUP BY c.id
	HAVING COUNT(*) >= 2 AND VAR_POP(r.rating::double precision) IS NOT NULL
) sub`
	if err := r.pool.QueryRow(ctx, controversialCountQ, raterID).Scan(&out.ControversialTable.Total); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics controversial count: %w", err)
	}

	contTopQ := controversialSelect + controversialOrder + ` LIMIT $2`
	contTopRows, err := r.pool.Query(ctx, contTopQ, raterID, topLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics controversial top: %w", err)
	}
	defer contTopRows.Close()
	for contTopRows.Next() {
		e, err := scanCardControversialRow(contTopRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics controversial top scan: %w", err)
		}
		out.ControversialTop = append(out.ControversialTop, e)
	}
	if err := contTopRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics controversial top rows: %w", err)
	}

	contTableQ := controversialSelect + controversialOrder + ` OFFSET $2 LIMIT $3`
	contTableRows, err := r.pool.Query(ctx, contTableQ, raterID, paging.ControversialOffset, paging.ControversialLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics controversial table: %w", err)
	}
	defer contTableRows.Close()
	for contTableRows.Next() {
		e, err := scanCardControversialRow(contTableRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics controversial table scan: %w", err)
		}
		out.ControversialTable.Rows = append(out.ControversialTable.Rows, e)
	}
	if err := contTableRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics controversial table rows: %w", err)
	}

	const notedSelect = `
SELECT ` + cardSelectColumnsFromC + `, MAX(s.name) AS set_name,
	AVG(r.rating)::float8 AS avg_rating,
	COUNT(*)::int AS vote_count,
	COUNT(*) FILTER (WHERE r.notes IS NOT NULL AND btrim(r.notes) <> '')::int AS note_count
FROM user_card_ratings r
INNER JOIN cards c ON c.id = r.card_id
` + cardPrintingLateralJoin + `
INNER JOIN sets s ON s.id = c.set_id
WHERE r.rater_id = $1
GROUP BY ` + cardPrintingGroupBy + `
HAVING COUNT(*) FILTER (WHERE r.notes IS NOT NULL AND btrim(r.notes) <> '') > 0`
	const notedOrder = `
ORDER BY note_count DESC, vote_count DESC, c.id ASC`

	const notedCountQ = `
SELECT COUNT(*)::int
FROM (
	SELECT c.id
	FROM user_card_ratings r
	INNER JOIN cards c ON c.id = r.card_id
	WHERE r.rater_id = $1
	GROUP BY c.id
	HAVING COUNT(*) FILTER (WHERE r.notes IS NOT NULL AND btrim(r.notes) <> '') > 0
) sub`
	if err := r.pool.QueryRow(ctx, notedCountQ, raterID).Scan(&out.TalkedTable.Total); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics noted count: %w", err)
	}

	noteTopQ := notedSelect + notedOrder + ` LIMIT $2`
	noteTopRows, err := r.pool.Query(ctx, noteTopQ, raterID, topLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics noted top: %w", err)
	}
	defer noteTopRows.Close()
	for noteTopRows.Next() {
		e, err := scanCardNotedRow(noteTopRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics noted top scan: %w", err)
		}
		out.TalkedTop = append(out.TalkedTop, e)
	}
	if err := noteTopRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics noted top rows: %w", err)
	}

	noteTableQ := notedSelect + notedOrder + ` OFFSET $2 LIMIT $3`
	noteTableRows, err := r.pool.Query(ctx, noteTableQ, raterID, paging.TalkedOffset, paging.TalkedLimit)
	if err != nil {
		return nil, fmt.Errorf("repository: card rater analytics noted table: %w", err)
	}
	defer noteTableRows.Close()
	for noteTableRows.Next() {
		e, err := scanCardNotedRow(noteTableRows)
		if err != nil {
			return nil, fmt.Errorf("repository: card rater analytics noted table scan: %w", err)
		}
		out.TalkedTable.Rows = append(out.TalkedTable.Rows, e)
	}
	if err := noteTableRows.Err(); err != nil {
		return nil, fmt.Errorf("repository: card rater analytics noted table rows: %w", err)
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
