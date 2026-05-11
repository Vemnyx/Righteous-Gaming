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
	ch := &catalogHTTP{app: application}
	rh := &cardRatingsHTTP{app: application, svc: userSvc}
	upload := &uploadHTTP{app: application, svc: userSvc}
	ah := &announcementHTTP{app: application, svc: userSvc}

	mux.HandleFunc("POST /api/users", uh.createUser)
	mux.HandleFunc("POST /api/complete-registration", uh.completeRegistration)
	mux.HandleFunc("GET /api/session/me", uh.sessionMe)
	mux.HandleFunc("GET /api/me/card-ratings", rh.listMyRatings)
	mux.HandleFunc("POST /api/me/card-ratings", rh.saveMyRating)
	mux.HandleFunc("GET /api/me/cards-to-rate", rh.listMyCardsToRate)
	mux.HandleFunc("GET /api/me/card-team-ratings", rh.listCardTeamRatings)
	mux.HandleFunc("GET /api/me/card-team-ratings-batch", rh.listCardTeamRatingsBatch)
	mux.HandleFunc("GET /api/card-raters", rh.listCardRaters)
	mux.HandleFunc("POST /api/card-raters", rh.createCardRater)
	mux.HandleFunc("PATCH /api/card-raters/active/complete", rh.completeActiveCardRater)
	mux.HandleFunc("DELETE /api/card-raters/{id}", rh.deleteCardRater)
	mux.HandleFunc("GET /api/registration", uh.registrationByCode)
	mux.HandleFunc("POST /api/admin/user/register", uh.adminRegisterUser)
	mux.HandleFunc("GET /api/admin/users", uh.adminListUsers)
	mux.HandleFunc("POST /api/send-email", mh.sendEmail)

	mux.HandleFunc("GET /api/sets", ch.listSets)
	mux.HandleFunc("GET /api/sets/{id}", ch.getSet)
	mux.HandleFunc("POST /api/sets", ch.createSet)
	mux.HandleFunc("GET /api/sets/{id}/cards", ch.listCardsBySet)
	mux.HandleFunc("GET /api/cards", ch.listCards)
	mux.HandleFunc("GET /api/cards/{id}", ch.getCard)
	mux.HandleFunc("POST /api/cards", ch.createCard)
	mux.HandleFunc("POST /api/cards/batch", ch.createCardsBatch)
	mux.HandleFunc("POST /api/upload", upload.uploadAsset)

	mux.HandleFunc("GET /api/announcements", ah.listPublished)
	mux.HandleFunc("GET /api/admin/announcements", ah.adminList)
	mux.HandleFunc("POST /api/admin/announcements", ah.adminCreate)
	mux.HandleFunc("GET /api/admin/announcements/{id}", ah.adminGet)
	mux.HandleFunc("PATCH /api/admin/announcements/{id}", ah.adminUpdate)
	mux.HandleFunc("DELETE /api/admin/announcements/{id}", ah.adminDelete)

	return mux
}
