package handler

import (
	"net/http"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

type runawaysDraftCardPickTimelineBucketJSON struct {
	Label         string  `json:"label"`
	Key           string  `json:"key"`
	DeckCount     int     `json:"deck_count"`
	DecksWithCard int     `json:"decks_with_card"`
	PickRate      float64 `json:"pick_rate"`
}

type runawaysDraftCardPickTimelineJSON struct {
	Available         bool                                  `json:"available"`
	Card              runawaysDraftCardLiteJSON               `json:"card"`
	Buckets           []runawaysDraftCardPickTimelineBucketJSON `json:"buckets"`
	UnavailableReason *string                               `json:"unavailable_reason,omitempty"`
}

func (h *runawaysDraftHTTP) getRunawaysDraftCardPickTimeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sourceID, setID, heroID, cardID, ok := parseRunawaysDraftCardQuery(w, r)
	if !ok {
		return
	}

	stats, err := h.app.Repo.RunawaysDraftCardPickTimeline(r.Context(), sourceID, setID, heroID, cardID)
	if err != nil {
		log.Error("runaways draft card pick timeline", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusOK, runawaysDraftCardPickTimelineToJSON(stats))
}

func parseRunawaysDraftCardQuery(w http.ResponseWriter, r *http.Request) (sourceID, setID, heroID, cardID int, ok bool) {
	sourceID, setID, heroID, ok = parseRunawaysDraftSetHeroQuery(w, r)
	if !ok {
		return 0, 0, 0, 0, false
	}
	cardID, err := strconv.Atoi(strings.TrimSpace(r.URL.Query().Get("card_id")))
	if err != nil || cardID <= 0 {
		writeFieldError(w, http.StatusBadRequest, "card_id", "required")
		return 0, 0, 0, 0, false
	}
	return sourceID, setID, heroID, cardID, true
}

func runawaysDraftCardPickTimelineToJSON(t *repository.RunawaysDraftCardPickTimeline) runawaysDraftCardPickTimelineJSON {
	if t == nil {
		return runawaysDraftCardPickTimelineJSON{
			Card:    runawaysDraftCardLiteJSON{},
			Buckets: []runawaysDraftCardPickTimelineBucketJSON{},
		}
	}
	out := runawaysDraftCardPickTimelineJSON{
		Available: t.Available,
		Card:      runawaysDraftCardLiteToJSON(t.Card),
		Buckets:   make([]runawaysDraftCardPickTimelineBucketJSON, 0, len(t.Buckets)),
	}
	if t.UnavailableReason != "" {
		out.UnavailableReason = &t.UnavailableReason
	}
	for _, b := range t.Buckets {
		out.Buckets = append(out.Buckets, runawaysDraftCardPickTimelineBucketJSON{
			Label:         b.Label,
			Key:           b.Key,
			DeckCount:     b.DeckCount,
			DecksWithCard: b.DecksWithCard,
			PickRate:      b.PickRate,
		})
	}
	return out
}
