package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrUserNotFound = errors.New("repository: user not found")

// User is a row from users.
type User struct {
	ID        int
	Email     string
	Username  *string
	UID       string
	Role      int
	CreatedAt time.Time
}

// CreateUserInput holds fields required to insert a user (id and created_at are set by the DB).
type CreateUserInput struct {
	Email    string
	Username *string
	UID      string
	Role     int
}

// UserByUID returns the user with the given uid, or ErrUserNotFound.
func (r *Repository) UserByUID(ctx context.Context, uid string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, email, username, uid, role, created_at
FROM users
WHERE uid = $1`
	row := r.pool.QueryRow(ctx, q, uid)
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.UID, &u.Role, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user by uid: %w", err)
	}
	return &u, nil
}

// CreateUser inserts a new user and returns the persisted row.
func (r *Repository) CreateUser(ctx context.Context, in CreateUserInput) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO users (email, username, uid, role)
VALUES ($1, $2, $3, $4)
RETURNING id, email, username, uid, role, created_at`
	row := r.pool.QueryRow(ctx, q, in.Email, in.Username, in.UID, in.Role)
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.UID, &u.Role, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("repository: create user: %w", err)
	}
	return &u, nil
}
