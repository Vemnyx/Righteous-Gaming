package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	firebaseauth "firebase.google.com/go/v4/auth"

	"righteous-gaming/backend/internal/client"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
)

var ErrValidation = errors.New("service: validation failed")

// UserService coordinates user-related use cases.
type UserService struct {
	repo *repository.Repository
	fb   *client.Firebase
}

func NewUserService(repo *repository.Repository, fb *client.Firebase) *UserService {
	return &UserService{repo: repo, fb: fb}
}

// CreateUser validates input, persists to Postgres, creates the Firebase Auth user with the same
// UID and email, then returns the domain user. On Firebase failure after DB insert, the DB row is removed.
func (s *UserService) CreateUser(ctx context.Context, in domain.User) (*domain.User, error) {
	email := strings.TrimSpace(in.Email)
	uid := strings.TrimSpace(in.UID)
	if email == "" {
		return nil, fmt.Errorf("%w: email is required", ErrValidation)
	}
	if uid == "" {
		return nil, fmt.Errorf("%w: uid is required", ErrValidation)
	}

	role := domain.RoleMember
	if in.Role != nil {
		if !in.Role.Valid() {
			return nil, fmt.Errorf("%w: invalid role", ErrValidation)
		}
		role = *in.Role
	}

	row, err := s.repo.CreateUser(ctx, repository.CreateUserInput{
		Email:    email,
		Username: in.Username,
		UID:      uid,
		Role:     int(role),
	})
	if err != nil {
		return nil, fmt.Errorf("service: create user: %w", err)
	}

	params := firebaseParamsFromRow(email, uid, in.Username)

	if _, err := s.fb.CreateUser(ctx, params); err != nil {
		if deleteErr := s.repo.DeleteUserByID(ctx, row.ID); deleteErr != nil {
			return nil, fmt.Errorf(
				"service: firebase create user: %w (also failed to rollback db user id=%d: %v)",
				err,
				row.ID,
				deleteErr,
			)
		}
		return nil, fmt.Errorf("service: firebase create user: %w", err)
	}

	return domainUserFromRepo(row), nil
}

// firebaseDefaultPassword is a provisional password for new Firebase Email/Password users.
// Replace with a secure random value or delegated auth before production.
const firebaseDefaultPassword = "temp-password"

func firebaseParamsFromRow(email, uid string, username *string) *firebaseauth.UserToCreate {
	p := (&firebaseauth.UserToCreate{}).
		UID(uid).
		Email(email).
		EmailVerified(false).
		Disabled(false).
		Password(firebaseDefaultPassword)
	if username != nil {
		n := strings.TrimSpace(*username)
		if n != "" {
			p = p.DisplayName(n)
		}
	}
	return p
}

func domainUserFromRepo(u *repository.User) *domain.User {
	r := domain.Role(u.Role)
	return &domain.User{
		ID:        u.ID,
		Email:     u.Email,
		Username:  u.Username,
		UID:       u.UID,
		Role:      &r,
		CreatedAt: &u.CreatedAt,
	}
}
