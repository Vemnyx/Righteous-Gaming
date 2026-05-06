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

// UserByEmail returns the user with the given email, or ErrUserNotFound.
func (r *Repository) UserByEmail(ctx context.Context, email string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, email, username, COALESCE(uid, ''), role, created_at
FROM users
WHERE email = $1`
	row := r.pool.QueryRow(ctx, q, email)
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Username, &u.UID, &u.Role, &u.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user by email: %w", err)
	}
	return &u, nil
}

// UsersByEmailOrUsername returns all users whose email matches, or whose username
// matches when username is non-nil.
func (r *Repository) UsersByEmailOrUsername(ctx context.Context, email string, username *string) ([]User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, email, username, COALESCE(uid, ''), role, created_at
FROM users
WHERE email = $1 OR ($2::varchar IS NOT NULL AND username = $2)`
	rows, err := r.pool.Query(ctx, q, email, username)
	if err != nil {
		return nil, fmt.Errorf("repository: users by email or username: %w", err)
	}
	defer rows.Close()

	out := make([]User, 0, 2)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Username, &u.UID, &u.Role, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("repository: users by email or username scan: %w", err)
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: users by email or username rows: %w", err)
	}
	return out, nil
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

// CreateUserIfAbsent inserts a user row for email/role and ignores duplicate-email conflicts.
func (r *Repository) CreateUserIfAbsent(ctx context.Context, email string, role int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO users (email, role)
VALUES ($1, $2)
ON CONFLICT (email) DO NOTHING`
	if _, err := r.pool.Exec(ctx, q, email, role); err != nil {
		return fmt.Errorf("repository: create user if absent: %w", err)
	}
	return nil
}

// DeleteUserByID removes a user row by primary key (used when compensating a failed downstream step).
func (r *Repository) DeleteUserByID(ctx context.Context, id int) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	tag, err := r.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("repository: delete user: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("repository: delete user: no rows for id=%d", id)
	}
	return nil
}
