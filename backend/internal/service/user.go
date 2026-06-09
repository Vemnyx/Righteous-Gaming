package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

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
var ErrRegistrationNotFound = errors.New("service: registration not found")
var ErrRegistrationExpired = errors.New("service: registration expired")
var ErrUnauthenticated = errors.New("service: unauthenticated")
var ErrForbidden = errors.New("service: forbidden")

// UserService coordinates user-related use cases.
type UserService struct {
	repo *repository.Repository
	fb   *client.Firebase
}

type RegistrationLookup struct {
	UserID   int
	Email    string
	Code     string
	ExpireAt time.Time
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

	if username != nil && strings.TrimSpace(row.UID) != "" {
		params := (&firebaseauth.UserToUpdate{}).DisplayName(*username)
		if _, err := s.fb.UpdateUser(ctx, row.UID, params); err != nil {
			return domain.UserMeProfile{}, fmt.Errorf("service: firebase update display name: %w", err)
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

// CreateInvitedUserForAdmin verifies the caller is an admin, then creates or reuses an invited user row.
func (s *UserService) CreateInvitedUserForAdmin(ctx context.Context, idToken string, email string, role int) (*domain.User, error) {
	caller, err := s.UserForIDToken(ctx, idToken)
	if err != nil {
		return nil, err
	}
	if caller.Role == nil || *caller.Role != domain.RoleAdmin {
		return nil, fmt.Errorf("%w", ErrForbidden)
	}
	return s.CreateInvitedUser(ctx, email, role)
}

func (s *UserService) RegistrationByCode(ctx context.Context, code string) (*RegistrationLookup, error) {
	code = strings.TrimSpace(code)
	if code == "" {
		return nil, fmt.Errorf("%w: code is required", ErrValidation)
	}
	row, err := s.repo.UserRegistrationByCode(ctx, code)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, fmt.Errorf("%w: registration not found", ErrUserNotFound)
		}
		return nil, fmt.Errorf("service: registration by code: %w", err)
	}
	return &RegistrationLookup{
		UserID:   row.UserID,
		Email:    row.Email,
		Code:     row.Code,
		ExpireAt: row.ExpireAt,
	}, nil
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

// CompleteRegistration completes an invited registration by creating Firebase credentials,
// then updating the existing invited DB row with uid/username/names/registered_at and removing the invite row.
func (s *UserService) CompleteRegistration(ctx context.Context, email, registrationCode string, username, firstName, lastName *string, password string) (*domain.User, error) {
	email = strings.TrimSpace(email)
	registrationCode = strings.TrimSpace(registrationCode)
	password = strings.TrimSpace(password)
	if email == "" {
		return nil, fmt.Errorf("%w: email is required", ErrValidation)
	}
	if registrationCode == "" {
		return nil, fmt.Errorf("%w: registration code is required", ErrValidation)
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

	cleanFirstName := strings.TrimSpace(ptrStr(firstName))
	cleanLastName := strings.TrimSpace(ptrStr(lastName))
	if cleanFirstName == "" {
		return nil, fmt.Errorf("%w: first name is required", ErrValidation)
	}
	if cleanLastName == "" {
		return nil, fmt.Errorf("%w: last name is required", ErrValidation)
	}
	firstNamePtr := &cleanFirstName
	lastNamePtr := &cleanLastName

	invitedUser, err := s.repo.UserByEmailWithoutUID(ctx, email)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, fmt.Errorf("%w: User not found", ErrUserNotFound)
		}
		return nil, fmt.Errorf("service: find invited user: %w", err)
	}

	regRow, err := s.repo.UserRegistrationByCode(ctx, registrationCode)
	if err != nil {
		if errors.Is(err, repository.ErrUserNotFound) {
			return nil, fmt.Errorf("%w", ErrRegistrationNotFound)
		}
		return nil, fmt.Errorf("service: lookup registration: %w", err)
	}
	if time.Now().After(regRow.ExpireAt) {
		return nil, fmt.Errorf("%w", ErrRegistrationExpired)
	}
	if regRow.UserID != invitedUser.ID || !strings.EqualFold(strings.TrimSpace(regRow.Email), email) {
		return nil, fmt.Errorf("%w", ErrRegistrationNotFound)
	}

	candidates, err := s.repo.UsersByEmailOrUsername(ctx, email, cleanUsername)
	if err != nil {
		return nil, fmt.Errorf("service: lookup registration conflicts: %w", err)
	}
	for _, candidate := range candidates {
		if cleanUsername != nil && candidate.Username != nil {
			if candidate.ID != invitedUser.ID && strings.EqualFold(strings.TrimSpace(*candidate.Username), *cleanUsername) {
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

	row, err := s.repo.CompleteRegistrationByIDAndDeleteInvite(ctx, invitedUser.ID, fbUser.UID, cleanUsername, firstNamePtr, lastNamePtr, registrationCode)
	if err != nil {
		if deleteErr := s.fb.DeleteUser(ctx, fbUser.UID); deleteErr != nil {
			return nil, fmt.Errorf(
				"service: complete registration: %w (also failed to rollback firebase uid=%s: %v)",
				err,
				fbUser.UID,
				deleteErr,
			)
		}
		return nil, fmt.Errorf("service: complete registration: %w", err)
	}

	return domainUserFromRepo(row), nil
}

// CreateInvitedUser inserts (or reuses) an invited user using email/role without creating Firebase credentials.
func (s *UserService) CreateInvitedUser(ctx context.Context, email string, role int) (*domain.User, error) {
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
		return nil, fmt.Errorf("service: find invited user: %w", err)
	}
	if err == nil && strings.TrimSpace(existing.UID) != "" {
		return nil, fmt.Errorf("%w: user is already registered", ErrAlreadyRegistered)
	}
	if errors.Is(err, repository.ErrUserNotFound) {
		if err := s.repo.CreateUserIfAbsent(ctx, email, role); err != nil {
			return nil, fmt.Errorf("service: create invited user: %w", err)
		}
		existing, err = s.repo.UserByEmail(ctx, email)
		if err != nil {
			return nil, fmt.Errorf("service: fetch invited user after create: %w", err)
		}
	}
	return domainUserFromRepo(existing), nil
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
		FirstName: u.FirstName,
		LastName:  u.LastName,
		UID:       u.UID,
		Role:      &r,
		CreatedAt: &u.CreatedAt,
	}
}

func ptrStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
