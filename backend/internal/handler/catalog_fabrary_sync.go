package handler

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/fabrary"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

const defaultFabraryLatestSetURL = "https://raw.githubusercontent.com/fabrary/cards/main/packages/cards/latest-set/index.ts"
const maxFabraryDownloadBytes = 15 << 20

func (h *catalogHTTP) requireAdmin(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	if h.svc == nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	idToken := bearerIDToken(r.Header.Get("Authorization"))
	if idToken == "" {
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return nil, false
	}
	u, err := h.svc.UserForIDToken(r.Context(), idToken)
	if err != nil {
		if errors.Is(err, service.ErrValidation) {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return nil, false
		}
		if errors.Is(err, service.ErrUnauthenticated) {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return nil, false
		}
		if errors.Is(err, service.ErrUserNotFound) {
			http.Error(w, "User not found", http.StatusNotFound)
			return nil, false
		}
		log.Error("fabrary sync admin auth", "error", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return nil, false
	}
	if u.Role == nil || *u.Role != domain.RoleAdmin {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return nil, false
	}
	return u, true
}

// POST /api/admin/catalog/sync-fabrary-latest-set?set_name=Omens+of+the+Stars&fab_release=Release.OmensOfTheStars&url=...
func (h *catalogHTTP) postAdminSyncFabraryLatestSet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if _, ok := h.requireAdmin(w, r); !ok {
		return
	}

	setName := strings.TrimSpace(r.URL.Query().Get("set_name"))
	if setName == "" {
		setName = "Omens of the Stars"
	}
	releaseTok := strings.TrimSpace(r.URL.Query().Get("fab_release"))
	if releaseTok == "" {
		releaseTok = "Release.OmensOfTheStars"
	}
	srcURL := strings.TrimSpace(r.URL.Query().Get("url"))
	if srcURL == "" {
		srcURL = defaultFabraryLatestSetURL
	}

	setRow, err := h.app.Repo.SetByNameFold(r.Context(), setName)
	if err != nil {
		if errors.Is(err, repository.ErrSetNotFound) {
			writeMessageError(w, http.StatusNotFound, fmt.Sprintf("set not found for name %q", setName))
			return
		}
		log.Error("fabrary sync set lookup", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	existing, err := h.app.Repo.ListCardIdentifiersLowerBySetID(r.Context(), setRow.ID)
	if err != nil {
		log.Error("fabrary sync list identifiers", "error", err)
		writeMessageError(w, http.StatusInternalServerError, "internal server error")
		return
	}

	body, err := fetchFabrarySource(r.Context(), srcURL)
	if err != nil {
		writeMessageError(w, http.StatusBadGateway, err.Error())
		return
	}

	objs, err := fabrary.ExtractCardObjectStrings(string(body))
	if err != nil {
		writeMessageError(w, http.StatusBadRequest, err.Error())
		return
	}

	type insertErr struct {
		CardIdentifier string `json:"card_identifier"`
		Error            string `json:"error"`
	}

	var (
		matchedRelease int
		skippedHave     int
		skippedMap     int
		inserted       int
		mapIssues      []string
		insertErrs     []insertErr
	)

	for _, block := range objs {
		if !fabrary.BlockMatchesRelease(block, releaseTok) {
			continue
		}
		matchedRelease++

		in, issues, err := fabrary.MapCardObjectToInput(setRow.ID, setRow.Code, block)
		for _, is := range issues {
			if len(mapIssues) < 400 {
				mapIssues = append(mapIssues, is)
			}
		}
		if err != nil {
			skippedMap++
			if len(insertErrs) < 80 {
				insertErrs = append(insertErrs, insertErr{Error: err.Error()})
			}
			continue
		}
		if in.CardIdentifier == nil {
			skippedMap++
			continue
		}
		key := strings.ToLower(strings.TrimSpace(*in.CardIdentifier))
		if _, ok := existing[key]; ok {
			skippedHave++
			continue
		}

		if field, msg, ok := validateCreateCardBody(createCardJSON{
			SetID:           in.SetID,
			Name:            in.Name,
			CardIdentifier:  in.CardIdentifier,
			ImageURL:        in.ImageURL,
			FunctionalText:  in.FunctionalText,
			Rarity:          in.Rarity,
			SetCode:         in.SetCode,
			SetNum:          in.SetNum,
			Type:            in.Type,
			Subtypes:        in.Subtypes,
			Classes:         in.Classes,
			Hybrid:          in.Hybrid,
			Talents:         in.Talents,
			Pitch:           in.Pitch,
			Cost:            in.Cost,
			Power:           in.Power,
			Block:           in.Block,
			Heroes:          in.Heroes,
			Life:            in.Life,
			Intellect:       in.Intellect,
			Keywords:        in.Keywords,
			Formats:         in.Formats,
			Specializations: in.Specializations,
			Fusions:         in.Fusions,
		}); !ok {
			skippedMap++
			if len(insertErrs) < 80 {
				insertErrs = append(insertErrs, insertErr{CardIdentifier: key, Error: field + ": " + msg})
			}
			continue
		}

		_, err = h.app.Repo.CreateCard(r.Context(), in)
		if err != nil {
			if len(insertErrs) < 120 {
				insertErrs = append(insertErrs, insertErr{CardIdentifier: key, Error: err.Error()})
			}
			continue
		}
		inserted++
		existing[key] = struct{}{}
	}

	writeCatalogJSON(w, http.StatusOK, map[string]any{
		"set":                setToJSON(setRow),
		"fabrary_url":        srcURL,
		"set_name_query":     setName,
		"release_filter":     releaseTok,
		"objects_total":      len(objs),
		"objects_matched":    matchedRelease,
		"skipped_already_have": skippedHave,
		"skipped_unmapped":   skippedMap,
		"inserted":           inserted,
		"mapping_notes":      mapIssues,
		"errors":             insertErrs,
	})
}

func fetchFabrarySource(ctx context.Context, rawURL string) ([]byte, error) {
	client := &http.Client{Timeout: 90 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "RighteousGamingFabrarySync/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch fabrary source: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		slurp, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("fetch fabrary source: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(slurp)))
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, maxFabraryDownloadBytes))
	if err != nil {
		return nil, err
	}
	return data, nil
}
