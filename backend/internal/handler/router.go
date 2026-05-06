package handler

import (
	"net/http"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/service"
)

// NewRouter registers HTTP API routes and returns the root handler.
func NewRouter(application *app.App, userSvc *service.UserService) http.Handler {
	mux := http.NewServeMux()
	uh := &userHTTP{svc: userSvc, app: application}
	mh := &mailHTTP{app: application}

	mux.HandleFunc("POST /api/users", uh.createUser)
	mux.HandleFunc("POST /api/complete-registration", uh.completeRegistration)
	mux.HandleFunc("GET /api/session/me", uh.sessionMe)
	mux.HandleFunc("GET /api/registration", uh.registrationByCode)
	mux.HandleFunc("POST /api/admin/user/register", uh.adminRegisterUser)
	mux.HandleFunc("POST /api/send-email", mh.sendEmail)

	return mux
}
