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
	ID           int
	Email        string
	Username     *string
	FirstName    *string
	LastName     *string
	UID          string
	Role         int
	CreatedAt    time.Time
	RegisteredAt *time.Time
}

const userSelectColumns = `
SELECT id, email, username, first_name, last_name, COALESCE(uid, ''), role, created_at`

// CreateUserInput holds fields required to insert a user (id and created_at are set by the DB).
type CreateUserInput struct {
	Email     string
	Username  *string
	FirstName *string
	LastName  *string
	UID       string
	Role      int
}

func scanUserRow(row pgx.Row) (*User, error) {
	var u User
	if err := row.Scan(
		&u.ID, &u.Email, &u.Username, &u.FirstName, &u.LastName, &u.UID, &u.Role, &u.CreatedAt,
	); err != nil {
		return nil, err
	}
	return &u, nil
}
func (r *Repository) UserByUID(ctx context.Context, uid string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = userSelectColumns + `
FROM users
WHERE uid = $1`
	row := r.pool.QueryRow(ctx, q, uid)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user by uid: %w", err)
	}
	return u, nil
}

// UserByID returns the user with the given primary key, or ErrUserNotFound.
func (r *Repository) UserByID(ctx context.Context, id int) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if id <= 0 {
		return nil, fmt.Errorf("repository: invalid user id")
	}
	const q = userSelectColumns + `
FROM users
WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user by id: %w", err)
	}
	return u, nil
}

// UserByEmail returns the user with the given email, or ErrUserNotFound.
func (r *Repository) UserByEmail(ctx context.Context, email string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = userSelectColumns + `
FROM users
WHERE email = $1`
	row := r.pool.QueryRow(ctx, q, email)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user by email: %w", err)
	}
	return u, nil
}

// UserByEmailWithoutUID returns the invited user row for email where uid is null/empty.
func (r *Repository) UserByEmailWithoutUID(ctx context.Context, email string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = userSelectColumns + `
FROM users
WHERE email = $1 AND (uid IS NULL OR btrim(uid) = '')`
	row := r.pool.QueryRow(ctx, q, email)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user by email without uid: %w", err)
	}
	return u, nil
}

// UsersByEmailOrUsername returns all users whose email matches, or whose username
// matches when username is non-nil.
func (r *Repository) UsersByEmailOrUsername(ctx context.Context, email string, username *string) ([]User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = userSelectColumns + `
FROM users
WHERE email = $1 OR ($2::varchar IS NOT NULL AND username = $2)`
	rows, err := r.pool.Query(ctx, q, email, username)
	if err != nil {
		return nil, fmt.Errorf("repository: users by email or username: %w", err)
	}
	defer rows.Close()

	out := make([]User, 0, 2)
	for rows.Next() {
		u, err := scanUserRow(rows)
		if err != nil {
			return nil, fmt.Errorf("repository: users by email or username scan: %w", err)
		}
		out = append(out, *u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: users by email or username rows: %w", err)
	}
	return out, nil
}

// CompleteRegistrationByID updates the invited row with uid, username, names, and registration timestamp.
func (r *Repository) CompleteRegistrationByID(ctx context.Context, id int, uid string, username, firstName, lastName *string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
UPDATE users
SET uid = $2,
    username = $3,
    first_name = $4,
    last_name = $5,
    registered_at = now()
WHERE id = $1
RETURNING id, email, username, first_name, last_name, COALESCE(uid, ''), role, created_at`
	row := r.pool.QueryRow(ctx, q, id, uid, username, firstName, lastName)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: complete registration by id: %w", err)
	}
	return u, nil
}

