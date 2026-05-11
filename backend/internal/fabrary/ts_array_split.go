package fabrary

import (
	"fmt"
	"regexp"
	"strings"
)

// Matches fabrary packages/cards/latest-set/index.ts header (optional export, optional leading whitespace).
// TypeScript uses `Card[] = [...]` (array type) not `Card = [...]`.
var reCardsArrayHead = regexp.MustCompile(`(?s)\s*(?:export\s+)?const\s+\w+\s*:\s*Card\s*\[\s*\]\s*=\s*\[`)

// ExtractCardObjectStrings parses a fabrary `const name: Card[] = [ ... ];` file and returns
// top-level object literals as raw strings (including outer `{` `}`).
func ExtractCardObjectStrings(ts string) ([]string, error) {
	loc := reCardsArrayHead.FindStringIndex(ts)
	if loc == nil {
		return nil, fmt.Errorf("fabrary: no Card[] array assignment found (expected const … : Card[] = [)")
	}
	start := loc[1] // index after '['
	end, err := matchingCloseBracket(ts, start-1, '[', ']')
	if err != nil {
		return nil, err
	}
	inner := ts[start:end]
	return splitTopLevelBraceObjects(inner)
}

func matchingCloseBracket(s string, openIdx int, open, close rune) (int, error) {
	if openIdx < 0 || openIdx >= len(s) || rune(s[openIdx]) != open {
		return 0, fmt.Errorf("fabrary: expected %c at %d", open, openIdx)
	}
	depth := 0
	inDbl := false
	inSgl := false
	inBt := false
	esc := false
	for i := openIdx; i < len(s); i++ {
		ch := s[i]
		r := rune(ch)
		if inBt {
			if esc {
				esc = false
				continue
			}
			if ch == '\\' {
				esc = true
				continue
			}
			if ch == '`' {
				inBt = false
			}
			continue
		}
		if inDbl {
			if esc {
				esc = false
				continue
			}
			if ch == '\\' {
				esc = true
				continue
			}
			if ch == '"' {
				inDbl = false
			}
			continue
		}
		if inSgl {
			if ch == '\'' {
				inSgl = false
			}
			continue
		}
		// code / comment
		if ch == '/' && i+1 < len(s) {
			if s[i+1] == '/' {
				i += 2
				for i < len(s) && s[i] != '\n' {
					i++
				}
				continue
			}
		}
		switch r {
		case '"':
			inDbl = true
		case '\'':
			inSgl = true
		case '`':
			inBt = true
		case open:
			depth++
		case close:
			depth--
			if depth == 0 {
				return i, nil
			}
		}
	}
	return 0, fmt.Errorf("fabrary: unclosed bracket from offset %d", openIdx)
}

func splitTopLevelBraceObjects(inner string) ([]string, error) {
	var out []string
	i := 0
	for i < len(inner) {
		for i < len(inner) && isSpace(inner[i]) {
			i++
		}
		if i >= len(inner) {
			break
		}
		if inner[i] != '{' {
			return nil, fmt.Errorf("fabrary: expected '{' at offset %d, got %q", i, snippet(inner, i, 40))
		}
		end, err := matchingCloseBracket(inner, i, '{', '}')
		if err != nil {
			return nil, err
		}
		out = append(out, strings.TrimSpace(inner[i:end+1]))
		i = end + 1
		for i < len(inner) && isSpace(inner[i]) {
			i++
		}
		if i < len(inner) && inner[i] == ',' {
			i++
		}
	}
	return out, nil
}

func isSpace(b byte) bool {
	return b == ' ' || b == '\n' || b == '\r' || b == '\t'
}

func snippet(s string, at, n int) string {
	if at >= len(s) {
		return ""
	}
	end := at + n
	if end > len(s) {
		end = len(s)
	}
	return s[at:end]
}
