package eventusers

import (
	"regexp"
	"strings"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
)

var reHeroWhitespace = regexp.MustCompile(`\s+`)

// HeroMatcher resolves FabTCG hero display names to heroes.id values.
type HeroMatcher struct {
	byFull    map[string]int
	byBase    map[string]int
	youngByID map[int]bool
	// preferYoung is set when event format is known; nil prefers adult heroes.
	preferYoung *bool
}

// NewHeroMatcher builds a matcher for FabTCG hero labels. When format is non-nil and
// recognized, only heroes of the legal age for that format are indexed.
func NewHeroMatcher(rows []repository.HeroMatchRow, format *int16) *HeroMatcher {
	m := &HeroMatcher{
		byFull:    make(map[string]int, len(rows)*2),
		byBase:    make(map[string]int, len(rows)*2),
		youngByID: make(map[int]bool, len(rows)),
	}
	if format != nil {
		if young, ok := domain.FormatUsesYoungHeroes(domain.CardFormat(*format)); ok {
			m.preferYoung = &young
		}
	}

	for _, h := range rows {
		if m.preferYoung != nil && h.Young != *m.preferYoung {
			continue
		}
		m.youngByID[h.ID] = h.Young
		full := normalizeHeroName(h.Name)
		if full == "" {
			continue
		}
		m.put(m.byFull, full, h.ID, h.Young)
		base := normalizeHeroName(heroBaseName(h.Name))
		if base != "" {
			m.put(m.byBase, base, h.ID, h.Young)
		}
	}
	return m
}

func (m *HeroMatcher) put(idx map[string]int, key string, id int, young bool) {
	if key == "" {
		return
	}
	if existing, ok := idx[key]; ok {
		if !m.shouldReplace(m.youngByID[existing], young) {
			return
		}
	}
	idx[key] = id
}

func (m *HeroMatcher) shouldReplace(existingYoung, newYoung bool) bool {
	if m.preferYoung == nil {
		// Unknown format: prefer adult when young and adult share a lookup key.
		if !newYoung && existingYoung {
			return true
		}
		return false
	}
	if *m.preferYoung {
		return newYoung && !existingYoung
	}
	return !newYoung && existingYoung
}

func normalizeHeroName(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	return reHeroWhitespace.ReplaceAllString(s, " ")
}

func heroBaseName(s string) string {
	if i := strings.Index(s, ","); i >= 0 {
		return strings.TrimSpace(s[:i])
	}
	return strings.TrimSpace(s)
}

// Match returns heroes.id for a FabTCG hero label, or nil when unknown.
func (m *HeroMatcher) Match(fabHeroName string) *int {
	if m == nil {
		return nil
	}
	fabHeroName = strings.TrimSpace(fabHeroName)
	if fabHeroName == "" {
		return nil
	}
	full := normalizeHeroName(fabHeroName)
	if full == "" {
		return nil
	}
	base := normalizeHeroName(heroBaseName(fabHeroName))
	if base != "" {
		if id, ok := m.byBase[base]; ok {
			return &id
		}
	}
	if id, ok := m.byFull[full]; ok {
		return &id
	}
	return nil
}
