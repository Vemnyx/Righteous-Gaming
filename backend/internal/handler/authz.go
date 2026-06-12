package handler

import (
	"net/http"

	"righteous-gaming/backend/internal/domain"
)

func requireWriteAccess(w http.ResponseWriter, u *domain.User) bool {
	if u != nil && u.CanWriteContent() {
		return true
	}
	http.Error(w, "Forbidden", http.StatusForbidden)
	return false
}

func requireCardRaterResourceAccess(w http.ResponseWriter, u *domain.User) bool {
	if u != nil && u.Role != nil && u.Role.CanAccessCardRaterResource() {
		return true
	}
	http.Error(w, "Forbidden", http.StatusForbidden)
	return false
}
