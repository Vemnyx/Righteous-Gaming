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
var ErrAlreadyRegistered = errors.New("service: user already registered")
var ErrEmailAlreadyRegistered = errors.New("service: email already registered")
var ErrUsernameNotAvailable = errors.New("service: username not available")

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

// CompleteRegistration creates a Firebase Auth user from registration input,
// then persists the app user row using the Firebase-generated UID.
// If DB insert fails after Firebase create, the Firebase user is rolled back.
func (s *UserService) CompleteRegistration(ctx context.Context, email string, username *string, password string) (*domain.User, error) {
	email = strings.TrimSpace(email)
	password = strings.TrimSpace(password)
	if email == "" {
		return nil, fmt.Errorf("%w: email is required", ErrValidation)
	}
	if password == "" {
		return nil, fmt.Errorf("%w: password is required", ErrValidation)
	}
	if len(password) < 6 {
		return nil, fmt.Errorf("%w: password must be at least 6 characters", ErrValidation)
	}

	var cleanUsername *string
	if username != nil {
		n := strings.TrimSpace(*username)
		if n != "" {
			cleanUsername = &n
		}
	}

	candidates, err := s.repo.UsersByEmailOrUsername(ctx, email, cleanUsername)
	if err != nil {
		return nil, fmt.Errorf("service: lookup registration conflicts: %w", err)
	}
	for _, candidate := range candidates {
		if strings.EqualFold(strings.TrimSpace(candidate.Email), email) && strings.TrimSpace(candidate.UID) != "" {
			return nil, fmt.Errorf("%w: email is already registered", ErrEmailAlreadyRegistered)
		}
		if cleanUsername != nil && candidate.Username != nil {
			if strings.EqualFold(strings.TrimSpace(*candidate.Username), *cleanUsername) {
				return nil, fmt.Errorf("%w: username is not available", ErrUsernameNotAvailable)
			}
		}
	}

	params := (&firebaseauth.UserToCreate{}).
		Email(email).
		EmailVerified(false).
		Disabled(false).
		Password(password)
	if cleanUsername != nil {
		params = params.DisplayName(*cleanUsername)
	}

	fbUser, err := s.fb.CreateUser(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("service: firebase create user: %w", err)
	}

	row, err := s.repo.CreateUser(ctx, repository.CreateUserInput{
		Email:    email,
		Username: cleanUsername,
		UID:      fbUser.UID,
		Role:     int(domain.RoleMember),
	})
	if err != nil {
		if deleteErr := s.fb.DeleteUser(ctx, fbUser.UID); deleteErr != nil {
			return nil, fmt.Errorf(
				"service: create user: %w (also failed to rollback firebase uid=%s: %v)",
				err,
				fbUser.UID,
				deleteErr,
			)
		}
		return nil, fmt.Errorf("service: create user: %w", err)
	}

	return domainUserFromRepo(row), nil
}

// CreateInvitedUser inserts an invited user using email/role without creating Firebase credentials.
// Duplicate-email inserts are intentionally ignored.
func (s *UserService) CreateInvitedUser(ctx context.Context, email string, role int) error {
	email = strings.TrimSpace(email)
	if email == "" {
		return fmt.Errorf("%w: email is required", ErrValidation)
	}
	r := domain.Role(role)
	if !r.Valid() {
		return fmt.Errorf("%w: invalid role", ErrValidation)
	}

	existing, err := s.repo.UserByEmail(ctx, email)
	if err != nil && !errors.Is(err, repository.ErrUserNotFound) {
		return fmt.Errorf("service: find invited user: %w", err)
	}
	if err == nil && strings.TrimSpace(existing.UID) != "" {
		return fmt.Errorf("%w: user is already registered", ErrAlreadyRegistered)
	}
	if errors.Is(err, repository.ErrUserNotFound) {
		if err := s.repo.CreateUserIfAbsent(ctx, email, role); err != nil {
			return fmt.Errorf("service: create invited user: %w", err)
		}
	}
	return nil
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
