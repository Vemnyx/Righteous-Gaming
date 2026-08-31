package repository

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	ReleaseTeamStatusCurrent int16 = 0
	ReleaseTeamStatusPast    int16 = 1
)

var (
	ErrReleaseTeamSessionNotFound = errors.New("repository: release team session not found")
	ErrReleaseTeamMemberNotFound  = errors.New("repository: release team member not found")
	ErrReleaseTeamNoteNotFound    = errors.New("repository: release team note not found")
	ErrReleaseTeamDeckNotFound    = errors.New("repository: release team deck not found")
	ErrReleaseTeamRecordingNotFound = errors.New("repository: release team recording not found")
	ErrReleaseTeamHeroNotInSession  = errors.New("repository: hero not in release team session")
	ErrReleaseTeamSessionClosed     = errors.New("repository: release team session is closed")
)

// ReleaseTeamHeroMeta is a hero attached to a release-team session.
type ReleaseTeamHeroMeta struct {
	ID           int
	Name         string
	Young        bool
	CardImageURL *string
	ArtImageURL  *string
}

// ReleaseTeamSession is a release-team planning session.
type ReleaseTeamSession struct {
	ID              int
	Title           string
	Format          int16
	SetID           *int
	SetName         *string
	Status          int16
	CreatedByUserID int
	CreatedAt       time.Time
	ClosedAt        *time.Time
	Heroes          []ReleaseTeamHeroMeta
}

// ReleaseTeamMember is a user on a hero team within a session.
type ReleaseTeamMember struct {
	SessionID     int
	HeroID        int
	UserID        int
	IsCaptain     bool
	JoinedAt      time.Time
	FirstName     *string
	LastName      *string
	Username      *string
	Email         string
}

// ReleaseTeamNote is a team note for a session hero.
type ReleaseTeamNote struct {
	ID          int
	SessionID   int
	HeroID      int
	UserID      int
	Body        string // published content shown to the team (empty until first publish)
	DraftBody   string // author's working copy
	PublishedAt *time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
	FirstName   *string
	Username    *string
	Email       string
}

// ReleaseTeamDeckLink joins a deck to a release-team hero slot.
type ReleaseTeamDeckLink struct {
	ID        int
	SessionID int
	HeroID    int
	UserID    int
	DeckID    int
	CreatedAt time.Time
	DeckName  string
	Format    int16
	FirstName *string
	Username  *string
	Email     string
	FabraryLink *string
}

// ReleaseTeamRecordingLink joins a recording to a release-team hero slot.
type ReleaseTeamRecordingLink struct {
	ID          int
	SessionID   int
	HeroID      int
	UserID      int
	RecordingID int
	CreatedAt   time.Time
	URL         string
	Label       *string
	Format      int16
	FirstName   *string
	Username    *string
	Email       string
}

// CreateReleaseTeamSessionInput creates a session with selected heroes.
type CreateReleaseTeamSessionInput struct {
	Title           string
	Format          int16
	SetID           *int
	CreatedByUserID int
	HeroIDs         []int
}

