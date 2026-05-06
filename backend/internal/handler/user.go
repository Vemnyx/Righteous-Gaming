package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/emailtemplates"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const adminInviteRegisterURL = "https://righteousgaming.team/register"

type userHTTP struct {
	svc *service.UserService
	app *app.App
}

type completeRegistrationRequest struct {
	Email    string  `json:"email"`
	Code     string  `json:"code"`
	Username *string `json:"username"`
	Password string  `json:"password"`
}

type messageErrorResponse struct {
	Message string `json:"message"`
}

type adminRegisterUserRequest struct {
	Email string `json:"email"`
	Role  int    `json:"role"`
}

type fieldErrorResponse struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type registrationLookupResponse struct {
	Email    string    `json:"email"`
	Code     string    `json:"code"`
	ExpireAt time.Time `json:"expire_at"`
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

func (h *userHTTP) completeRegistration(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	const maxBody = 1 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxBody)

	var body completeRegistrationRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return
	}

	if _, err := h.svc.CompleteRegistration(r.Context(), body.Email, body.Code, body.Username, body.Password); err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		if errors.Is(err, service.ErrRegistrationNotFound) {
			writeMessageError(w, http.StatusNotFound, "Registration could not be found. Please use the link from your invitation email.")
			return
		}
		if errors.Is(err, service.ErrRegistrationExpired) {
			writeMessageError(w, http.StatusGone, "This registration link has expired. Please contact your admin to send a new invitation.")
			return
		}
		if errors.Is(err, service.ErrEmailAlreadyRegistered) {
			writeFieldError(w, http.StatusConflict, "email", "Email is already registered.")
			return
		}
		if errors.Is(err, service.ErrUsernameNotAvailable) {
			writeFieldError(w, http.StatusConflict, "username", "Username is not available.")
			return
		}
		log.Error("failed to complete registration", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
}

func (h *userHTTP) registrationByCode(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	code := strings.TrimSpace(r.URL.Query().Get("code"))
	row, err := h.svc.RegistrationByCode(r.Context(), code)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return
		}
		log.Error("failed to lookup registration by code", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_ = json.NewEncoder(w).Encode(registrationLookupResponse{
		Email:    row.Email,
		Code:     row.Code,
		ExpireAt: row.ExpireAt,
	})
}

func (h *userHTTP) adminRegisterUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if h.app == nil {
		http.Error(w, "email service unavailable", http.StatusServiceUnavailable)
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
	user, err := h.svc.CreateInvitedUser(r.Context(), email, body.Role)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if errors.Is(err, service.ErrAlreadyRegistered) {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		log.Error("failed to create invited user", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	code := newRegistrationCode()
	if _, err := h.app.Repo.UpsertUserRegistration(r.Context(), repository.CreateUserRegistrationInput{
		UserID:   user.ID,
		Email:    email,
		Code:     code,
		ExpireAt: time.Now().Add(2 * time.Hour),
	}); err != nil {
		log.Error("failed to upsert user registration", "error", err, "email", email, "user_id", user.ID)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	registerURL, err := registerURLWithCode(adminInviteRegisterURL, code)
	if err != nil {
		log.Error("failed to build register url", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	subject := "You're invited to Righteous Gaming"
	content, err := emailtemplates.RenderAdminRegisterInvite(registerURL)
	if err != nil {
		log.Error("failed to render registration invite email", "error", err)
		http.Error(w, "failed to render invite email", http.StatusInternalServerError)
		return
	}

	if err := h.app.SendGmailHTML(r.Context(), email, subject, content); err != nil {
		log.Error("failed to send registration invite email", "error", err, "email", email)
		http.Error(w, "failed to send invite email", http.StatusBadGateway)
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

func newRegistrationCode() string {
	return uuid.NewString()
}

func registerURLWithCode(baseURL, code string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(baseURL))
	if err != nil {
		return "", fmt.Errorf("parse base url: %w", err)
	}
	q := u.Query()
	q.Set("code", code)
	u.RawQuery = q.Encode()
	return u.String(), nil
}
