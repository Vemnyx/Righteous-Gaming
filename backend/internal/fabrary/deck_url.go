package fabrary

import (
	"fmt"
	"net/url"
	"strings"
)

// ParseDeckURL extracts the Fabrary deck id from a share link or bare id.
func ParseDeckURL(raw string) (deckID string, normalizedLink string, err error) {
	s := strings.TrimSpace(raw)
	if s == "" {
		return "", "", fmt.Errorf("fabrary: empty deck url")
	}
	if !strings.Contains(s, "://") && !strings.Contains(s, "/") {
		id := strings.TrimSpace(s)
		if id == "" {
			return "", "", fmt.Errorf("fabrary: empty deck id")
		}
		return id, "https://fabrary.net/decks/" + id, nil
	}
	u, err := url.Parse(s)
	if err != nil {
		return "", "", fmt.Errorf("fabrary: invalid deck url: %w", err)
	}
	host := strings.ToLower(strings.TrimSpace(u.Hostname()))
	if host != "fabrary.net" && host != "www.fabrary.net" {
		return "", "", fmt.Errorf("fabrary: url must be on fabrary.net")
	}
	path := strings.Trim(strings.TrimSpace(u.Path), "/")
	if !strings.HasPrefix(path, "decks/") {
		return "", "", fmt.Errorf("fabrary: url path must be /decks/{id}")
	}
	id := strings.TrimSpace(strings.TrimPrefix(path, "decks/"))
	if id == "" || strings.Contains(id, "/") {
		return "", "", fmt.Errorf("fabrary: missing deck id in url")
	}
	normalized := "https://fabrary.net/decks/" + id
	return id, normalized, nil
}
