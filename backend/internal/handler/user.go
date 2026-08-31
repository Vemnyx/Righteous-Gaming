package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

type userHTTP struct {
	svc *service.UserService
	app *app.App
}

type messageErrorResponse struct {
	Message string `json:"message"`
}

type adminRegisterUserRequest struct {
	Email string `json:"email"`
	Role  *int   `json:"role,omitempty"` // Omit or null → member (1).
}

type changePasswordRequest struct {
	Password string `json:"password"`
}

type fieldErrorResponse struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type adminListedUserJSON struct {
	ID                     int        `json:"id"`
	Email                  string     `json:"email"`
	Username               *string    `json:"username,omitempty"`
	FirstName              *string    `json:"first_name,omitempty"`
	LastName               *string    `json:"last_name,omitempty"`
	UID                    string     `json:"uid"`
	Role                   int        `json:"role"`
	CreatedAt              time.Time  `json:"created_at"`
	RegisteredAt           *time.Time `json:"registered_at,omitempty"`
	DefaultPasswordChanged bool       `json:"default_password_changed"`
}

type adminUsersListResponse struct {
	Users []adminListedUserJSON `json:"users"`
	Total int                   `json:"total"`
	Page  int                   `json:"page"`
	Limit int                   `json:"limit"`
}

func (h *userHTTP) adminListUsers(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	q := r.URL.Query()
	limit := clampIntQuery(q.Get("limit"), 15, 1, 100)
	page := clampIntQuery(q.Get("page"), 1, 1, 1_000_000)
	offset := (page - 1) * limit

	rows, total, err := h.svc.ListUsersPagedForAdmin(r.Context(), idToken, limit, offset)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to list users for admin", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	out := make([]adminListedUserJSON, 0, len(rows))
	for _, row := range rows {
		out = append(out, adminListedUserJSON{
			ID:                     row.ID,
			Email:                  row.Email,
			Username:               row.Username,
			FirstName:              row.FirstName,
			LastName:               row.LastName,
			UID:                    row.UID,
			Role:                   row.Role,
			CreatedAt:              row.CreatedAt,
			RegisteredAt:           row.RegisteredAt,
			DefaultPasswordChanged: row.DefaultPasswordChanged,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(adminUsersListResponse{
		Users: out,
		Total: total,
		Page:  page,
		Limit: limit,
	})
}

func (h *userHTTP) adminUpdateUserProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userID, err := strconv.Atoi(strings.TrimSpace(r.PathValue("id")))
	if err != nil || userID <= 0 {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body patchUserProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Username == nil && body.FirstName == nil && body.LastName == nil {
		writeMessageError(w, http.StatusBadRequest, "no profile fields to update")
		return
	}
	updated, err := h.svc.UpdateUserProfileForAdmin(r.Context(), idToken, userID, service.UserProfilePatch{
		Username:  body.Username,
		FirstName: body.FirstName,
		LastName:  body.LastName,
	})
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUsernameNotAvailable) {
			writeFieldError(w, http.StatusConflict, "username", "Discord name is not available.")
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to update user profile as admin", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(adminListedUserJSON{
		ID:                     updated.ID,
		Email:                  updated.Email,
		Username:               updated.Username,
		FirstName:              updated.FirstName,
		LastName:               updated.LastName,
		UID:                    updated.UID,
		Role:                   updated.Role,
		CreatedAt:              updated.CreatedAt,
		RegisteredAt:           updated.RegisteredAt,
		DefaultPasswordChanged: updated.DefaultPasswordChanged,
	})
}

func (h *userHTTP) adminResetTemporaryPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	userID, err := strconv.Atoi(strings.TrimSpace(r.PathValue("id")))
	if err != nil || userID <= 0 {
		http.Error(w, "invalid user id", http.StatusBadRequest)
		return
	}
	updated, err := h.svc.ResetTemporaryPasswordForAdmin(r.Context(), idToken, userID)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to reset temporary password as admin", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(adminListedUserJSON{
		ID:                     updated.ID,
		Email:                  updated.Email,
		Username:               updated.Username,
		FirstName:              updated.FirstName,
		LastName:               updated.LastName,
		UID:                    updated.UID,
		Role:                   updated.Role,
		CreatedAt:              updated.CreatedAt,
		RegisteredAt:           updated.RegisteredAt,
		DefaultPasswordChanged: updated.DefaultPasswordChanged,
	})
}

