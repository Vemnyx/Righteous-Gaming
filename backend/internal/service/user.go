package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
)

var ErrValidation = errors.New("service: validation failed")

// UserService coordinates user-related use cases.
type UserService struct {
	repo *repository.Repository
}

func NewUserService(repo *repository.Repository) *UserService {
	return &UserService{repo: repo}
}

// CreateUser validates input, defaults role to member, inserts via the repository, and returns the domain user.
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
	return domainUserFromRepo(row), nil
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
