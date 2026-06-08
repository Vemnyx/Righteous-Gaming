package repository

import (
	"context"
	"fmt"
	"math"
	"sort"

	"righteous-gaming/backend/internal/domain"
)

const runawaysMinDecksForArchetypes = 10

// RunawaysDraftCardLite is minimal card info for archetype UI.
type RunawaysDraftCardLite struct {
	CardID         int
	Name           string
	CardIdentifier *string
	ImageURL       *string
}

// RunawaysDraftTypicalFingerprint is the average mainboard profile for the slice.
type RunawaysDraftTypicalFingerprint struct {
	RedPct             float64
	YellowPct          float64
	BluePct            float64
	AvgCost            float64
	AvgBlock3          float64
	ReactionPct        float64
	EquipmentWeaponPct float64
}

// RunawaysDraftStyleTag summarizes decks matching a build-style heuristic.
type RunawaysDraftStyleTag struct {
	Key             string
	Label           string
	Description     string
	DeckCount       int
	Share           float64
	AvgRedPct       float64
	AvgBluePct      float64
	AvgCost         float64
	SignatureCards  []RunawaysDraftCardLite
}

// RunawaysDraftCardPackage is a pair of cards that co-occur more than expected.
type RunawaysDraftCardPackage struct {
	Cards     []RunawaysDraftCardLite
	DeckCount int
	Share     float64
	Lift      float64
}

// RunawaysDraftArchetypes is build-style analysis for a set + hero slice.
type RunawaysDraftArchetypes struct {
	Available           bool
	DeckCount           int
	MinDecksForAnalysis int
	UnavailableReason   string
	Typical             RunawaysDraftTypicalFingerprint
	Tags                []RunawaysDraftStyleTag
	Packages            []RunawaysDraftCardPackage
}

type runawaysDeckCardLine struct {
	DeckID         int
	CardID         int
	Name           string
	CardIdentifier *string
	ImageURL       *string
	Pitch          *int16
	Cost           *int16
	Block          *int16
	Type           int16
	Count          int
}

type runawaysDeckFingerprint struct {
	DeckID             int
	Mainboard          int
	Red                float64
	Yellow             float64
	Blue               float64
	Pitched            float64
	CostWeighted       float64
	CostCount          float64
	Block3             float64
	Block2             float64
	Reactions          float64
	Actions            float64
	EquipmentWeapon    float64
	RedPct             float64
	YellowPct          float64
	BluePct            float64
	AvgCost            float64
	ReactionPct        float64
	ActionPct          float64
	EquipmentWeaponPct float64
	Tags               []string
	CardIDs            map[int]int
}

