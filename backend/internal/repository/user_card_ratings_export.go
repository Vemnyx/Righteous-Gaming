package repository

import (
	"bytes"
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"time"

	"righteous-gaming/backend/internal/domain"
)

// RatedSetOption is a set the user has at least one card rating in.
type RatedSetOption struct {
	ID   int
	Name string
}

// ListUserRatedSets returns distinct sets where the user has rated at least one card in any session.
func (r *Repository) ListUserRatedSets(ctx context.Context, userID int) ([]RatedSetOption, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT DISTINCT s.id, s.name
FROM user_card_ratings ucr
INNER JOIN card_rater cr ON cr.id = ucr.rater_id
INNER JOIN sets s ON s.id = cr.set_id
WHERE ucr.user_id = $1
ORDER BY s.name ASC, s.id ASC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("repository: list user rated sets: %w", err)
	}
	defer rows.Close()

	out := make([]RatedSetOption, 0, 16)
	for rows.Next() {
		var opt RatedSetOption
		if err := rows.Scan(&opt.ID, &opt.Name); err != nil {
			return nil, fmt.Errorf("repository: list user rated sets scan: %w", err)
		}
		out = append(out, opt)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list user rated sets rows: %w", err)
	}
	return out, nil
}

type userCardRatingsExportSession struct {
	ID        int
	Label     *string
	Format    int16
	StartedAt time.Time
}

type userCardRatingsExportRow struct {
	CardID   int
	CardName string
}

