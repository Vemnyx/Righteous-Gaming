package fabrary

import (
	"fmt"
	"regexp"
)

var reCardsArrayHeadAll = regexp.MustCompile(`(?m)\bconst\s+cards\d+\s*:\s*Card\s*\[\s*\]\s*=\s*\[`)

// ExtractAllCardObjectStrings parses all fabrary `const … : Card[] = [ … ];` arrays in a file.
func ExtractAllCardObjectStrings(ts string) ([]string, error) {
	locs := reCardsArrayHeadAll.FindAllStringIndex(ts, -1)
	if len(locs) == 0 {
		return nil, fmt.Errorf("fabrary: no Card[] array assignments found")
	}
	var out []string
	for _, loc := range locs {
		openBracket := loc[1] - 1
		end, err := matchingCloseBracket(ts, openBracket, '[', ']')
		if err != nil {
			return nil, err
		}
		inner := ts[openBracket+1 : end]
		objs, err := splitTopLevelBraceObjects(inner)
		if err != nil {
			return nil, err
		}
		out = append(out, objs...)
	}
	return out, nil
}
