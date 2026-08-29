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
var ErrUserNotFound = errors.New("service: user not found")
var ErrUnauthenticated = errors.New("service: unauthenticated")
var ErrForbidden = errors.New("service: forbidden")

// DefaultUserPassword is assigned when an admin provisions a new account.
const DefaultUserPassword = "password123+"

const minUserPasswordLen = 6

// UserService coordinates user-related use cases.
type UserService struct {
	repo *repository.Repository
	fb   *client.Firebase
}

func NewUserService(repo *repository.Repository, fb *client.Firebase) *UserService {
	return &UserService{repo: repo, fb: fb}
}

// UserForIDToken verifies the Firebase ID token and returns the persisted user for that UID.
func (s *UserService) UserForIDToken(ctx context.Context, idToken string) (*domain.User, error) {
	idToken = strings.TrimSpace(idToken)
	if idToken == "" {
		return nil, fmt.Errorf("%w: id token required", ErrValidation)
	}
	tok, err := s.fb.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrUnauthenticated, err)
	}
	row, err := s.repo.UserByUID(ctx, tok.UID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, fmt.Errorf("%w", ErrUserNotFound)
		}
		return nil, fmt.Errorf("service: user by uid: %w", err)
	}
	u := domainUserFromRepo(row)
	settings, err := s.repo.GetUserSettings(ctx, row.ID)
	if err != nil {
		return nil, fmt.Errorf("service: user settings: %w", err)
	}
	u.Settings = domain.UserSettings{CardRaterQuickSubmit: settings.CardRaterQuickSubmit}
	return u, nil
}

// UserSettingsForIDToken returns app settings for the authenticated user.
func (s *UserService) UserSettingsForIDToken(ctx context.Context, idToken string) (domain.UserMeSettings, error) {
	u, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return domain.UserMeSettings{}, err
	}
	return domain.UserMeSettings{
		Settings: u.Settings,
	}, nil
}

// UserProfileForIDToken returns profile fields for the authenticated user.
func (s *UserService) UserProfileForIDToken(ctx context.Context, idToken string) (domain.UserMeProfile, error) {
	u, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return domain.UserMeProfile{}, err
	}
	return domain.UserMeProfile{
		Email:     u.Email,
		Username:  u.Username,
		FirstName: u.FirstName,
		LastName:  u.LastName,
	}, nil
}

// UserMeSettingsPatch is a partial update for /api/me/settings.
type UserMeSettingsPatch struct {
	CardRaterQuickSubmit *bool
}

// UserProfilePatch is a partial update for /api/me/profile.
type UserProfilePatch struct {
	Username  *string
	FirstName *string
	LastName  *string
}

// UpdateUserSettingsForIDToken verifies the token and upserts settings for the authenticated user.
func (s *UserService) UpdateUserSettingsForIDToken(ctx context.Context, idToken string, patch UserMeSettingsPatch) (domain.UserMeSettings, error) {
	idToken = strings.TrimSpace(idToken)
	if idToken == "" {
		return domain.UserMeSettings{}, fmt.Errorf("%w: id token required", ErrValidation)
	}
	if patch.CardRaterQuickSubmit == nil {
		return domain.UserMeSettings{}, fmt.Errorf("%w: no settings fields to update", ErrValidation)
	}
	tok, err := s.fb.VerifyIDToken(ctx, idToken)
	if err != nil {
		return domain.UserMeSettings{}, fmt.Errorf("%w: %v", ErrUnauthenticated, err)
	}
	row, err := s.repo.UserByUID(ctx, tok.UID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return domain.UserMeSettings{}, fmt.Errorf("%w", ErrUserNotFound)
		}
		return domain.UserMeSettings{}, fmt.Errorf("service: user by uid: %w", err)
	}

	updated, err := s.repo.UpsertUserSettings(ctx, row.ID, *patch.CardRaterQuickSubmit)
	if err != nil {
		return domain.UserMeSettings{}, fmt.Errorf("service: upsert user settings: %w", err)
	}

	return domain.UserMeSettings{
		Settings: domain.UserSettings{CardRaterQuickSubmit: updated.CardRaterQuickSubmit},
	}, nil
}

// UpdateUserProfileForIDToken verifies the token and updates profile fields for the authenticated user.
func (s *UserService) UpdateUserProfileForIDToken(ctx context.Context, idToken string, patch UserProfilePatch) (domain.UserMeProfile, error) {
	idToken = strings.TrimSpace(idToken)
	if idToken == "" {
		return domain.UserMeProfile{}, fmt.Errorf("%w: id token required", ErrValidation)
	}
	if patch.Username == nil && patch.FirstName == nil && patch.LastName == nil {
		return domain.UserMeProfile{}, fmt.Errorf("%w: no profile fields to update", ErrValidation)
	}
	tok, err := s.fb.VerifyIDToken(ctx, idToken)
	if err != nil {
		return domain.UserMeProfile{}, fmt.Errorf("%w: %v", ErrUnauthenticated, err)
	}
	row, err := s.repo.UserByUID(ctx, tok.UID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return domain.UserMeProfile{}, fmt.Errorf("%w", ErrUserNotFound)
		}
		return domain.UserMeProfile{}, fmt.Errorf("service: user by uid: %w", err)
	}
	return s.applyUserProfilePatch(ctx, row, patch)
}

