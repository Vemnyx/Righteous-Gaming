package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

// UserRegistration is a row from user_registration.
type UserRegistration struct {
	UserID   int
	Email    string
	Code     string
	ExpireAt time.Time
}

// CreateUserRegistrationInput holds fields required to insert a user_registration row.
type CreateUserRegistrationInput struct {
	UserID   int
	Email    string
	Code     string
	ExpireAt time.Time
}

// UserRegistrationByCode returns the registration row with the given code, or ErrUserNotFound.
func (r *Repository) UserRegistrationByCode(ctx context.Context, code string) (*UserRegistration, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
SELECT user_id, email, code, expire_at
FROM user_registration
WHERE code = $1`
	row := r.pool.QueryRow(ctx, q, code)
	var ur UserRegistration
	if err := row.Scan(&ur.UserID, &ur.Email, &ur.Code, &ur.ExpireAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, fmt.Errorf("repository: user registration by code: %w", err)
	}
	return &ur, nil
}

// CreateUserRegistration inserts a user_registration row and returns the persisted row.
func (r *Repository) CreateUserRegistration(ctx context.Context, in CreateUserRegistrationInput) (*UserRegistration, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO user_registration (user_id, email, code, expire_at)
VALUES ($1, $2, $3, $4)
RETURNING user_id, email, code, expire_at`
	row := r.pool.QueryRow(ctx, q, in.UserID, in.Email, in.Code, in.ExpireAt)
	var ur UserRegistration
	if err := row.Scan(&ur.UserID, &ur.Email, &ur.Code, &ur.ExpireAt); err != nil {
		return nil, fmt.Errorf("repository: create user registration: %w", err)
	}
	return &ur, nil
}

// UpsertUserRegistration inserts or updates a user_registration row by user_id.
func (r *Repository) UpsertUserRegistration(ctx context.Context, in CreateUserRegistrationInput) (*UserRegistration, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	const q = `
INSERT INTO user_registration (user_id, email, code, expire_at)
VALUES ($1, $2, $3, $4)
ON CONFLICT (user_id)
DO UPDATE SET
  email = EXCLUDED.email,
  code = EXCLUDED.code,
  expire_at = EXCLUDED.expire_at
RETURNING user_id, email, code, expire_at`
	row := r.pool.QueryRow(ctx, q, in.UserID, in.Email, in.Code, in.ExpireAt)
	var ur UserRegistration
	if err := row.Scan(&ur.UserID, &ur.Email, &ur.Code, &ur.ExpireAt); err != nil {
		return nil, fmt.Errorf("repository: upsert user registration: %w", err)
	}
	return &ur, nil
}