// ListReleaseTeamSessions returns sessions for a status (current or past), newest first.
func (r *Repository) ListReleaseTeamSessions(ctx context.Context, status int16) ([]ReleaseTeamSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT s.id, s.title, s.format, s.set_id, st.name, s.status, s.created_by_user_id, s.created_at, s.closed_at
FROM release_team_sessions s
LEFT JOIN sets st ON st.id = s.set_id
WHERE s.status = $1
ORDER BY s.created_at DESC, s.id DESC`

	rows, err := r.pool.Query(ctx, q, status)
	if err != nil {
		return nil, fmt.Errorf("repository: list release team sessions: %w", err)
	}
	defer rows.Close()

	sessions := make([]ReleaseTeamSession, 0, 16)
	ids := make([]int, 0, 16)
	for rows.Next() {
		var s ReleaseTeamSession
		if err := rows.Scan(
			&s.ID, &s.Title, &s.Format, &s.SetID, &s.SetName, &s.Status,
			&s.CreatedByUserID, &s.CreatedAt, &s.ClosedAt,
		); err != nil {
			return nil, fmt.Errorf("repository: scan release team session: %w", err)
		}
		s.Heroes = []ReleaseTeamHeroMeta{}
		sessions = append(sessions, s)
		ids = append(ids, s.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list release team sessions rows: %w", err)
	}
	if len(ids) == 0 {
		return sessions, nil
	}
	heroesBySession, err := r.listReleaseTeamSessionHeroes(ctx, ids)
	if err != nil {
		return nil, err
	}
	for i := range sessions {
		if hs, ok := heroesBySession[sessions[i].ID]; ok {
			sessions[i].Heroes = hs
		}
	}
	return sessions, nil
}

// GetReleaseTeamSession returns one session with heroes.
func (r *Repository) GetReleaseTeamSession(ctx context.Context, sessionID int) (*ReleaseTeamSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if sessionID <= 0 {
		return nil, ErrReleaseTeamSessionNotFound
	}
	const q = `
SELECT s.id, s.title, s.format, s.set_id, st.name, s.status, s.created_by_user_id, s.created_at, s.closed_at
FROM release_team_sessions s
LEFT JOIN sets st ON st.id = s.set_id
WHERE s.id = $1`
	var s ReleaseTeamSession
	err := r.pool.QueryRow(ctx, q, sessionID).Scan(
		&s.ID, &s.Title, &s.Format, &s.SetID, &s.SetName, &s.Status,
		&s.CreatedByUserID, &s.CreatedAt, &s.ClosedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrReleaseTeamSessionNotFound
		}
		return nil, fmt.Errorf("repository: get release team session: %w", err)
	}
	heroesBySession, err := r.listReleaseTeamSessionHeroes(ctx, []int{sessionID})
	if err != nil {
		return nil, err
	}
	s.Heroes = heroesBySession[sessionID]
	if s.Heroes == nil {
		s.Heroes = []ReleaseTeamHeroMeta{}
	}
	return &s, nil
}

func (r *Repository) listReleaseTeamSessionHeroes(ctx context.Context, sessionIDs []int) (map[int][]ReleaseTeamHeroMeta, error) {
	const q = `
SELECT sh.session_id, h.id, h.name, h.young, h.card_image_url, h.art_image_url
FROM release_team_session_heroes sh
INNER JOIN heroes h ON h.id = sh.hero_id
WHERE sh.session_id = ANY($1)
ORDER BY h.name ASC, h.id ASC`
	rows, err := r.pool.Query(ctx, q, sessionIDs)
	if err != nil {
		return nil, fmt.Errorf("repository: list release team session heroes: %w", err)
	}
	defer rows.Close()

	out := make(map[int][]ReleaseTeamHeroMeta, len(sessionIDs))
	for rows.Next() {
		var sessionID int
		var h ReleaseTeamHeroMeta
		if err := rows.Scan(&sessionID, &h.ID, &h.Name, &h.Young, &h.CardImageURL, &h.ArtImageURL); err != nil {
			return nil, fmt.Errorf("repository: scan release team session hero: %w", err)
		}
		out[sessionID] = append(out[sessionID], h)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list release team session heroes rows: %w", err)
	}
	return out, nil
}

// CreateReleaseTeamSession inserts a session and its heroes.
func (r *Repository) CreateReleaseTeamSession(ctx context.Context, in CreateReleaseTeamSessionInput) (*ReleaseTeamSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	title := strings.TrimSpace(in.Title)
	if title == "" {
		return nil, fmt.Errorf("repository: title required")
	}
	if len(in.HeroIDs) == 0 {
		return nil, fmt.Errorf("repository: at least one hero required")
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("repository: begin create release team session: %w", err)
	}
	defer tx.Rollback(ctx)

	var id int
	err = tx.QueryRow(ctx, `
INSERT INTO release_team_sessions (title, format, set_id, status, created_by_user_id)
VALUES ($1, $2, $3, $4, $5)
RETURNING id`,
		title, in.Format, in.SetID, ReleaseTeamStatusCurrent, in.CreatedByUserID,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("repository: insert release team session: %w", err)
	}

	seen := make(map[int]struct{}, len(in.HeroIDs))
	for _, heroID := range in.HeroIDs {
		if heroID <= 0 {
			return nil, fmt.Errorf("repository: invalid hero_id")
		}
		if _, ok := seen[heroID]; ok {
			continue
		}
		seen[heroID] = struct{}{}
		_, err = tx.Exec(ctx, `
INSERT INTO release_team_session_heroes (session_id, hero_id)
VALUES ($1, $2)`, id, heroID)
		if err != nil {
			return nil, fmt.Errorf("repository: insert release team session hero: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("repository: commit create release team session: %w", err)
	}
	return r.GetReleaseTeamSession(ctx, id)
}

// CloseReleaseTeamSession marks a current session as past.
func (r *Repository) CloseReleaseTeamSession(ctx context.Context, sessionID int) (*ReleaseTeamSession, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	tag, err := r.pool.Exec(ctx, `
UPDATE release_team_sessions
SET status = $2, closed_at = now()
WHERE id = $1 AND status = $3`,
		sessionID, ReleaseTeamStatusPast, ReleaseTeamStatusCurrent,
	)
	if err != nil {
		return nil, fmt.Errorf("repository: close release team session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		s, getErr := r.GetReleaseTeamSession(ctx, sessionID)
		if getErr != nil {
			return nil, getErr
		}
		if s.Status == ReleaseTeamStatusPast {
			return s, nil
		}
		return nil, ErrReleaseTeamSessionNotFound
	}
	return r.GetReleaseTeamSession(ctx, sessionID)
}

// DeleteReleaseTeamSession permanently removes a session and cascaded rows.
func (r *Repository) DeleteReleaseTeamSession(ctx context.Context, sessionID int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if sessionID <= 0 {
		return ErrReleaseTeamSessionNotFound
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM release_team_sessions WHERE id = $1`, sessionID)
	if err != nil {
		return fmt.Errorf("repository: delete release team session: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrReleaseTeamSessionNotFound
	}
	return nil
}

