package handler

import (
	"net/http"

	"righteous-gaming/backend/internal/service"
)

// NewRouter registers HTTP API routes and returns the root handler.
func NewRouter(userSvc *service.UserService) http.Handler {
	mux := http.NewServeMux()
	uh := &userHTTP{svc: userSvc}

	mux.HandleFunc("POST /api/users", uh.createUser)

	return mux
}