// UpdateUserProfileForAdmin verifies the caller is an admin, then updates another user's profile fields.
func (s *UserService) UpdateUserProfileForAdmin(ctx context.Context, idToken string, userID int, patch UserProfilePatch) (*repository.User, error) {
	idToken = strings.TrimSpace(idToken)
	if idToken == "" {
		return nil, fmt.Errorf("%w: id token required", ErrValidation)
	}
	if userID <= 0 {
		return nil, fmt.Errorf("%w: invalid user id", ErrValidation)
	}
	if patch.Username == nil && patch.FirstName == nil && patch.LastName == nil {
		return nil, fmt.Errorf("%w: no profile fields to update", ErrValidation)
	}
	caller, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if caller.Role == nil || *caller.Role != domain.RoleAdmin {
		return nil, fmt.Errorf("%w", ErrForbidden)
	}
	row, err := s.repo.UserByID(ctx, userID)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, fmt.Errorf("%w", ErrUserNotFound)
		}
		return nil, fmt.Errorf("service: user by id: %w", err)
	}
	if _, err := s.applyUserProfilePatch(ctx, row, patch); err != nil {
		return nil, err
	}
	updated, err := s.repo.UserByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("service: reload user: %w", err)
	}
	return updated, nil
}

func (s *UserService) applyUserProfilePatch(ctx context.Context, row *repository.User, patch UserProfilePatch) (domain.UserMeProfile, error) {
	username := row.Username
	firstName := row.FirstName
	lastName := row.LastName

	if patch.Username != nil {
		trimmed := strings.TrimSpace(*patch.Username)
		if trimmed == "" {
			username = nil
		} else {
			username = &trimmed
		}
	}
	if patch.FirstName != nil {
		trimmed := strings.TrimSpace(*patch.FirstName)
		if trimmed == "" {
			firstName = nil
		} else {
			firstName = &trimmed
		}
	}
	if patch.LastName != nil {
		trimmed := strings.TrimSpace(*patch.LastName)
		if trimmed == "" {
			lastName = nil
		} else {
			lastName = &trimmed
		}
	}

	if username != nil {
		candidates, err := s.repo.UsersByEmailOrUsername(ctx, row.Email, username)
		if err != nil {
			return domain.UserMeProfile{}, fmt.Errorf("service: lookup username conflicts: %w", err)
		}
		for _, candidate := range candidates {
			if candidate.Username != nil && candidate.ID != row.ID &&
				strings.EqualFold(strings.TrimSpace(*candidate.Username), *username) {
				return domain.UserMeProfile{}, fmt.Errorf("%w: username is not available", ErrUsernameNotAvailable)
			}
		}
	}

	updated, err := s.repo.UpdateUserProfile(ctx, row.ID, username, firstName, lastName)
	if err != nil {
		return domain.UserMeProfile{}, fmt.Errorf("service: update user profile: %w", err)
	}

	if strings.TrimSpace(row.UID) != "" {
		displayName := ""
		if firstName != nil {
			displayName = strings.TrimSpace(*firstName)
		}
		if lastName != nil {
			ln := strings.TrimSpace(*lastName)
			if ln != "" {
				if displayName != "" {
					displayName = displayName + " " + ln
				} else {
					displayName = ln
				}
			}
		}
		if displayName == "" && username != nil {
			displayName = strings.TrimSpace(*username)
		}
		if displayName != "" {
			params := (&firebaseauth.UserToUpdate{}).DisplayName(displayName)
			if _, err := s.fb.UpdateUser(ctx, row.UID, params); err != nil {
				return domain.UserMeProfile{}, fmt.Errorf("service: firebase update display name: %w", err)
			}
		}
	}

	return domain.UserMeProfile{
		Email:     updated.Email,
		Username:  updated.Username,
		FirstName: updated.FirstName,
		LastName:  updated.LastName,
	}, nil
}

// ListUsersPagedForAdmin verifies the Firebase token, ensures the caller is an admin,
// then returns paginated rows from Postgres.
func (s *UserService) ListUsersPagedForAdmin(ctx context.Context, idToken string, limit, offset int) ([]repository.User, int, error) {
	caller, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return nil, 0, err
	}
	if caller.Role == nil || *caller.Role != domain.RoleAdmin {
		return nil, 0, fmt.Errorf("%w", ErrForbidden)
	}
	return s.repo.ListUsersPaged(ctx, limit, offset)
}

