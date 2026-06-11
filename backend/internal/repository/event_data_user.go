package repository

import (
	"context"
	"encoding/json"
	"time"
)

type EventDataUser struct {
	ID              int
	EventDataID     int
	EventRoundID    int
	UserID          int
	RoundNumber     int
	Kind            string
	Payload         json.RawMessage
	HeroID          *int
	HeroName        *string
	HeroArtImageURL *string
	CreatedAt       time.Time
	FirstName       string
	LastName        string
	EventType       int16
	StreamLabel     *string
}

type UpsertEventDataUserParams struct {
	EventDataID  int
	EventRoundID int
	UserID       int
	RoundNumber  int
	Kind         string
	Payload      json.RawMessage
	HeroID       *int
}

const eventDataUserSelectCols = `
edu.id, edu.event_data_id, edu.event_round_id, edu.user_id, edu.round_number, edu.kind, edu.payload,
edu.hero_id, h.name, h.art_image_url, edu.created_at,
u.first_name, u.last_name, ed.event_type, ed.label`

const eventDataUserJoins = `
FROM event_data_users edu
JOIN event_data ed ON ed.id = edu.event_data_id
JOIN users u ON u.id = edu.user_id
LEFT JOIN heroes h ON h.id = edu.hero_id`

func scanEventDataUser(row interface {
	Scan(dest ...any) error
}) (EventDataUser, error) {
	var r EventDataUser
	err := row.Scan(
		&r.ID, &r.EventDataID, &r.EventRoundID, &r.UserID, &r.RoundNumber, &r.Kind, &r.Payload,
		&r.HeroID, &r.HeroName, &r.HeroArtImageURL, &r.CreatedAt,
		&r.FirstName, &r.LastName, &r.EventType, &r.StreamLabel,
	)
	return r, err
}

func (r *Repository) UpsertEventDataUser(ctx context.Context, p UpsertEventDataUserParams) error {
	_, err := r.pool.Exec(ctx, `
INSERT INTO event_data_users (event_data_id, event_round_id, user_id, round_number, kind, payload, hero_id)
VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
ON CONFLICT (event_round_id, user_id, kind) DO UPDATE SET
  payload = EXCLUDED.payload,
  hero_id = EXCLUDED.hero_id`,
		p.EventDataID, p.EventRoundID, p.UserID, p.RoundNumber, p.Kind, p.Payload, p.HeroID,
	)
	return err
}

func (r *Repository) ListEventDataUsersByEventID(ctx context.Context, eventID int) ([]EventDataUser, error) {
	rows, err := r.pool.Query(ctx, `
SELECT `+eventDataUserSelectCols+`
`+eventDataUserJoins+`
WHERE ed.event_id = $1
ORDER BY edu.event_data_id ASC, edu.round_number ASC, edu.kind ASC, edu.user_id ASC`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventDataUser
	for rows.Next() {
		row, err := scanEventDataUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func (r *Repository) ListEventDataUsersByEventDataID(ctx context.Context, eventDataID int) ([]EventDataUser, error) {
	rows, err := r.pool.Query(ctx, `
SELECT `+eventDataUserSelectCols+`
`+eventDataUserJoins+`
WHERE edu.event_data_id = $1
ORDER BY edu.round_number ASC, edu.kind ASC, edu.user_id ASC`, eventDataID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []EventDataUser
	for rows.Next() {
		row, err := scanEventDataUser(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}
