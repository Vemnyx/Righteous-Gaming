package repository

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// UserSettings is a row from user_settings.
type UserSettings struct {
	UserID               int
	CardRaterQuickSubmit bool
}

// GetUserSettings returns settings for the user, or defaults when no row exists.
func (r *Repository) GetUserSettings(ctx context.Context, userID int) (UserSettings, error) {
	if r.pool == nil {
		return UserSettings{}, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT user_id, card_rater_quick_submit
FROM user_settings
WHERE user_id = $1`
	var out UserSettings
	err := r.pool.QueryRow(ctx, q, userID).Scan(&out.UserID, &out.CardRaterQuickSubmit)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return UserSettings{UserID: userID, CardRaterQuickSubmit: false}, nil
		}
		return UserSettings{}, fmt.Errorf("repository: get user settings: %w", err)
	}
	return out, nil
}

// UpsertUserSettings inserts or updates user_settings for the user.
func (r *Repository) UpsertUserSettings(ctx context.Context, userID int, cardRaterQuickSubmit bool) (UserSettings, error) {
	if r.pool == nil {
		return UserSettings{}, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO user_settings (user_id, card_rater_quick_submit)
VALUES ($1, $2)
ON CONFLICT (user_id) DO UPDATE
SET card_rater_quick_submit = EXCLUDED.card_rater_quick_submit
RETURNING user_id, card_rater_quick_submit`
	var out UserSettings
	err := r.pool.QueryRow(ctx, q, userID, cardRaterQuickSubmit).Scan(&out.UserID, &out.CardRaterQuickSubmit)
	if err != nil {
		return UserSettings{}, fmt.Errorf("repository: upsert user settings: %w", err)
	}
	return out, nil
}