// RunawaysDraftArchetypes loads build-style tags and card packages for a hero slice.
func (r *Repository) RunawaysDraftArchetypes(ctx context.Context, deckSourceID, setID, heroID int) (*RunawaysDraftArchetypes, error) {
	if r.pool == nil {
		return nil, fmt.Errorf("repository: pool is closed")
	}
	if deckSourceID <= 0 || setID <= 0 || heroID <= 0 {
		return nil, fmt.Errorf("repository: invalid runaways draft filter")
	}

	out := &RunawaysDraftArchetypes{
		MinDecksForAnalysis: runawaysMinDecksForArchetypes,
		Tags:                []RunawaysDraftStyleTag{},
		Packages:            []RunawaysDraftCardPackage{},
	}

	const countQ = `SELECT COUNT(*)::int ` + runawaysDraftDeckFilter
	if err := r.pool.QueryRow(ctx, countQ, deckSourceID, setID, heroID).Scan(&out.DeckCount); err != nil {
		return nil, fmt.Errorf("repository: runaways archetypes deck count: %w", err)
	}
	if out.DeckCount < runawaysMinDecksForArchetypes {
		out.UnavailableReason = fmt.Sprintf("Need at least %d decks to infer build styles.", runawaysMinDecksForArchetypes)
		return out, nil
	}

	lines, err := r.listRunawaysDraftMainboardLines(ctx, deckSourceID, setID, heroID)
	if err != nil {
		return nil, err
	}
	if len(lines) == 0 {
		out.UnavailableReason = "No mainboard cards found for these decks."
		return out, nil
	}

	cardMeta := map[int]RunawaysDraftCardLite{}
	decks := map[int]*runawaysDeckFingerprint{}
	for _, line := range lines {
		if _, ok := cardMeta[line.CardID]; !ok {
			cardMeta[line.CardID] = RunawaysDraftCardLite{
				CardID:         line.CardID,
				Name:           line.Name,
				CardIdentifier: line.CardIdentifier,
				ImageURL:       line.ImageURL,
			}
		}
		fp, ok := decks[line.DeckID]
		if !ok {
			fp = &runawaysDeckFingerprint{DeckID: line.DeckID, CardIDs: map[int]int{}}
			decks[line.DeckID] = fp
		}
		cnt := float64(line.Count)
		fp.Mainboard += line.Count
		fp.CardIDs[line.CardID] += line.Count
		if line.Pitch != nil {
			switch *line.Pitch {
			case 1:
				fp.Red += cnt
			case 2:
				fp.Yellow += cnt
			case 3:
				fp.Blue += cnt
			}
			fp.Pitched += cnt
		}
		if line.Cost != nil {
			fp.CostWeighted += float64(*line.Cost) * cnt
			fp.CostCount += cnt
		}
		if line.Block != nil {
			switch *line.Block {
			case 3:
				fp.Block3 += cnt
			case 2:
				fp.Block2 += cnt
			}
		}
		switch line.Type {
		case int16(domain.CardTypeAttackReaction), int16(domain.CardTypeDefenseReaction):
			fp.Reactions += cnt
		case int16(domain.CardTypeAttackAction), int16(domain.CardTypeNonAttackAction):
			fp.Actions += cnt
		case int16(domain.CardTypeEquipment), int16(domain.CardTypeWeapon):
			fp.EquipmentWeapon += cnt
		}
	}

	fingerprints := make([]*runawaysDeckFingerprint, 0, len(decks))
	for _, fp := range decks {
		if fp.Mainboard <= 0 {
			continue
		}
		mb := float64(fp.Mainboard)
		if fp.Pitched > 0 {
			fp.RedPct = fp.Red / fp.Pitched
			fp.YellowPct = fp.Yellow / fp.Pitched
			fp.BluePct = fp.Blue / fp.Pitched
		}
		if fp.CostCount > 0 {
			fp.AvgCost = fp.CostWeighted / fp.CostCount
		}
		fp.ReactionPct = fp.Reactions / mb
		fp.ActionPct = fp.Actions / mb
		fp.EquipmentWeaponPct = fp.EquipmentWeapon / mb
		fp.Tags = classifyRunawaysDeckTags(fp)
		fingerprints = append(fingerprints, fp)
	}

	if len(fingerprints) < runawaysMinDecksForArchetypes {
		out.UnavailableReason = fmt.Sprintf("Need at least %d decks with mainboard data.", runawaysMinDecksForArchetypes)
		return out, nil
	}

	out.Available = true
	out.Typical = averageRunawaysFingerprints(fingerprints)
	out.Tags = buildRunawaysStyleTags(fingerprints, cardMeta, len(fingerprints))
	out.Packages = detectRunawaysCardPackages(fingerprints, cardMeta, len(fingerprints))
	return out, nil
}