// CompleteRegistrationByIDAndDeleteInvite updates the invited user and removes the invite row in one transaction.
func (r *Repository) CompleteRegistrationByIDAndDeleteInvite(ctx context.Context, userID int, uid string, username, firstName, lastName *string, inviteCode string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("repository: begin complete registration: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	const updateQ = `
UPDATE users
SET uid = $2,
    username = $3,
    first_name = $4,
    last_name = $5,
    registered_at = now()
WHERE id = $1
RETURNING id, email, username, first_name, last_name, COALESCE(uid, ''), role, created_at`
	row := tx.QueryRow(ctx, updateQ, userID, uid, username, firstName, lastName)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: complete registration update: %w", err)
	}

	tag, err := tx.Exec(ctx, `DELETE FROM user_registration WHERE user_id = $1 AND code = $2`, userID, inviteCode)
	if err != nil {
		return nil, fmt.Errorf("repository: delete user registration: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return nil, fmt.Errorf("repository: delete user registration: expected 1 row affected, got %d", tag.RowsAffected())
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("repository: commit complete registration: %w", err)
	}
	return u, nil
}

// CreateUser inserts a new user and returns the persisted row.
func (r *Repository) CreateUser(ctx context.Context, in CreateUserInput) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO users (email, username, uid, role)
VALUES ($1, $2, $3, $4)
RETURNING id, email, username, first_name, last_name, uid, role, created_at`
	row := r.pool.QueryRow(ctx, q, in.Email, in.Username, in.UID, in.Role)
	u, err := scanUserRow(row)
	if err != nil {
		return nil, fmt.Errorf("repository: create user: %w", err)
	}
	return u, nil
}

// UpdateUserProfile updates first and last name for a user.
func (r *Repository) UpdateUserProfile(ctx context.Context, userID int, firstName, lastName *string) (*User, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if userID <= 0 {
		return nil, fmt.Errorf("repository: invalid user id")
	}
	const q = `
UPDATE users
SET first_name = $2,
    last_name = $3
WHERE id = $1
RETURNING id, email, username, first_name, last_name, COALESCE(uid, ''), role, created_at`
	row := r.pool.QueryRow(ctx, q, userID, firstName, lastName)
	u, err := scanUserRow(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: update user profile: %w", err)
	}
	return u, nil
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

// ListUsersPaged returns a page of users ordered by id ascending, plus total row count for pagination.
func (r *Repository) ListUsersPaged(ctx context.Context, limit, offset int) ([]User, int, error) {
	if r.pool == nil {
		return nil, 0, fmt.Errorf("repository: pool is closed")
	}
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	if offset < 0 {
		offset = 0
	}

	var total int
	if err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("repository: count users: %w", err)
	}

	const q = `
SELECT id, email, username, COALESCE(uid, ''), role, created_at, registered_at
FROM users
ORDER BY id ASC
LIMIT $1 OFFSET $2`
	rows, err := r.pool.Query(ctx, q, limit, offset)
	if err != nil {
		return nil, 0, fmt.Errorf("repository: list users paged: %w", err)
	}
	defer rows.Close()

	list := make([]User, 0, limit)
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Username, &u.UID, &u.Role, &u.CreatedAt, &u.RegisteredAt); err != nil {
			return nil, 0, fmt.Errorf("repository: list users paged scan: %w", err)
		}
		list = append(list, u)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("repository: list users paged rows: %w", err)
	}
	return list, total, nil
}

// DeckFilterUser is a minimal user row for deck list filtering (id + display fields).
type DeckFilterUser struct {
	ID       int
	Email    string
	Username *string
}

// ListUsersForDeckFilter returns every user ordered by display name (username, else email).
func (r *Repository) ListUsersForDeckFilter(ctx context.Context) ([]DeckFilterUser, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT id, email, username
FROM users
ORDER BY COALESCE(NULLIF(TRIM(username), ''), email) ASC, id ASC`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("repository: list users for deck filter: %w", err)
	}
	defer rows.Close()

	var out []DeckFilterUser
	for rows.Next() {
		var u DeckFilterUser
		if err := rows.Scan(&u.ID, &u.Email, &u.Username); err != nil {
			return nil, fmt.Errorf("repository: list users for deck filter scan: %w", err)
		}
		out = append(out, u)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("repository: list users for deck filter rows: %w", err)
	}
	return out, nil
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
