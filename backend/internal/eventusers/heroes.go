package eventusers

import (
	"regexp"
	"strings"

	"righteous-gaming/backend/internal/repository"
)

var reHeroWhitespace = regexp.MustCompile(`\s+`)

// HeroMatcher resolves FabTCG hero display names to heroes.id values.
type HeroMatcher struct {
	byFull map[string]int
	byBase map[string]int
}

func NewHeroMatcher(rows []repository.HeroMatchRow) *HeroMatcher {
	m := &HeroMatcher{
		byFull: make(map[string]int, len(rows)*2),
		byBase: make(map[string]int, len(rows)*2),
	}
	for _, h := range rows {
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
		// Prefer adult heroes when multiple rows share the same key.
		if young {
			return
		}
		_ = existing
	}
	idx[key] = id
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