func (r *Repository) listRunawaysDraftMainboardLines(ctx context.Context, deckSourceID, setID, heroID int) ([]runawaysDeckCardLine, error) {
	const q = `
SELECT d.id, c.id, c.name, c.card_identifier, cp.image_url, c.pitch, c.cost, c.block, c.type, dc.count
FROM decks d
INNER JOIN deck_cards dc ON dc.deck_id = d.id AND dc.mainboard = true
INNER JOIN cards c ON c.id = dc.card_id
` + cardPrintingLateralJoin + `
WHERE d.deck_source_id = $1 AND d.set_id = $2 AND d.hero_id = $3
ORDER BY d.id ASC, c.id ASC`

	rows, err := r.pool.Query(ctx, q, deckSourceID, setID, heroID)
	if err != nil {
		return nil, fmt.Errorf("repository: runaways archetypes deck lines: %w", err)
	}
	defer rows.Close()

	out := make([]runawaysDeckCardLine, 0, 2048)
	for rows.Next() {
		var line runawaysDeckCardLine
		if err := rows.Scan(
			&line.DeckID, &line.CardID, &line.Name, &line.CardIdentifier, &line.ImageURL,
			&line.Pitch, &line.Cost, &line.Block, &line.Type, &line.Count,
		); err != nil {
			return nil, fmt.Errorf("repository: runaways archetypes deck lines scan: %w", err)
		}
		out = append(out, line)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func classifyRunawaysDeckTags(fp *runawaysDeckFingerprint) []string {
	var tags []string
	if fp.Pitched > 0 {
		if fp.RedPct >= 0.38 {
			tags = append(tags, "red_aggro")
		}
		if fp.BluePct >= 0.38 {
			tags = append(tags, "blue_control")
		}
		if fp.YellowPct >= 0.38 {
			tags = append(tags, "yellow_mid")
		}
		maxPitch := math.Max(fp.RedPct, math.Max(fp.YellowPct, fp.BluePct))
		if maxPitch <= 0.45 && fp.Red > 0 && fp.Yellow > 0 && fp.Blue > 0 &&
			fp.RedPct < 0.38 && fp.BluePct < 0.38 && fp.YellowPct < 0.38 {
			tags = append(tags, "balanced_pitch")
		}
	}
	if fp.CostCount > 0 {
		switch {
		case fp.AvgCost < 0.9:
			tags = append(tags, "low_curve")
		case fp.AvgCost >= 1.8:
			tags = append(tags, "high_curve")
		}
	}
	if fp.Block3 >= 4.5 {
		tags = append(tags, "block_heavy")
	}
	if fp.ReactionPct >= 0.22 {
		tags = append(tags, "reaction_heavy")
	}
	if fp.EquipmentWeapon >= 5 {
		tags = append(tags, "equipment_focus")
	}
	return tags
}

var runawaysStyleTagMeta = map[string]struct{ Label, Description string }{
	"red_aggro": {
		Label:       "Red-leaning",
		Description: "At least 38% of pitched cards are red.",
	},
	"blue_control": {
		Label:       "Blue-leaning",
		Description: "At least 38% of pitched cards are blue.",
	},
	"yellow_mid": {
		Label:       "Yellow-leaning",
		Description: "At least 38% of pitched cards are yellow.",
	},
	"balanced_pitch": {
		Label:       "Balanced pitch",
		Description: "Red, yellow, and blue all present with no color above 45%.",
	},
	"low_curve": {
		Label:       "Low curve",
		Description: "Weighted average card cost below 0.9.",
	},
	"high_curve": {
		Label:       "High curve",
		Description: "Weighted average card cost at least 1.8.",
	},
	"block_heavy": {
		Label:       "Block-heavy",
		Description: "At least 4–5 copies of 3-block cards in the mainboard.",
	},
	"reaction_heavy": {
		Label:       "Reaction-heavy",
		Description: "Reactions make up at least 22% of the mainboard.",
	},
	"equipment_focus": {
		Label:       "Equipment-focused",
		Description: "At least five equipment or weapon cards in the mainboard.",
	},
}

func averageRunawaysFingerprints(fps []*runawaysDeckFingerprint) RunawaysDraftTypicalFingerprint {
	if len(fps) == 0 {
		return RunawaysDraftTypicalFingerprint{}
	}
	var sum RunawaysDraftTypicalFingerprint
	for _, fp := range fps {
		sum.RedPct += fp.RedPct
		sum.YellowPct += fp.YellowPct
		sum.BluePct += fp.BluePct
		sum.AvgCost += fp.AvgCost
		sum.AvgBlock3 += fp.Block3
		sum.ReactionPct += fp.ReactionPct
		sum.EquipmentWeaponPct += fp.EquipmentWeaponPct
	}
	n := float64(len(fps))
	return RunawaysDraftTypicalFingerprint{
		RedPct:             sum.RedPct / n,
		YellowPct:          sum.YellowPct / n,
		BluePct:            sum.BluePct / n,
		AvgCost:            sum.AvgCost / n,
		AvgBlock3:          sum.AvgBlock3 / n,
		ReactionPct:        sum.ReactionPct / n,
		EquipmentWeaponPct: sum.EquipmentWeaponPct / n,
	}
}

func buildRunawaysStyleTags(fps []*runawaysDeckFingerprint, cardMeta map[int]RunawaysDraftCardLite, totalDecks int) []RunawaysDraftStyleTag {
	type tagAgg struct {
		count           int
		red, blue, cost float64
		cardDecks       map[int]int
	}
	aggs := map[string]*tagAgg{}
	overallCardDecks := map[int]int{}

	for _, fp := range fps {
		for cardID := range fp.CardIDs {
			overallCardDecks[cardID]++
		}
		for _, key := range fp.Tags {
			a, ok := aggs[key]
			if !ok {
				a = &tagAgg{cardDecks: map[int]int{}}
				aggs[key] = a
			}
			a.count++
			a.red += fp.RedPct
			a.blue += fp.BluePct
			a.cost += fp.AvgCost
			for cardID := range fp.CardIDs {
				a.cardDecks[cardID]++
			}
		}
	}

	order := []string{
		"red_aggro", "blue_control", "yellow_mid", "balanced_pitch",
		"low_curve", "high_curve", "block_heavy", "reaction_heavy", "equipment_focus",
	}
	out := make([]RunawaysDraftStyleTag, 0, len(aggs))
	for _, key := range order {
		a, ok := aggs[key]
		if !ok || a.count == 0 {
			continue
		}
		meta := runawaysStyleTagMeta[key]
		n := float64(a.count)
		tag := RunawaysDraftStyleTag{
			Key:         key,
			Label:       meta.Label,
			Description: meta.Description,
			DeckCount:   a.count,
			Share:       float64(a.count) / float64(totalDecks),
			AvgRedPct:   a.red / n,
			AvgBluePct:  a.blue / n,
			AvgCost:     a.cost / n,
			SignatureCards: signatureCardsForTag(a.cardDecks, overallCardDecks, cardMeta, totalDecks, a.count, 5),
		}
		out = append(out, tag)
	}

	sort.Slice(out, func(i, j int) bool {
		if out[i].DeckCount != out[j].DeckCount {
			return out[i].DeckCount > out[j].DeckCount
		}
		return out[i].Label < out[j].Label
	})
	return out
}

type sigLift struct {
	cardID int
	lift   float64
	decks  int
}

func signatureCardsForTag(
	tagCardDecks map[int]int,
	overallCardDecks map[int]int,
	cardMeta map[int]RunawaysDraftCardLite,
	totalDecks, tagDeckCount, limit int,
) []RunawaysDraftCardLite {
	if tagDeckCount <= 0 || totalDecks <= 0 || limit <= 0 {
		return nil
	}
	const minTagDecks = 3
	scores := make([]sigLift, 0, len(tagCardDecks))
	for cardID, tagCount := range tagCardDecks {
		if tagCount < minTagDecks {
			continue
		}
		overall := overallCardDecks[cardID]
		if overall <= 0 {
			continue
		}
		tagRate := float64(tagCount) / float64(tagDeckCount)
		overallRate := float64(overall) / float64(totalDecks)
		if overallRate <= 0 {
			continue
		}
		lift := tagRate / overallRate
		if lift < 1.15 {
			continue
		}
		scores = append(scores, sigLift{cardID: cardID, lift: lift, decks: tagCount})
	}
	sort.Slice(scores, func(i, j int) bool {
		if scores[i].lift != scores[j].lift {
			return scores[i].lift > scores[j].lift
		}
		return scores[i].decks > scores[j].decks
	})
	if len(scores) > limit {
		scores = scores[:limit]
	}
	out := make([]RunawaysDraftCardLite, 0, len(scores))
	for _, s := range scores {
		if c, ok := cardMeta[s.cardID]; ok {
			out = append(out, c)
		}
	}
	return out
}

func detectRunawaysCardPackages(
	fps []*runawaysDeckFingerprint,
	cardMeta map[int]RunawaysDraftCardLite,
	totalDecks int,
) []RunawaysDraftCardPackage {
	if totalDecks <= 0 {
		return nil
	}
	minDecks := 4
	if pct := int(math.Ceil(float64(totalDecks) * 0.15)); pct > minDecks {
		minDecks = pct
	}

	cardDeckCount := map[int]int{}
	pairDeckCount := map[[2]int]int{}

	for _, fp := range fps {
		ids := make([]int, 0, len(fp.CardIDs))
		for id := range fp.CardIDs {
			ids = append(ids, id)
			cardDeckCount[id]++
		}
		sort.Ints(ids)
		for i := 0; i < len(ids); i++ {
			for j := i + 1; j < len(ids); j++ {
				pair := [2]int{ids[i], ids[j]}
				pairDeckCount[pair]++
			}
		}
	}

	type pairScore struct {
		a, b  int
		decks int
		lift  float64
	}
	scores := make([]pairScore, 0, len(pairDeckCount))
	for pair, both := range pairDeckCount {
		if both < minDecks {
			continue
		}
		pa := float64(cardDeckCount[pair[0]]) / float64(totalDecks)
		pb := float64(cardDeckCount[pair[1]]) / float64(totalDecks)
		if pa <= 0 || pb <= 0 {
			continue
		}
		support := float64(both) / float64(totalDecks)
		lift := support / (pa * pb)
		if lift < 1.2 {
			continue
		}
		scores = append(scores, pairScore{a: pair[0], b: pair[1], decks: both, lift: lift})
	}

	sort.Slice(scores, func(i, j int) bool {
		si := float64(scores[i].decks) * scores[i].lift
		sj := float64(scores[j].decks) * scores[j].lift
		if si != sj {
			return si > sj
		}
		return scores[i].decks > scores[j].decks
	})

	const maxPackages = 10
	if len(scores) > maxPackages {
		scores = scores[:maxPackages]
	}

	out := make([]RunawaysDraftCardPackage, 0, len(scores))
	for _, s := range scores {
		cards := make([]RunawaysDraftCardLite, 0, 2)
		if c, ok := cardMeta[s.a]; ok {
			cards = append(cards, c)
		}
		if c, ok := cardMeta[s.b]; ok {
			cards = append(cards, c)
		}
		if len(cards) < 2 {
			continue
		}
		out = append(out, RunawaysDraftCardPackage{
			Cards:     cards,
			DeckCount: s.decks,
			Share:     float64(s.decks) / float64(totalDecks),
			Lift:      s.lift,
		})
	}
	return out
}