func clampIntQuery(s string, fallback, min, max int) int {
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return fallback
	}
	if n < min {
		return min
	}
	if n > max {
		return max
	}
	return n
}

func (h *userHTTP) createUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const maxBody = 1 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)

	var body domain.User
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	out, err := h.svc.CreateUser(r.Context(), body)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		log.Error("failed to create user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(out)
}

func (h *userHTTP) sessionMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	u, err := h.svc.UserForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to load session user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(u)
}

type patchUserSettingsRequest struct {
	CardRaterQuickSubmit *bool `json:"card_rater_quick_submit"`
}

type userSettingsResponse struct {
	Settings domain.UserSettings `json:"settings"`
}

type patchUserProfileRequest struct {
	Username  *string `json:"username"`
	FirstName *string `json:"first_name"`
	LastName  *string `json:"last_name"`
}

func (h *userHTTP) getMySettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	settings, err := h.svc.UserSettingsForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to load user settings", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(userSettingsResponse{
		Settings: settings.Settings,
	})
}

func (h *userHTTP) saveMySettings(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body patchUserSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.CardRaterQuickSubmit == nil {
		writeMessageError(w, http.StatusBadRequest, "no settings fields to update")
		return
	}
	settings, err := h.svc.UpdateUserSettingsForIDToken(r.Context(), idToken, service.UserMeSettingsPatch{
		CardRaterQuickSubmit: body.CardRaterQuickSubmit,
	})
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to update user settings", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(userSettingsResponse{
		Settings: settings.Settings,
	})
}

func (h *userHTTP) getMyProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	profile, err := h.svc.UserProfileForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to load user profile", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(profile)
}

func (h *userHTTP) saveMyProfile(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPatch && r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body patchUserProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	if body.Username == nil && body.FirstName == nil && body.LastName == nil {
		writeMessageError(w, http.StatusBadRequest, "no profile fields to update")
		return
	}
	profile, err := h.svc.UpdateUserProfileForIDToken(r.Context(), idToken, service.UserProfilePatch{
		Username:  body.Username,
		FirstName: body.FirstName,
		LastName:  body.LastName,
	})
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUsernameNotAvailable) {
			writeFieldError(w, http.StatusConflict, "username", "Discord name is not available.")
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to update user profile", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(profile)
}

func (h *userHTTP) changePassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodPatch {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	var body changePasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeMessageError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	u, err := h.svc.ChangePasswordForIDToken(r.Context(), idToken, body.Password)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to change password", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(u)
}

func (h *userHTTP) adminRegisterUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	const maxBody = 1 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)

	var body adminRegisterUserRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	email := strings.TrimSpace(body.Email)
	role := int(domain.RoleMember)
	if body.Role != nil {
		role = *body.Role
	}

	if _, err := h.svc.CreateProvisionedUserForAdmin(r.Context(), idToken, email, role); err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}
		if errors.Is(err, service.ErrForbidden) {
			http.Error(w, "Forbidden", http.StatusForbidden)
			return
		}
		if errors.Is(err, service.ErrAlreadyRegistered) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		log.Error("failed to create provisioned user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func writeFieldError(w http.ResponseWriter, status int, field, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(fieldErrorResponse{
		Field:   field,
		Message: message,
	})
}

func writeMessageError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(messageErrorResponse{Message: message})
}

func bearerIDToken(authorization string) string {
	fields := strings.Fields(strings.TrimSpace(authorization))
	if len(fields) != 2 || !strings.EqualFold(fields[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(fields[1])
}
