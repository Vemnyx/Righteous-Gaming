package handler

import (
	"encoding/json"
	"errors"
	"net/http"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/service"
)

type userHTTP struct {
	svc *service.UserService
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
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(out)
}
