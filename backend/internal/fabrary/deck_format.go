package fabrary

import (
	"fmt"
	"strings"
)

var fabFormatLabelToSmallint = map[string]int16{
	"Limited":              0,
	"Draft":                0,
	"Sealed":               0,
	"Silver Age":           1,
	"Golden Age":           2,
	"Classic Constructed":  3,
	"Classic Construction": 3,
	"Living Legend":        4,
}

// FormatFromFabrary maps a Fabrary deck format label or enum key to domain CardFormat id.
func FormatFromFabrary(raw string) (int16, error) {
	label := strings.TrimSpace(raw)
	if label == "" {
		return 0, fmt.Errorf("fabrary: empty format")
	}
	if id, ok := fabFormatLabelToSmallint[label]; ok {
		return id, nil
	}
	if id, ok := fabFormatKeyToSmallint[label]; ok {
		return id, nil
	}
	compact := strings.ReplaceAll(label, " ", "")
	if id, ok := fabFormatKeyToSmallint[compact]; ok {
		return id, nil
	}
	return 0, fmt.Errorf("fabrary: unknown format %q", raw)
}
