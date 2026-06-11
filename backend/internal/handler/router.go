package handler

import (
	"net/http"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/scrape"
	"righteous-gaming/backend/internal/service"
)

// NewRouter registers HTTP API routes and returns the root handler.
func NewRouter(application *app.App, userSvc *service.UserService, scrapeClient *scrape.Client) http.Handler {
	mux := http.NewServeMux()
	uh := &userHTTP{svc: userSvc, app: application}
	mh := &mailHTTP{app: application}
	ch := &catalogHTTP{app: application, svc: userSvc}
	rh := &cardRatingsHTTP{app: application, svc: userSvc}
	upload := &uploadHTTP{app: application, svc: userSvc}
	ah := &announcementHTTP{app: application, svc: userSvc}
	dh := &decksHTTP{app: application, svc: userSvc}
	rdh := &runawaysDraftHTTP{app: application, svc: userSvc}
	rec := &recordingsHTTP{app: application, svc: userSvc}
	eh := &eventsHTTP{app: application, svc: userSvc, scrape: scrapeClient}

	mux.HandleFunc("POST /api/users", uh.createUser)
	mux.HandleFunc("POST /api/complete-registration", uh.completeRegistration)
	mux.HandleFunc("GET /api/session/me", uh.sessionMe)
	mux.HandleFunc("GET /api/me/settings", uh.getMySettings)
	mux.HandleFunc("POST /api/me/settings", uh.saveMySettings)
	mux.HandleFunc("PATCH /api/me/settings", uh.saveMySettings)
	mux.HandleFunc("GET /api/me/profile", uh.getMyProfile)
	mux.HandleFunc("POST /api/me/profile", uh.saveMyProfile)
	mux.HandleFunc("PATCH /api/me/profile", uh.saveMyProfile)
	mux.HandleFunc("GET /api/deck-sources", dh.listDeckSources)
	mux.HandleFunc("POST /api/deck-sources", dh.createDeckSource)
	mux.HandleFunc("GET /api/me/decks", dh.listMyDecks)
	mux.HandleFunc("GET /api/me/decks/filter-users", dh.listDeckFilterUsers)
	mux.HandleFunc("GET /api/me/decks/{id}", dh.getMyDeck)
	mux.HandleFunc("DELETE /api/me/decks/{id}", dh.deleteMyDeck)
	mux.HandleFunc("POST /api/me/decks/import-fabrary", dh.importFabraryDeck)
	mux.HandleFunc("GET /api/me/card-ratings/export-sets", rh.listMyCardRatingsExportSets)
	mux.HandleFunc("GET /api/me/card-ratings/export", rh.exportMyCardRatings)
	mux.HandleFunc("GET /api/me/card-ratings", rh.listMyRatings)
	mux.HandleFunc("POST /api/me/card-ratings", rh.saveMyRating)
	mux.HandleFunc("GET /api/me/cards-to-rate", rh.listMyCardsToRate)
	mux.HandleFunc("GET /api/me/card-team-ratings", rh.listCardTeamRatings)
	mux.HandleFunc("GET /api/me/card-team-ratings-batch", rh.listCardTeamRatingsBatch)
	mux.HandleFunc("GET /api/card-raters", rh.listCardRaters)
	mux.HandleFunc("GET /api/card-raters/{id}/cards/{cardId}/session-ratings", rh.getCardRaterCardSessionRatings)
	mux.HandleFunc("GET /api/card-raters/{id}/cards/{cardId}/rating-notes", rh.getCardRaterCardRatingNotes)
	mux.HandleFunc("GET /api/card-raters/{id}/analytics", rh.getCardRaterAnalytics)
	mux.HandleFunc("GET /api/card-raters/{id}/compare", rh.getCardRaterCompare)
	mux.HandleFunc("GET /api/data/runaways-drafts/meta", rdh.getRunawaysDraftMeta)
	mux.HandleFunc("GET /api/data/runaways-drafts/decks", rdh.listRunawaysDraftDecks)
	mux.HandleFunc("GET /api/data/runaways-drafts/decks/{id}", rdh.getRunawaysDraftDeck)
	mux.HandleFunc("GET /api/data/runaways-drafts/analytics", rdh.getRunawaysDraftAnalytics)
	mux.HandleFunc("GET /api/data/runaways-drafts/archetypes", rdh.getRunawaysDraftArchetypes)
	mux.HandleFunc("GET /api/data/runaways-drafts/card-pick-timeline", rdh.getRunawaysDraftCardPickTimeline)
	mux.HandleFunc("POST /api/card-raters", rh.createCardRater)
	mux.HandleFunc("PATCH /api/card-raters/active/complete", rh.completeActiveCardRater)
	mux.HandleFunc("PATCH /api/card-raters/{id}/reopen", rh.reopenCardRater)
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
	mux.HandleFunc("POST /api/admin/catalog/sync-fabrary-latest-set", ch.postAdminSyncFabraryLatestSet)
	mux.HandleFunc("POST /api/upload", upload.uploadAsset)

	mux.HandleFunc("GET /api/recordings/meta", rec.getRecordingsMeta)
	mux.HandleFunc("GET /api/recordings", rec.listRecordings)
	mux.HandleFunc("POST /api/recordings", rec.createRecording)
	mux.HandleFunc("GET /api/recordings/{id}", rec.getRecording)
	mux.HandleFunc("DELETE /api/recordings/{id}", rec.deleteRecording)
	mux.HandleFunc("POST /api/recordings/{id}/comments", rec.createRecordingComment)

	mux.HandleFunc("GET /api/announcements", ah.listPublished)
	mux.HandleFunc("GET /api/admin/announcements", ah.adminList)
	mux.HandleFunc("POST /api/admin/announcements", ah.adminCreate)
	mux.HandleFunc("GET /api/admin/announcements/{id}", ah.adminGet)
	mux.HandleFunc("PATCH /api/admin/announcements/{id}", ah.adminUpdate)
	mux.HandleFunc("DELETE /api/admin/announcements/{id}", ah.adminDelete)

	mux.HandleFunc("GET /api/events", eh.listEvents)
	mux.HandleFunc("GET /api/events/{id}", eh.getEvent)
	mux.HandleFunc("GET /api/events/{id}/rounds", eh.getEventRounds)
	mux.HandleFunc("GET /api/events/{id}/pairings", eh.getEventPairings)
	mux.HandleFunc("GET /api/events/{id}/results", eh.getEventResults)
	mux.HandleFunc("GET /api/events/{id}/standings", eh.getEventStandings)
	mux.HandleFunc("GET /api/events/{id}/team-summary", eh.getEventTeamSummary)
	mux.HandleFunc("GET /api/events/data/{dataId}/comments", eh.listEventDataComments)
	mux.HandleFunc("POST /api/events/data/{dataId}/comments", eh.createEventDataComment)
	mux.HandleFunc("PATCH /api/events/data/{dataId}/stream-urls", eh.updateEventDataStreamURLs)
	mux.HandleFunc("POST /api/events/data/{dataId}/stream-urls", eh.updateEventDataStreamURLs)
	mux.HandleFunc("GET /api/admin/events", eh.adminListEvents)
	mux.HandleFunc("POST /api/admin/events", eh.adminCreateEvent)

	return mux
}