// SessionHasHero reports whether heroID belongs to the session.
func (r *Repository) SessionHasHero(ctx context.Context, sessionID, heroID int) (bool, error) {
	if r.pool == nil {
		return false, fmt.Errorf("repository: pool is closed")
	}
	var exists bool
	err := r.pool.QueryRow(ctx, `
SELECT EXISTS(
  SELECT 1 FROM release_team_session_heroes WHERE session_id = $1 AND hero_id = $2
)`, sessionID, heroID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("repository: session has hero: %w", err)
	}
	return exists, nil
}

// requireCurrentSession returns the session or ErrReleaseTeamSessionClosed / NotFound.
func (r *Repository) requireCurrentSession(ctx context.Context, sessionID int) (*ReleaseTeamSession, error) {
	s, err := r.GetReleaseTeamSession(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	if s.Status != ReleaseTeamStatusCurrent {
		return nil, ErrReleaseTeamSessionClosed
	}
	return s, nil
}

// ListReleaseTeamMembers returns members for a session hero, captains first.
func (r *Repository) ListReleaseTeamMembers(ctx context.Context, sessionID, heroID int) ([]ReleaseTeamMember, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT m.session_id, m.hero_id, m.user_id, m.is_captain, m.joined_at,
       u.first_name, u.last_name, u.username, u.email
FROM release_team_members m
INNER JOIN users u ON u.id = m.user_id
WHERE m.session_id = $1 AND m.hero_id = $2
ORDER BY m.is_captain DESC, m.joined_at ASC, m.user_id ASC`
	rows, err := r.pool.Query(ctx, q, sessionID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: list release team members: %w", err)
	}
	defer rows.Close()

	out := make([]ReleaseTeamMember, 0, 16)
	for rows.Next() {
		var m ReleaseTeamMember
		if err := rows.Scan(
			&m.SessionID, &m.HeroID, &m.UserID, &m.IsCaptain, &m.JoinedAt,
			&m.FirstName, &m.LastName, &m.Username, &m.Email,
		); err != nil {
			return nil, fmt.Errorf("repository: scan release team member: %w", err)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// IsReleaseTeamMember reports membership for a user on a session hero.
func (r *Repository) IsReleaseTeamMember(ctx context.Context, sessionID, heroID, userID int) (bool, error) {
	if r.pool == nil {
		return false, fmt.Errorf("repository: pool is closed")
	}
	var exists bool
	err := r.pool.QueryRow(ctx, `
SELECT EXISTS(
  SELECT 1 FROM release_team_members
  WHERE session_id = $1 AND hero_id = $2 AND user_id = $3
)`, sessionID, heroID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("repository: is release team member: %w", err)
	}
	return exists, nil
}

// AddReleaseTeamMember adds a user to a hero team (current sessions only).
func (r *Repository) AddReleaseTeamMember(ctx context.Context, sessionID, heroID, userID int, asCaptain bool) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if _, err := r.requireCurrentSession(ctx, sessionID); err != nil {
		return err
	}
	ok, err := r.SessionHasHero(ctx, sessionID, heroID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrReleaseTeamHeroNotInSession
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("repository: begin add release team member: %w", err)
	}
	defer tx.Rollback(ctx)

	if asCaptain {
		_, err = tx.Exec(ctx, `
UPDATE release_team_members SET is_captain = false
WHERE session_id = $1 AND hero_id = $2 AND is_captain = true`, sessionID, heroID)
		if err != nil {
			return fmt.Errorf("repository: clear captains: %w", err)
		}
	}

	_, err = tx.Exec(ctx, `
INSERT INTO release_team_members (session_id, hero_id, user_id, is_captain)
VALUES ($1, $2, $3, $4)
ON CONFLICT (session_id, hero_id, user_id) DO UPDATE
SET is_captain = EXCLUDED.is_captain`,
		sessionID, heroID, userID, asCaptain,
	)
	if err != nil {
		return fmt.Errorf("repository: upsert release team member: %w", err)
	}
	return tx.Commit(ctx)
}

// RemoveReleaseTeamMember removes a user from a hero team.
func (r *Repository) RemoveReleaseTeamMember(ctx context.Context, sessionID, heroID, userID int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if _, err := r.requireCurrentSession(ctx, sessionID); err != nil {
		return err
	}
	tag, err := r.pool.Exec(ctx, `
DELETE FROM release_team_members
WHERE session_id = $1 AND hero_id = $2 AND user_id = $3`,
		sessionID, heroID, userID,
	)
	if err != nil {
		return fmt.Errorf("repository: remove release team member: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrReleaseTeamMemberNotFound
	}
	return nil
}

// SetReleaseTeamCaptain assigns captain (clears previous) for a current session hero.
func (r *Repository) SetReleaseTeamCaptain(ctx context.Context, sessionID, heroID, userID int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	if _, err := r.requireCurrentSession(ctx, sessionID); err != nil {
		return err
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("repository: begin set captain: %w", err)
	}
	defer tx.Rollback(ctx)

	var exists bool
	err = tx.QueryRow(ctx, `
SELECT EXISTS(
  SELECT 1 FROM release_team_members
  WHERE session_id = $1 AND hero_id = $2 AND user_id = $3
)`, sessionID, heroID, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("repository: check captain member: %w", err)
	}
	if !exists {
		return ErrReleaseTeamMemberNotFound
	}

	_, err = tx.Exec(ctx, `
UPDATE release_team_members SET is_captain = false
WHERE session_id = $1 AND hero_id = $2`, sessionID, heroID)
	if err != nil {
		return fmt.Errorf("repository: clear captains: %w", err)
	}
	_, err = tx.Exec(ctx, `
UPDATE release_team_members SET is_captain = true
WHERE session_id = $1 AND hero_id = $2 AND user_id = $3`,
		sessionID, heroID, userID,
	)
	if err != nil {
		return fmt.Errorf("repository: set captain: %w", err)
	}
	return tx.Commit(ctx)
}

// ListReleaseTeamNotes returns notes for a session hero, newest updated first.
func (r *Repository) ListReleaseTeamNotes(ctx context.Context, sessionID, heroID int) ([]ReleaseTeamNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT n.id, n.session_id, n.hero_id, n.user_id, n.body, n.draft_body, n.published_at,
       n.created_at, n.updated_at, u.first_name, u.username, u.email
FROM release_team_notes n
INNER JOIN users u ON u.id = n.user_id
WHERE n.session_id = $1 AND n.hero_id = $2
ORDER BY n.updated_at DESC, n.id DESC`
	rows, err := r.pool.Query(ctx, q, sessionID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: list release team notes: %w", err)
	}
	defer rows.Close()

	out := make([]ReleaseTeamNote, 0, 16)
	for rows.Next() {
		var n ReleaseTeamNote
		if err := rows.Scan(
			&n.ID, &n.SessionID, &n.HeroID, &n.UserID, &n.Body, &n.DraftBody, &n.PublishedAt,
			&n.CreatedAt, &n.UpdatedAt, &n.FirstName, &n.Username, &n.Email,
		); err != nil {
			return nil, fmt.Errorf("repository: scan release team note: %w", err)
		}
		out = append(out, n)
	}
	return out, rows.Err()
}

// UpsertReleaseTeamNote creates or updates the caller's note for a session hero.
// When publish is false, only draft_body is updated. When publish is true, body and
// published_at are set from the provided content as well.
func (r *Repository) UpsertReleaseTeamNote(ctx context.Context, sessionID, heroID, userID int, body string, publish bool) (*ReleaseTeamNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if _, err := r.requireCurrentSession(ctx, sessionID); err != nil {
		return nil, err
	}
	ok, err := r.SessionHasHero(ctx, sessionID, heroID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrReleaseTeamHeroNotInSession
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, fmt.Errorf("repository: note body required")
	}

	var existingID int
	err = r.pool.QueryRow(ctx, `
SELECT id FROM release_team_notes
WHERE session_id = $1 AND hero_id = $2 AND user_id = $3
ORDER BY id ASC
LIMIT 1`, sessionID, heroID, userID).Scan(&existingID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("repository: find release team note: %w", err)
	}

	var id int
	if err == nil {
		id = existingID
		if publish {
			_, err = r.pool.Exec(ctx, `
UPDATE release_team_notes
SET draft_body = $2, body = $2, published_at = now(), updated_at = now()
WHERE id = $1`, id, body)
		} else {
			_, err = r.pool.Exec(ctx, `
UPDATE release_team_notes
SET draft_body = $2, updated_at = now()
WHERE id = $1`, id, body)
		}
		if err != nil {
			return nil, fmt.Errorf("repository: update release team note: %w", err)
		}
	} else {
		if publish {
			err = r.pool.QueryRow(ctx, `
INSERT INTO release_team_notes (session_id, hero_id, user_id, body, draft_body, published_at)
VALUES ($1, $2, $3, $4, $4, now())
RETURNING id`, sessionID, heroID, userID, body).Scan(&id)
		} else {
			err = r.pool.QueryRow(ctx, `
INSERT INTO release_team_notes (session_id, hero_id, user_id, body, draft_body, published_at)
VALUES ($1, $2, $3, '', $4, NULL)
RETURNING id`, sessionID, heroID, userID, body).Scan(&id)
		}
		if err != nil {
			return nil, fmt.Errorf("repository: insert release team note: %w", err)
		}
	}
	return r.getReleaseTeamNoteByID(ctx, id)
}

// GetReleaseTeamNoteByID returns a note by id.
func (r *Repository) GetReleaseTeamNoteByID(ctx context.Context, noteID int) (*ReleaseTeamNote, error) {
	return r.getReleaseTeamNoteByID(ctx, noteID)
}

// UpdateReleaseTeamNoteByID updates a note's draft by id (owner or admin checked in handler).
// When publish is true, the draft is also published as the live body.
func (r *Repository) UpdateReleaseTeamNoteByID(ctx context.Context, noteID int, body string, publish bool) (*ReleaseTeamNote, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	body = strings.TrimSpace(body)
	if body == "" {
		return nil, fmt.Errorf("repository: note body required")
	}
	note, err := r.getReleaseTeamNoteByID(ctx, noteID)
	if err != nil {
		return nil, err
	}
	if _, err := r.requireCurrentSession(ctx, note.SessionID); err != nil {
		return nil, err
	}
	if publish {
		_, err = r.pool.Exec(ctx, `
UPDATE release_team_notes
SET draft_body = $2, body = $2, published_at = now(), updated_at = now()
WHERE id = $1`, noteID, body)
	} else {
		_, err = r.pool.Exec(ctx, `
UPDATE release_team_notes
SET draft_body = $2, updated_at = now()
WHERE id = $1`, noteID, body)
	}
	if err != nil {
		return nil, fmt.Errorf("repository: update release team note by id: %w", err)
	}
	return r.getReleaseTeamNoteByID(ctx, noteID)
}

func (r *Repository) getReleaseTeamNoteByID(ctx context.Context, noteID int) (*ReleaseTeamNote, error) {
	const q = `
SELECT n.id, n.session_id, n.hero_id, n.user_id, n.body, n.draft_body, n.published_at,
       n.created_at, n.updated_at, u.first_name, u.username, u.email
FROM release_team_notes n
INNER JOIN users u ON u.id = n.user_id
WHERE n.id = $1`
	var n ReleaseTeamNote
	err := r.pool.QueryRow(ctx, q, noteID).Scan(
		&n.ID, &n.SessionID, &n.HeroID, &n.UserID, &n.Body, &n.DraftBody, &n.PublishedAt,
		&n.CreatedAt, &n.UpdatedAt, &n.FirstName, &n.Username, &n.Email,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrReleaseTeamNoteNotFound
		}
		return nil, fmt.Errorf("repository: get release team note: %w", err)
	}
	return &n, nil
}