// BuildUserCardRatingsExportCSV builds a wide CSV of the user's ratings across all sessions for a set.
// Sessions are ordered by started_at ascending (including active sessions).
func (r *Repository) BuildUserCardRatingsExportCSV(ctx context.Context, userID, setID int) ([]byte, string, error) {
	if r.pool == nil {
		return nil, "", fmt.Errorf("repository: pool is closed")
	}

	setRow, err := r.SetByID(ctx, setID)
	if err != nil {
		return nil, "", err
	}

	const sessionsQ = `
SELECT DISTINCT cr.id, cr.label, cr.format, cr.started_at
FROM card_rater cr
INNER JOIN user_card_ratings ucr ON ucr.rater_id = cr.id AND ucr.user_id = $1
WHERE cr.set_id = $2
ORDER BY cr.started_at ASC, cr.id ASC`
	sessRows, err := r.pool.Query(ctx, sessionsQ, userID, setID)
	if err != nil {
		return nil, "", fmt.Errorf("repository: export card ratings sessions: %w", err)
	}
	defer sessRows.Close()

	sessions := make([]userCardRatingsExportSession, 0, 8)
	for sessRows.Next() {
		var s userCardRatingsExportSession
		if err := sessRows.Scan(&s.ID, &s.Label, &s.Format, &s.StartedAt); err != nil {
			return nil, "", fmt.Errorf("repository: export card ratings sessions scan: %w", err)
		}
		sessions = append(sessions, s)
	}
	if err := sessRows.Err(); err != nil {
		return nil, "", fmt.Errorf("repository: export card ratings sessions rows: %w", err)
	}
	if len(sessions) == 0 {
		return nil, "", ErrUserCardRatingsExportEmpty
	}

	const ratingsQ = `
SELECT ucr.rater_id, ucr.card_id, c.name, c.pitch, ucr.rating
FROM user_card_ratings ucr
INNER JOIN card_rater cr ON cr.id = ucr.rater_id
INNER JOIN cards c ON c.id = ucr.card_id
WHERE ucr.user_id = $1 AND cr.set_id = $2`
	ratingRows, err := r.pool.Query(ctx, ratingsQ, userID, setID)
	if err != nil {
		return nil, "", fmt.Errorf("repository: export card ratings rows: %w", err)
	}
	defer ratingRows.Close()

	type ratingKey struct {
		RaterID int
		CardID  int
	}
	ratingsByKey := make(map[ratingKey]int16)
	cardNames := make(map[int]string)
	for ratingRows.Next() {
		var raterID, cardID int
		var cardName string
		var pitch *int16
		var rating int16
		if err := ratingRows.Scan(&raterID, &cardID, &cardName, &pitch, &rating); err != nil {
			return nil, "", fmt.Errorf("repository: export card ratings rows scan: %w", err)
		}
		ratingsByKey[ratingKey{RaterID: raterID, CardID: cardID}] = rating
		if _, ok := cardNames[cardID]; !ok {
			cardNames[cardID] = cardExportDisplayName(cardName, pitch)
		}
	}
	if err := ratingRows.Err(); err != nil {
		return nil, "", fmt.Errorf("repository: export card ratings rows err: %w", err)
	}

	cards := make([]userCardRatingsExportRow, 0, len(cardNames))
	for cardID, name := range cardNames {
		cards = append(cards, userCardRatingsExportRow{CardID: cardID, CardName: name})
	}
	sort.Slice(cards, func(i, j int) bool {
		ni := strings.ToLower(strings.TrimSpace(cards[i].CardName))
		nj := strings.ToLower(strings.TrimSpace(cards[j].CardName))
		if ni != nj {
			return ni < nj
		}
		return cards[i].CardID < cards[j].CardID
	})

	header := make([]string, 0, 1+len(sessions)*2-1)
	header = append(header, "Card")
	for i, sess := range sessions {
		header = append(header, cardRaterSessionExportHeader(sess))
		if i < len(sessions)-1 {
			header = append(header, "Changes")
		}
	}

	dataRows := make([][]string, 0, len(cards))
	for _, card := range cards {
		sessionRatings := make([]*int16, len(sessions))
		for i, sess := range sessions {
			if rating, ok := ratingsByKey[ratingKey{RaterID: sess.ID, CardID: card.CardID}]; ok {
				ratingCopy := rating
				sessionRatings[i] = &ratingCopy
			}
		}

		row := make([]string, 0, len(header))
		row = append(row, card.CardName)
		for i := range sessions {
			if sessionRatings[i] != nil {
				row = append(row, strconv.Itoa(int(*sessionRatings[i])))
			} else {
				row = append(row, "")
			}
			if i < len(sessions)-1 {
				row = append(row, formatRatingDeltaOptional(sessionRatings[i], sessionRatings[i+1]))
			}
		}
		dataRows = append(dataRows, row)
	}

	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write(header); err != nil {
		return nil, "", fmt.Errorf("repository: export card ratings csv header: %w", err)
	}
	for _, row := range dataRows {
		if err := w.Write(row); err != nil {
			return nil, "", fmt.Errorf("repository: export card ratings csv row: %w", err)
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return nil, "", fmt.Errorf("repository: export card ratings csv flush: %w", err)
	}

	filename := sanitizeExportFilename(setRow.Name) + "-card-ratings.csv"
	return buf.Bytes(), filename, nil
}

// ErrUserCardRatingsExportEmpty is returned when the user has no ratings to export for the set.
var ErrUserCardRatingsExportEmpty = errors.New("repository: no card ratings to export")

func cardExportDisplayName(name string, pitch *int16) string {
	name = strings.TrimSpace(name)
	if pitch == nil {
		return name
	}
	color := pitchExportColor(*pitch)
	if color == "" {
		return name
	}
	return name + " - " + color
}

func pitchExportColor(pitch int16) string {
	switch pitch {
	case 1:
		return "Red"
	case 2:
		return "Yellow"
	case 3:
		return "Blue"
	default:
		return ""
	}
}

func cardRaterSessionExportHeader(sess userCardRatingsExportSession) string {
	name := ""
	if sess.Label != nil {
		name = strings.TrimSpace(*sess.Label)
	}
	if name == "" {
		name = domain.CardFormat(sess.Format).String()
	}
	return name + " " + sess.StartedAt.Format("Jan 2, 2006")
}

func formatRatingDeltaOptional(prev, next *int16) string {
	if prev == nil || next == nil {
		return ""
	}
	return formatRatingDelta(*prev, *next)
}

func formatRatingDelta(prev, next int16) string {
	if prev == next {
		return ""
	}
	diff := int(next) - int(prev)
	if diff > 0 {
		return "+" + strconv.Itoa(diff)
	}
	return "-" + strconv.Itoa(-diff)
}

func sanitizeExportFilename(name string) string {
	s := strings.TrimSpace(name)
	if s == "" {
		return "card-ratings"
	}
	var b strings.Builder
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ' || r == '-' || r == '_':
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "card-ratings"
	}
	return out
}
