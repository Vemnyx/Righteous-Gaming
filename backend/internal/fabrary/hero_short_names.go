package fabrary

import "strings"

// heroShortNameEntry mirrors Fabrary cards get-short-names.ts heroShortNames.
// https://github.com/fabrary/cards/blob/ac409c8f088a58442039478b3decdcf7179d022f/packages/cards/scripts/Shared/get-short-names.ts
type heroShortNameEntry struct {
	identifiers []string
	shortName   string
}

//nolint:gochecknoglobals // static Fabrary reference data
var fabraryHeroShortNames = []heroShortNameEntry{
	{identifiers: []string{"arakni-5lp3d-7hru-7h3-cr4x"}, shortName: "Arakni, Slippy"},
	{identifiers: []string{"arakni-huntsman"}, shortName: "Arakni, Huntsman"},
	{identifiers: []string{"arakni-marionette"}, shortName: "Arakni, Marionette"},
	{identifiers: []string{"arakni-solitary-confinement"}, shortName: "Arakni, Solitary"},
	{identifiers: []string{"arakni-web-of-deceit"}, shortName: "Arakni, Deceit"},
	{identifiers: []string{"bravo-flattering-showman"}, shortName: "Bravo, Flattering"},
	{identifiers: []string{"dash-inventor-extraordinaire"}, shortName: "Dash IE"},
	{identifiers: []string{"dash-io"}, shortName: "Dash IO"},
	{identifiers: []string{"kayo-strong-arm"}, shortName: "Kayo, RKO"},
	{identifiers: []string{"kayo-underhanded-cheat"}, shortName: "Kayo, RKO"},
	{identifiers: []string{"prism-advent-of-thrones"}, shortName: "Prism, AoT"},
	{identifiers: []string{"professor-teklovossen"}, shortName: "Professor"},
}

// HeroShortNameFromIdentifier returns Fabrary's display short name for a hero card identifier, if known.
func HeroShortNameFromIdentifier(heroIdentifier string) string {
	slug := strings.ToLower(strings.TrimSpace(heroIdentifier))
	if slug == "" {
		return ""
	}
	for _, entry := range fabraryHeroShortNames {
		for _, id := range entry.identifiers {
			if strings.ToLower(strings.TrimSpace(id)) == slug {
				return entry.shortName
			}
		}
	}
	return ""
}
