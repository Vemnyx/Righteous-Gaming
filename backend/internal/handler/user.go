package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/emailtemplates"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const adminInviteRegisterURL = "https://righteousgaming.team/register?code=123"

type userHTTP struct {
	svc *service.UserService
	app *app.App
}

type completeRegistrationRequest struct {
	Email    string  `json:"email"`
	Username *string `json:"username"`
	Password string  `json:"password"`
}

type adminRegisterUserRequest struct {
	Email string `json:"email"`
	Role  int    `json:"role"`
}

type fieldErrorResponse struct {
	Field   string `json:"field"`
	Message string `json:"message"`
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

	if _, err := h.svc.CompleteRegistration(r.Context(), body.Email, body.Username, body.Password); err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
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
	if err := h.svc.CreateInvitedUser(r.Context(), email, body.Role); err != nil {
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

	subject := "You're invited to Righteous Gaming"
	content, err := emailtemplates.RenderAdminRegisterInvite(adminInviteRegisterURL)
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
