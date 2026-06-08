package handler

import (
	"net/http"

	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

type runawaysDraftCardLiteJSON struct {
	CardID         int     `json:"card_id"`
	Name           string  `json:"name"`
	CardIdentifier *string `json:"card_identifier,omitempty"`
	ImageURL       *string `json:"image_url,omitempty"`
}

type runawaysDraftTypicalFingerprintJSON struct {
	RedPct             float64 `json:"red_pct"`
	YellowPct          float64 `json:"yellow_pct"`
	BluePct            float64 `json:"blue_pct"`
	AvgCost            float64 `json:"avg_cost"`
	AvgBlock3          float64 `json:"avg_block3"`
	ReactionPct        float64 `json:"reaction_pct"`
	EquipmentWeaponPct float64 `json:"equipment_weapon_pct"`
}

type runawaysDraftStyleTagJSON struct {
	Key            string                      `json:"key"`
	Label          string                      `json:"label"`
	Description    string                      `json:"description"`
	DeckCount      int                         `json:"deck_count"`
	Share          float64                     `json:"share"`
	AvgRedPct      float64                     `json:"avg_red_pct"`
	AvgBluePct     float64                     `json:"avg_blue_pct"`
	AvgCost        float64                     `json:"avg_cost"`
	SignatureCards []runawaysDraftCardLiteJSON `json:"signature_cards"`
}

type runawaysDraftCardPackageJSON struct {
	Cards     []runawaysDraftCardLiteJSON `json:"cards"`
	DeckCount int                         `json:"deck_count"`
	Share     float64                     `json:"share"`
	Lift      float64                     `json:"lift"`
}

type runawaysDraftArchetypesJSON struct {
	Available           bool                                `json:"available"`
	DeckCount           int                                 `json:"deck_count"`
	MinDecksForAnalysis int                                 `json:"min_decks_for_analysis"`
	UnavailableReason   *string                             `json:"unavailable_reason,omitempty"`
	Typical             runawaysDraftTypicalFingerprintJSON `json:"typical"`
	Tags                []runawaysDraftStyleTagJSON         `json:"tags"`
	Packages            []runawaysDraftCardPackageJSON      `json:"packages"`
}

func (h *runawaysDraftHTTP) getRunawaysDraftArchetypes(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.sessionUser(w, r); !ok {
		return
	}

	sourceID, setID, heroID, ok := parseRunawaysDraftSetHeroQuery(w, r)
	if !ok {
		return
	}

	stats, err := h.app.Repo.RunawaysDraftArchetypes(r.Context(), sourceID, setID, heroID)
	if err != nil {
		log.Error("runaways draft archetypes", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	writeCatalogJSON(w, http.StatusOK, runawaysDraftArchetypesToJSON(stats))
}

func runawaysDraftArchetypesToJSON(a *repository.RunawaysDraftArchetypes) runawaysDraftArchetypesJSON {
	if a == nil {
		return runawaysDraftArchetypesJSON{
			Tags:     []runawaysDraftStyleTagJSON{},
			Packages: []runawaysDraftCardPackageJSON{},
		}
	}

	out := runawaysDraftArchetypesJSON{
		Available:           a.Available,
		DeckCount:           a.DeckCount,
		MinDecksForAnalysis: a.MinDecksForAnalysis,
		Typical: runawaysDraftTypicalFingerprintJSON{
			RedPct:             a.Typical.RedPct,
			YellowPct:          a.Typical.YellowPct,
			BluePct:            a.Typical.BluePct,
			AvgCost:            a.Typical.AvgCost,
			AvgBlock3:          a.Typical.AvgBlock3,
			ReactionPct:        a.Typical.ReactionPct,
			EquipmentWeaponPct: a.Typical.EquipmentWeaponPct,
		},
		Tags:     make([]runawaysDraftStyleTagJSON, 0, len(a.Tags)),
		Packages: make([]runawaysDraftCardPackageJSON, 0, len(a.Packages)),
	}
	if a.UnavailableReason != "" {
		out.UnavailableReason = &a.UnavailableReason
	}
	for _, t := range a.Tags {
		tag := runawaysDraftStyleTagJSON{
			Key:            t.Key,
			Label:          t.Label,
			Description:    t.Description,
			DeckCount:      t.DeckCount,
			Share:          t.Share,
			AvgRedPct:      t.AvgRedPct,
			AvgBluePct:     t.AvgBluePct,
			AvgCost:        t.AvgCost,
			SignatureCards: make([]runawaysDraftCardLiteJSON, 0, len(t.SignatureCards)),
		}
		for _, c := range t.SignatureCards {
			tag.SignatureCards = append(tag.SignatureCards, runawaysDraftCardLiteToJSON(c))
		}
		out.Tags = append(out.Tags, tag)
	}
	for _, p := range a.Packages {
		pkg := runawaysDraftCardPackageJSON{
			DeckCount: p.DeckCount,
			Share:     p.Share,
			Lift:      p.Lift,
			Cards:     make([]runawaysDraftCardLiteJSON, 0, len(p.Cards)),
		}
		for _, c := range p.Cards {
			pkg.Cards = append(pkg.Cards, runawaysDraftCardLiteToJSON(c))
		}
		out.Packages = append(out.Packages, pkg)
	}
	return out
}

func runawaysDraftCardLiteToJSON(c repository.RunawaysDraftCardLite) runawaysDraftCardLiteJSON {
	return runawaysDraftCardLiteJSON{
		CardID:         c.CardID,
		Name:           c.Name,
		CardIdentifier: c.CardIdentifier,
		ImageURL:       c.ImageURL,
	}
}