// ListReleaseTeamDecks returns linked decks for a session hero.
func (r *Repository) ListReleaseTeamDecks(ctx context.Context, sessionID, heroID int) ([]ReleaseTeamDeckLink, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT rd.id, rd.session_id, rd.hero_id, rd.user_id, rd.deck_id, rd.created_at,
       d.name, d.format, d.fabrary_link, u.first_name, u.username, u.email
FROM release_team_decks rd
INNER JOIN decks d ON d.id = rd.deck_id
INNER JOIN users u ON u.id = rd.user_id
WHERE rd.session_id = $1 AND rd.hero_id = $2
ORDER BY rd.created_at DESC, rd.id DESC`
	rows, err := r.pool.Query(ctx, q, sessionID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: list release team decks: %w", err)
	}
	defer rows.Close()

	out := make([]ReleaseTeamDeckLink, 0, 16)
	for rows.Next() {
		var d ReleaseTeamDeckLink
		if err := rows.Scan(
			&d.ID, &d.SessionID, &d.HeroID, &d.UserID, &d.DeckID, &d.CreatedAt,
			&d.DeckName, &d.Format, &d.FabraryLink, &d.FirstName, &d.Username, &d.Email,
		); err != nil {
			return nil, fmt.Errorf("repository: scan release team deck: %w", err)
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// LinkReleaseTeamDeck attaches a deck to a session hero.
func (r *Repository) LinkReleaseTeamDeck(ctx context.Context, sessionID, heroID, userID, deckID int) (*ReleaseTeamDeckLink, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if _, err := r.requireCurrentSession(ctx, sessionID); err != nil {
		return nil, err
	}
	ok, err := r.SessionHasHero(ctx, sessionID, heroID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrReleaseTeamHeroNotInSession
	}

	var id int
	err = r.pool.QueryRow(ctx, `
INSERT INTO release_team_decks (session_id, hero_id, user_id, deck_id)
VALUES ($1, $2, $3, $4)
ON CONFLICT (session_id, hero_id, deck_id) DO UPDATE
SET user_id = EXCLUDED.user_id
RETURNING id`, sessionID, heroID, userID, deckID).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("repository: link release team deck: %w", err)
	}
	return r.getReleaseTeamDeckByID(ctx, id)
}

func (r *Repository) getReleaseTeamDeckByID(ctx context.Context, id int) (*ReleaseTeamDeckLink, error) {
	const q = `
SELECT rd.id, rd.session_id, rd.hero_id, rd.user_id, rd.deck_id, rd.created_at,
       d.name, d.format, d.fabrary_link, u.first_name, u.username, u.email
FROM release_team_decks rd
INNER JOIN decks d ON d.id = rd.deck_id
INNER JOIN users u ON u.id = rd.user_id
WHERE rd.id = $1`
	var d ReleaseTeamDeckLink
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&d.ID, &d.SessionID, &d.HeroID, &d.UserID, &d.DeckID, &d.CreatedAt,
		&d.DeckName, &d.Format, &d.FabraryLink, &d.FirstName, &d.Username, &d.Email,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrReleaseTeamDeckNotFound
		}
		return nil, fmt.Errorf("repository: get release team deck: %w", err)
	}
	return &d, nil
}

// ListReleaseTeamRecordings returns linked recordings for a session hero.
func (r *Repository) ListReleaseTeamRecordings(ctx context.Context, sessionID, heroID int) ([]ReleaseTeamRecordingLink, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT rr.id, rr.session_id, rr.hero_id, rr.user_id, rr.recording_id, rr.created_at,
       rec.url, rec.label, rec.format, u.first_name, u.username, u.email
FROM release_team_recordings rr
INNER JOIN recordings rec ON rec.id = rr.recording_id
INNER JOIN users u ON u.id = rr.user_id
WHERE rr.session_id = $1 AND rr.hero_id = $2
ORDER BY rr.created_at DESC, rr.id DESC`
	rows, err := r.pool.Query(ctx, q, sessionID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: list release team recordings: %w", err)
	}
	defer rows.Close()

	out := make([]ReleaseTeamRecordingLink, 0, 16)
	for rows.Next() {
		var rec ReleaseTeamRecordingLink
		if err := rows.Scan(
			&rec.ID, &rec.SessionID, &rec.HeroID, &rec.UserID, &rec.RecordingID, &rec.CreatedAt,
			&rec.URL, &rec.Label, &rec.Format, &rec.FirstName, &rec.Username, &rec.Email,
		); err != nil {
			return nil, fmt.Errorf("repository: scan release team recording: %w", err)
		}
		out = append(out, rec)
	}
	return out, rows.Err()
}

