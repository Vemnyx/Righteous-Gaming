package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
)

const PlayTestingInterestNoteMaxRunes = 280

var (
	ErrPlayTestingNoteNotFound     = errors.New("repository: play testing note not found")
	ErrPlayTestingInterestNotFound = errors.New("repository: play testing interest not found")
	ErrPlayTestingNotSessionOwner  = errors.New("repository: not play testing session owner")
	ErrPlayTestingOwnerInterest    = errors.New("repository: session owner cannot express interest")
	ErrPlayTestingInterestHeroes   = errors.New("repository: at least one hero is required")
	ErrPlayTestingInterestNoteLen  = errors.New("repository: interest note too long")
)

// PlayTestingSessionNote is the session owner's draft/published note.
type PlayTestingSessionNote struct {
	ID          int
	SessionID   int
	UserID      int
	Body        string
	DraftBody   string
	PublishedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
	FirstName   *string
	Username    *string
}

// PlayTestingInterestHero is a hero on an interest signup.
type PlayTestingInterestHero struct {
	HeroID       int
	Name         string
	Young        bool
	CardImageURL *string
	ArtImageURL  *string
}

// PlayTestingSessionInterest is one user's interest signup on a session.
type PlayTestingSessionInterest struct {
	ID        int
	SessionID int
	UserID    int
	Note      string
	CreatedAt time.Time
	UpdatedAt time.Time
	FirstName *string
	Username  *string
	Heroes    []PlayTestingInterestHero
}

// GetPlayTestingSessionNoteBySessionAndUser returns the note for a session author, if any.
func (r *Repository) GetPlayTestingSessionNoteBySessionAndUser(ctx context.Context, sessionID, userID int) (*PlayTestingSessionNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT n.id, n.session_id, n.user_id, n.body, n.draft_body, n.published_at, n.created_at, n.updated_at,
       u.first_name, u.username
FROM play_testing_session_notes n
INNER JOIN users u ON u.id = n.user_id
WHERE n.session_id = $1 AND n.user_id = $2`
	var n PlayTestingSessionNote
	err := r.pool.QueryRow(ctx, q, sessionID, userID).Scan(
		&n.ID, &n.SessionID, &n.UserID, &n.Body, &n.DraftBody, &n.PublishedAt, &n.CreatedAt, &n.UpdatedAt,
		&n.FirstName, &n.Username,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPlayTestingNoteNotFound
		}
		return nil, fmt.Errorf("repository: get play testing session note: %w", err)
	}
	return &n, nil
}

// GetPublishedPlayTestingSessionNote returns the owner's published note for a session, if any.
func (r *Repository) GetPublishedPlayTestingSessionNote(ctx context.Context, sessionID int) (*PlayTestingSessionNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT n.id, n.session_id, n.user_id, n.body, n.draft_body, n.published_at, n.created_at, n.updated_at,
       u.first_name, u.username
FROM play_testing_session_notes n
INNER JOIN users u ON u.id = n.user_id
WHERE n.session_id = $1 AND n.published_at IS NOT NULL
ORDER BY n.updated_at DESC
LIMIT 1`
	var n PlayTestingSessionNote
	err := r.pool.QueryRow(ctx, q, sessionID).Scan(
		&n.ID, &n.SessionID, &n.UserID, &n.Body, &n.DraftBody, &n.PublishedAt, &n.CreatedAt, &n.UpdatedAt,
		&n.FirstName, &n.Username,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrPlayTestingNoteNotFound
		}
		return nil, fmt.Errorf("repository: get published play testing session note: %w", err)
	}
	return &n, nil
}

// UpsertPlayTestingSessionNote creates/updates the session owner's note.
// Only the session owner may write. publish=false updates draft only.
func (r *Repository) UpsertPlayTestingSessionNote(ctx context.Context, sessionID, userID int, body string, publish bool) (*PlayTestingSessionNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	session, err := r.GetPlayTestingSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session.UserID != userID {
		return nil, ErrPlayTestingNotSessionOwner
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, fmt.Errorf("repository: note body required")
	}

	var existingID int
	err = r.pool.QueryRow(ctx, `
SELECT id FROM play_testing_session_notes
WHERE session_id = $1 AND user_id = $2
LIMIT 1`, sessionID, userID).Scan(&existingID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("repository: find play testing session note: %w", err)
	}

	var id int
	if err == nil {
		id = existingID
		if publish {
			_, err = r.pool.Exec(ctx, `
UPDATE play_testing_session_notes
SET draft_body = $2, body = $2, published_at = now(), updated_at = now()
WHERE id = $1`, id, body)
		} else {
			_, err = r.pool.Exec(ctx, `
UPDATE play_testing_session_notes
SET draft_body = $2, updated_at = now()
WHERE id = $1`, id, body)
		}
		if err != nil {
			return nil, fmt.Errorf("repository: update play testing session note: %w", err)
		}
	} else {
		if publish {
			err = r.pool.QueryRow(ctx, `
INSERT INTO play_testing_session_notes (session_id, user_id, body, draft_body, published_at)
VALUES ($1, $2, $3, $3, now())
RETURNING id`, sessionID, userID, body).Scan(&id)
		} else {
			err = r.pool.QueryRow(ctx, `
INSERT INTO play_testing_session_notes (session_id, user_id, body, draft_body, published_at)
VALUES ($1, $2, '', $3, NULL)
RETURNING id`, sessionID, userID, body).Scan(&id)
		}
		if err != nil {
			return nil, fmt.Errorf("repository: insert play testing session note: %w", err)
		}
	}
	return r.GetPlayTestingSessionNoteBySessionAndUser(ctx, sessionID, userID)
}