// CreateProvisionedUserForAdmin verifies the caller is an admin, then creates a Firebase
// Auth user with DefaultUserPassword and a matching Postgres row (forced password change).
func (s *UserService) CreateProvisionedUserForAdmin(ctx context.Context, idToken string, email string, role int) (*domain.User, error) {
	caller, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if caller.Role == nil || *caller.Role != domain.RoleAdmin {
		return nil, fmt.Errorf("%w", ErrForbidden)
	}
	return s.CreateProvisionedUser(ctx, email, role)
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
		Email:                  email,
		Username:               in.Username,
		UID:                    uid,
		Role:                   int(role),
		Registered:             true,
		DefaultPasswordChanged: false,
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

// CreateProvisionedUser creates Firebase credentials with DefaultUserPassword and a DB user row.
func (s *UserService) CreateProvisionedUser(ctx context.Context, email string, role int) (*domain.User, error) {
	email = strings.TrimSpace(email)
	if email == "" {
		return nil, fmt.Errorf("%w: email is required", ErrValidation)
	}
	r := domain.Role(role)
	if !r.Valid() {
		return nil, fmt.Errorf("%w: invalid role", ErrValidation)
	}

	existing, err := s.repo.UserByEmail(ctx, email)
	if err != nil && !errors.Is(err, repository.ErrUserNotFound) {
		return nil, fmt.Errorf("service: find user by email: %w", err)
	}
	if err == nil && strings.TrimSpace(existing.UID) != "" {
		return nil, fmt.Errorf("%w: user is already registered", ErrAlreadyRegistered)
	}

	params := (&firebaseauth.UserToCreate{}).
		Email(email).
		EmailVerified(false).
		Disabled(false).
		Password(DefaultUserPassword)

	fbUser, err := s.fb.CreateUser(ctx, params)
	if err != nil {
		return nil, fmt.Errorf("service: firebase create user: %w", err)
	}

	var row *repository.User
	if existing != nil && strings.TrimSpace(existing.UID) == "" {
		row, err = s.repo.AttachFirebaseUID(ctx, existing.ID, fbUser.UID, role)
		if err != nil {
			_ = s.fb.DeleteUser(ctx, fbUser.UID)
			return nil, fmt.Errorf("service: attach firebase uid: %w", err)
		}
	} else {
		row, err = s.repo.CreateUser(ctx, repository.CreateUserInput{
			Email:                  email,
			UID:                    fbUser.UID,
			Role:                   role,
			Registered:             true,
			DefaultPasswordChanged: false,
		})
		if err != nil {
			_ = s.fb.DeleteUser(ctx, fbUser.UID)
			return nil, fmt.Errorf("service: create provisioned user: %w", err)
		}
	}

	return domainUserFromRepo(row), nil
}

// ChangePasswordForIDToken updates the authenticated user's Firebase password and clears the
// default-password requirement.
func (s *UserService) ChangePasswordForIDToken(ctx context.Context, idToken, newPassword string) (*domain.User, error) {
	idToken = strings.TrimSpace(idToken)
	newPassword = strings.TrimSpace(newPassword)
	if idToken == "" {
		return nil, fmt.Errorf("%w: id token required", ErrValidation)
	}
	if newPassword == "" {
		return nil, fmt.Errorf("%w: password is required", ErrValidation)
	}
	if len(newPassword) < minUserPasswordLen {
		return nil, fmt.Errorf("%w: password must be at least %d characters", ErrValidation, minUserPasswordLen)
	}
	if newPassword == DefaultUserPassword {
		return nil, fmt.Errorf("%w: choose a password different from the temporary default", ErrValidation)
	}

	u, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(u.UID) == "" {
		return nil, fmt.Errorf("%w", ErrUserNotFound)
	}

	params := (&firebaseauth.UserToUpdate{}).Password(newPassword)
	if _, err := s.fb.UpdateUser(ctx, u.UID, params); err != nil {
		return nil, fmt.Errorf("service: firebase update password: %w", err)
	}
	if err := s.repo.MarkDefaultPasswordChanged(ctx, u.ID); err != nil {
		return nil, fmt.Errorf("service: mark default password changed: %w", err)
	}
	u.DefaultPasswordChanged = true
	return u, nil
}

func firebaseParamsFromRow(email, uid string, username *string) *firebaseauth.UserToCreate {
	p := (&firebaseauth.UserToCreate{}).
		UID(uid).
		Email(email).
		EmailVerified(false).
		Disabled(false).
		Password(DefaultUserPassword)
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
		ID:                     u.ID,
		Email:                  u.Email,
		Username:               u.Username,
		FirstName:              u.FirstName,
		LastName:               u.LastName,
		UID:                    u.UID,
		Role:                   &r,
		CreatedAt:              &u.CreatedAt,
		DefaultPasswordChanged: u.DefaultPasswordChanged,
	}
}