// LinkReleaseTeamRecording attaches a recording to a session hero.
func (r *Repository) LinkReleaseTeamRecording(ctx context.Context, sessionID, heroID, userID, recordingID int) (*ReleaseTeamRecordingLink, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if _, err := r.requireCurrentSession(ctx, sessionID); err != nil {
		return nil, err
	}
	ok, err := r.SessionHasHero(ctx, sessionID, heroID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrReleaseTeamHeroNotInSession
	}

	var id int
	err = r.pool.QueryRow(ctx, `
INSERT INTO release_team_recordings (session_id, hero_id, user_id, recording_id)
VALUES ($1, $2, $3, $4)
ON CONFLICT (session_id, hero_id, recording_id) DO UPDATE
SET user_id = EXCLUDED.user_id
RETURNING id`, sessionID, heroID, userID, recordingID).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("repository: link release team recording: %w", err)
	}
	return r.getReleaseTeamRecordingByID(ctx, id)
}

func (r *Repository) getReleaseTeamRecordingByID(ctx context.Context, id int) (*ReleaseTeamRecordingLink, error) {
	const q = `
SELECT rr.id, rr.session_id, rr.hero_id, rr.user_id, rr.recording_id, rr.created_at,
       rec.url, rec.label, rec.format, u.first_name, u.username, u.email
FROM release_team_recordings rr
INNER JOIN recordings rec ON rec.id = rr.recording_id
INNER JOIN users u ON u.id = rr.user_id
WHERE rr.id = $1`
	var rec ReleaseTeamRecordingLink
	err := r.pool.QueryRow(ctx, q, id).Scan(
		&rec.ID, &rec.SessionID, &rec.HeroID, &rec.UserID, &rec.RecordingID, &rec.CreatedAt,
		&rec.URL, &rec.Label, &rec.Format, &rec.FirstName, &rec.Username, &rec.Email,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrReleaseTeamRecordingNotFound
		}
		return nil, fmt.Errorf("repository: get release team recording: %w", err)
	}
	return &rec, nil
}