// DeletePlayTestingSessionNote deletes the owner's note for a session.
func (r *Repository) DeletePlayTestingSessionNote(ctx context.Context, sessionID, userID int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	session, err := r.GetPlayTestingSessionByID(ctx, sessionID)
	if err != nil {
		return err
	}
	if session.UserID != userID {
		return ErrPlayTestingNotSessionOwner
	}
	tag, err := r.pool.Exec(ctx, `
DELETE FROM play_testing_session_notes
WHERE session_id = $1 AND user_id = $2`, sessionID, userID)
	if err != nil {
		return fmt.Errorf("repository: delete play testing session note: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrPlayTestingNoteNotFound
	}
	return nil
}

// ListPlayTestingSessionInterests returns interest signups with heroes for a session.
func (r *Repository) ListPlayTestingSessionInterests(ctx context.Context, sessionID int) ([]PlayTestingSessionInterest, error) {
	if sessionID <= 0 {
		return nil, fmt.Errorf("repository: invalid session id")
	}
	bySession, err := r.listPlayTestingInterestsBySessionIDs(ctx, []int{sessionID})
	if err != nil {
		return nil, err
	}
	if rows, ok := bySession[sessionID]; ok {
		return rows, nil
	}
	return []PlayTestingSessionInterest{}, nil
}

// listPlayTestingInterestsBySessionIDs returns interest signups keyed by session id.
func (r *Repository) listPlayTestingInterestsBySessionIDs(ctx context.Context, sessionIDs []int) (map[int][]PlayTestingSessionInterest, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	out := make(map[int][]PlayTestingSessionInterest, len(sessionIDs))
	if len(sessionIDs) == 0 {
		return out, nil
	}
	const q = `
SELECT i.id, i.session_id, i.user_id, i.note, i.created_at, i.updated_at, u.first_name, u.username
FROM play_testing_session_interests i
INNER JOIN users u ON u.id = i.user_id
WHERE i.session_id = ANY ($1)
ORDER BY i.updated_at DESC, i.id DESC`
	rows, err := r.pool.Query(ctx, q, sessionIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing interests: %w", err)
	}
	defer rows.Close()

	all := make([]PlayTestingSessionInterest, 0, 32)
	ids := make([]int, 0, 32)
	for rows.Next() {
		var row PlayTestingSessionInterest
		if err := rows.Scan(
			&row.ID, &row.SessionID, &row.UserID, &row.Note, &row.CreatedAt, &row.UpdatedAt,
			&row.FirstName, &row.Username,
		); err != nil {
			return nil, fmt.Errorf("repository: scan play testing interest: %w", err)
		}
		row.Heroes = []PlayTestingInterestHero{}
		all = append(all, row)
		ids = append(ids, row.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing interests rows: %w", err)
	}
	if len(ids) == 0 {
		return out, nil
	}

	heroesByInterest, err := r.listPlayTestingInterestHeroes(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range all {
		if hs, ok := heroesByInterest[all[i].ID]; ok {
			all[i].Heroes = hs
		}
		sid := all[i].SessionID
		out[sid] = append(out[sid], all[i])
	}
	return out, nil
}

func (r *Repository) listPlayTestingInterestHeroes(ctx context.Context, interestIDs []int) (map[int][]PlayTestingInterestHero, error) {
	const q = `
SELECT ih.interest_id, h.id, h.name, h.young, h.card_image_url, h.art_image_url
FROM play_testing_session_interest_heroes ih
INNER JOIN heroes h ON h.id = ih.hero_id
WHERE ih.interest_id = ANY ($1)
ORDER BY h.name ASC, h.id ASC`
	rows, err := r.pool.Query(ctx, q, interestIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing interest heroes: %w", err)
	}
	defer rows.Close()

	out := make(map[int][]PlayTestingInterestHero, len(interestIDs))
	for rows.Next() {
		var interestID int
		var h PlayTestingInterestHero
		if err := rows.Scan(&interestID, &h.HeroID, &h.Name, &h.Young, &h.CardImageURL, &h.ArtImageURL); err != nil {
			return nil, fmt.Errorf("repository: scan play testing interest hero: %w", err)
		}
		out[interestID] = append(out[interestID], h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing interest heroes rows: %w", err)
	}
	return out, nil
}

// UpsertPlayTestingSessionInterest creates or replaces the caller's interest signup.
func (r *Repository) UpsertPlayTestingSessionInterest(ctx context.Context, sessionID, userID int, heroIDs []int, note string) (*PlayTestingSessionInterest, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	session, err := r.GetPlayTestingSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session.UserID == userID {
		return nil, ErrPlayTestingOwnerInterest
	}
	if session.Status == PlayTestingSessionStatusClosed {
		return nil, ErrPlayTestingSessionClosed
	}
	note = strings.TrimSpace(note)
	if utf8.RuneCountInString(note) > PlayTestingInterestNoteMaxRunes {
		return nil, ErrPlayTestingInterestNoteLen
	}
	seen := make(map[int]struct{}, len(heroIDs))
	unique := make([]int, 0, len(heroIDs))
	for _, id := range heroIDs {
		if id <= 0 {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		unique = append(unique, id)
	}
	if len(unique) == 0 {
		return nil, ErrPlayTestingInterestHeroes
	}
	if err := r.HeroesExistAndLegalInFormat(ctx, unique, session.Format); err != nil {
		return nil, err
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("repository: begin play testing interest: %w", err)
	}
	defer tx.Rollback(ctx)

	var interestID int
	err = tx.QueryRow(ctx, `
SELECT id FROM play_testing_session_interests
WHERE session_id = $1 AND user_id = $2
LIMIT 1`, sessionID, userID).Scan(&interestID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("repository: find play testing interest: %w", err)
	}
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `
INSERT INTO play_testing_session_interests (session_id, user_id, note)
VALUES ($1, $2, $3)
RETURNING id`, sessionID, userID, note).Scan(&interestID)
		if err != nil {
			return nil, fmt.Errorf("repository: insert play testing interest: %w", err)
		}
	} else {
		_, err = tx.Exec(ctx, `
UPDATE play_testing_session_interests
SET note = $2, updated_at = now()
WHERE id = $1`, interestID, note)
		if err != nil {
			return nil, fmt.Errorf("repository: update play testing interest: %w", err)
		}
		_, err = tx.Exec(ctx, `DELETE FROM play_testing_session_interest_heroes WHERE interest_id = $1`, interestID)
		if err != nil {
			return nil, fmt.Errorf("repository: clear play testing interest heroes: %w", err)
		}
	}

	for _, heroID := range unique {
		_, err = tx.Exec(ctx, `
INSERT INTO play_testing_session_interest_heroes (interest_id, hero_id)
VALUES ($1, $2)`, interestID, heroID)
		if err != nil {
			return nil, fmt.Errorf("repository: insert play testing interest hero: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("repository: commit play testing interest: %w", err)
	}

	list, err := r.ListPlayTestingSessionInterests(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].ID == interestID {
			return &list[i], nil
		}
	}
	return nil, ErrPlayTestingInterestNotFound
}

// DeletePlayTestingSessionInterest removes an interest signup.
// callerUserID must be the interest owner, or sessionOwnerOrAdmin must be true.
func (r *Repository) DeletePlayTestingSessionInterest(ctx context.Context, sessionID, interestUserID, callerUserID int, sessionOwnerOrAdmin bool) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if !sessionOwnerOrAdmin && interestUserID != callerUserID {
		return fmt.Errorf("repository: forbidden")
	}
	tag, err := r.pool.Exec(ctx, `
DELETE FROM play_testing_session_interests
WHERE session_id = $1 AND user_id = $2`, sessionID, interestUserID)
	if err != nil {
		return fmt.Errorf("repository: delete play testing interest: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrPlayTestingInterestNotFound
	}
	return nil
}

var ErrPlayTestingRecordingNotFound = errors.New("repository: play testing recording not found")

// PlayTestingSessionRecording is a recording linked to a play-testing session.
type PlayTestingSessionRecording struct {
	ID                     int
	SessionID              int
	UserID                 int
	RecordingID            int
	CreatedAt              time.Time
	URL                    string
	Label                  *string
	Format                 int16
	FirstHeroName          *string
	FirstHeroArtImageURL   *string
	SecondHeroName         *string
	SecondHeroArtImageURL  *string
	FirstName              *string
	Username               *string
}

// ListPlayTestingSessionRecordings returns recordings linked to a session, newest first.
func (r *Repository) ListPlayTestingSessionRecordings(ctx context.Context, sessionID int) ([]PlayTestingSessionRecording, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if sessionID <= 0 {
		return nil, fmt.Errorf("repository: invalid session id")
	}
	const q = `
SELECT pr.id, pr.session_id, pr.user_id, pr.recording_id, pr.created_at,
       rec.url, rec.label, rec.format,
       h1.name, h1.art_image_url, h2.name, h2.art_image_url,
       u.first_name, u.username
FROM play_testing_session_recordings pr
INNER JOIN recordings rec ON rec.id = pr.recording_id
INNER JOIN users u ON u.id = pr.user_id
LEFT JOIN heroes h1 ON h1.id = rec.first_hero_id
LEFT JOIN heroes h2 ON h2.id = rec.second_hero_id
WHERE pr.session_id = $1
ORDER BY pr.created_at DESC, pr.id DESC`
	rows, err := r.pool.Query(ctx, q, sessionID)
	if err != nil {
		return nil, fmt.Errorf("repository: list play testing session recordings: %w", err)
	}
	defer rows.Close()

	out := make([]PlayTestingSessionRecording, 0, 8)
	for rows.Next() {
		var row PlayTestingSessionRecording
		if err := rows.Scan(
			&row.ID, &row.SessionID, &row.UserID, &row.RecordingID, &row.CreatedAt,
			&row.URL, &row.Label, &row.Format,
			&row.FirstHeroName, &row.FirstHeroArtImageURL, &row.SecondHeroName, &row.SecondHeroArtImageURL,
			&row.FirstName, &row.Username,
		); err != nil {
			return nil, fmt.Errorf("repository: scan play testing session recording: %w", err)
		}
		out = append(out, row)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list play testing session recordings rows: %w", err)
	}
	return out, nil
}

// CreatePlayTestingSessionRecording creates a recording and links it to the session.
// Only the session owner may create recordings for the session.
func (r *Repository) CreatePlayTestingSessionRecording(
	ctx context.Context,
	sessionID, userID int,
	url string,
	label *string,
	firstHeroID, secondHeroID int,
) (*PlayTestingSessionRecording, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	session, err := r.GetPlayTestingSessionByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if session.UserID != userID {
		return nil, ErrPlayTestingNotSessionOwner
	}
	url = strings.TrimSpace(url)
	if url == "" {
		return nil, fmt.Errorf("repository: recording url required")
	}
	if firstHeroID <= 0 || secondHeroID <= 0 {
		return nil, fmt.Errorf("repository: both heroes are required")
	}
	if firstHeroID == secondHeroID {
		return nil, fmt.Errorf("repository: heroes must be different")
	}
	if err := r.HeroesExistAndLegalInFormat(ctx, []int{firstHeroID, secondHeroID}, session.Format); err != nil {
		return nil, err
	}

	var labelPtr *string
	if label != nil {
		trimmed := strings.TrimSpace(*label)
		if trimmed != "" {
			labelPtr = &trimmed
		}
	}

	rec, err := r.CreateRecording(ctx, CreateRecordingInput{
		UserID:       userID,
		URL:          url,
		Label:        labelPtr,
		FirstHeroID:  firstHeroID,
		SecondHeroID: secondHeroID,
		Format:       session.Format,
	})
	if err != nil {
		return nil, err
	}

	var linkID int
	err = r.pool.QueryRow(ctx, `
INSERT INTO play_testing_session_recordings (session_id, recording_id, user_id)
VALUES ($1, $2, $3)
RETURNING id`, sessionID, rec.ID, userID).Scan(&linkID)
	if err != nil {
		return nil, fmt.Errorf("repository: link play testing session recording: %w", err)
	}

	list, err := r.ListPlayTestingSessionRecordings(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].ID == linkID {
			return &list[i], nil
		}
	}
	return nil, ErrPlayTestingRecordingNotFound
}

// DeletePlayTestingSessionRecording unlinks a recording from a session.
// Only the session owner (or admin via caller flag) may delete.
func (r *Repository) DeletePlayTestingSessionRecording(ctx context.Context, sessionID, linkID, callerUserID int, isAdmin bool) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	session, err := r.GetPlayTestingSessionByID(ctx, sessionID)
	if err != nil {
		return err
	}
	if session.UserID != callerUserID && !isAdmin {
		return ErrPlayTestingNotSessionOwner
	}
	tag, err := r.pool.Exec(ctx, `
DELETE FROM play_testing_session_recordings
WHERE id = $1 AND session_id = $2`, linkID, sessionID)
	if err != nil {
		return fmt.Errorf("repository: delete play testing session recording: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrPlayTestingRecordingNotFound
	}
	return nil
}
