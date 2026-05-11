package fabrary

import (
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/repository"
)

var (
	reCardIdentifier  = regexp.MustCompile(`(?m)cardIdentifier:\s*"([^"]+)"`)
	reName            = regexp.MustCompile(`(?m)\bname:\s*"((?:[^"\\]|\\.)*)"\s*,?`)
	reDefaultImage    = regexp.MustCompile(`(?m)\bdefaultImage:\s*"([^"]+)"`)
	reRarity          = regexp.MustCompile(`(?m)\brarity:\s*Rarity\.(\w+)`)
	reTypesLine       = regexp.MustCompile(`(?m)\btypes:\s*\[([^\]]+)\]`)
	reSubtypesLine    = regexp.MustCompile(`(?m)\bsubtypes:\s*\[([^\]]*)\]`)
	reClassesLine     = regexp.MustCompile(`(?m)\bclasses:\s*\[([^\]]*)\]`)
	reTalentsLine     = regexp.MustCompile(`(?m)\btalents:\s*\[([^\]]*)\]`)
	reKeywordsLine    = regexp.MustCompile(`(?m)\bkeywords:\s*\[([^\]]*)\]`)
	reLegalFormats    = regexp.MustCompile(`(?m)\blegalFormats:\s*\[([^\]]+)\]`)
	reLegalHeroes     = regexp.MustCompile(`(?m)\blegalHeroes:\s*\[([^\]]*)\]`)
	reSpecsLine       = regexp.MustCompile(`(?m)\bspecializations:\s*\[([^\]]*)\]`)
	reFusionsLine     = regexp.MustCompile(`(?m)\bfusions:\s*\[([^\]]*)\]`)
	rePitch           = regexp.MustCompile(`(?m)\bpitch:\s*(\d+)`)
	reCost            = regexp.MustCompile(`(?m)\bcost:\s*(\d+)`)
	rePower           = regexp.MustCompile(`(?m)\bpower:\s*(\d+)`)
	reDefense         = regexp.MustCompile(`(?m)\bdefense:\s*(\d+)`)
	reLife            = regexp.MustCompile(`(?m)\blife:\s*(\d+)`)
	reIntellect       = regexp.MustCompile(`(?m)\bintellect:\s*(\d+)`)
	reFunctionalText  = regexp.MustCompile("(?s)functionalText:\\s*`([\\s\\S]*?)`")
	rePrintingIdent   = regexp.MustCompile(`(?m)\bidentifier:\s*"([A-Za-z]+)(\d+)"`)
	reSetIdentifiers  = regexp.MustCompile(`(?m)\bsetIdentifiers:\s*\[([^\]]+)\]`)
)

// BlockMatchesRelease returns true if block contains the substring (e.g. "Release.OmensOfTheStars").
// If token is empty, any block matches.
func BlockMatchesRelease(block, token string) bool {
	token = strings.TrimSpace(token)
	if token == "" {
		return true
	}
	return strings.Contains(block, token)
}

func fabEnumMembers(line, prefix string) []string {
	re := regexp.MustCompile(regexp.QuoteMeta(prefix) + `\.(\w+)`)
	ms := re.FindAllStringSubmatch(line, -1)
	out := make([]string, 0, len(ms))
	for _, m := range ms {
		if len(m) > 1 {
			out = append(out, m[1])
		}
	}
	return out
}

func parseSmallintPtr(re *regexp.Regexp, block string) *int16 {
	m := re.FindStringSubmatch(block)
	if len(m) < 2 {
		return nil
	}
	v, err := strconv.ParseInt(m[1], 10, 16)
	if err != nil {
		return nil
	}
	x := int16(v)
	return &x
}

func mapSubtypes(keys []string, issues *[]string, cardID string) []int16 {
	var out []int16
	for _, k := range keys {
		id, ok := fabSubtypeKeyToSmallint[k]
		if !ok {
			*issues = append(*issues, fmt.Sprintf("%s: unknown subtype %q", cardID, k))
			continue
		}
		out = append(out, id)
	}
	return out
}

func mapClasses(keys []string, issues *[]string, cardID string) []int16 {
	var out []int16
	for _, k := range keys {
		id, ok := fabClassKeyToSmallint[k]
		if !ok {
			*issues = append(*issues, fmt.Sprintf("%s: unknown class %q", cardID, k))
			continue
		}
		out = append(out, id)
	}
	return out
}

func mapTalents(keys []string, issues *[]string, cardID string) []int16 {
	var out []int16
	for _, k := range keys {
		key := k
		if strings.EqualFold(k, "reviled") {
			key = "Reviled"
		}
		id, ok := fabTalentKeyToSmallint[key]
		if !ok {
			*issues = append(*issues, fmt.Sprintf("%s: dropped unknown talent %q", cardID, k))
			continue
		}
		out = append(out, id)
	}
	return out
}

func mapKeywords(keys []string, issues *[]string, cardID string) []int16 {
	var out []int16
	for _, k := range keys {
		id, ok := fabKeywordKeyToSmallint[k]
		if !ok {
			*issues = append(*issues, fmt.Sprintf("%s: dropped unknown keyword %q", cardID, k))
			continue
		}
		out = append(out, id)
	}
	return out
}

func mapHeroes(keys []string, issues *[]string, cardID string) []int16 {
	var out []int16
	for _, k := range keys {
		id, ok := fabHeroKeyToSmallint[k]
		if !ok {
			*issues = append(*issues, fmt.Sprintf("%s: dropped unknown hero %q", cardID, k))
			continue
		}
		out = append(out, id)
	}
	return out
}

func mapFormats(keys []string) []int16 {
	seen := map[int16]struct{}{}
	for _, k := range keys {
		id, ok := fabFormatKeyToSmallint[k]
		if !ok {
			continue
		}
		seen[id] = struct{}{}
	}
	out := make([]int16, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Slice(out, func(i, j int) bool { return out[i] < out[j] })
	return out
}

func mapFusions(keys []string, issues *[]string, cardID string) []int16 {
	var out []int16
	for _, k := range keys {
		id, ok := fabFusionKeyToSmallint[k]
		if !ok {
			*issues = append(*issues, fmt.Sprintf("%s: dropped unknown fusion %q", cardID, k))
			continue
		}
		out = append(out, id)
	}
	return out
}

func isAttackAction(subtypeKeys []string) bool {
	for _, k := range subtypeKeys {
		if k == "Attack" {
			return true
		}
	}
	return false
}

func mapCardType(typeKeys []string, subtypeKeys []string, issues *[]string, cardID string) int16 {
	if len(typeKeys) == 0 {
		*issues = append(*issues, fmt.Sprintf("%s: missing types; using Non-Attack Action", cardID))
		return fabTypeKeyToSmallint["NonAttackAction"]
	}
	t := typeKeys[0]
	if t == "Action" {
		if isAttackAction(subtypeKeys) {
			return fabTypeKeyToSmallint["AttackAction"]
		}
		return fabTypeKeyToSmallint["NonAttackAction"]
	}
	id, ok := fabTypeKeyToSmallint[t]
	if !ok || id < 0 {
		*issues = append(*issues, fmt.Sprintf("%s: unknown FAB type %q; using Non-Attack Action", cardID, t))
		return fabTypeKeyToSmallint["NonAttackAction"]
	}
	return id
}

func parseSetNumFromBlock(block, defaultImage, setCodePrefix string) int16 {
	setCodePrefix = strings.TrimSpace(setCodePrefix)
	if m := reSetIdentifiers.FindStringSubmatch(block); len(m) > 1 {
		inner := m[1]
		reQuoted := regexp.MustCompile(`"([A-Za-z]+)(\d+)"`)
		var fallback int16 = -1
		for _, sm := range reQuoted.FindAllStringSubmatch(inner, -1) {
			if len(sm) >= 3 {
				n, err := strconv.Atoi(sm[2])
				if err != nil || n < 0 || n > 32767 {
					continue
				}
				v := int16(n)
				if setCodePrefix != "" && strings.EqualFold(sm[1], setCodePrefix) {
					return v
				}
				if fallback < 0 {
					fallback = v
				}
			}
		}
		if fallback >= 0 {
			return fallback
		}
	}
	if m := regexp.MustCompile(`^([A-Za-z]+)(\d+)$`).FindStringSubmatch(strings.TrimSpace(defaultImage)); len(m) >= 3 {
		n, err := strconv.Atoi(m[2])
		if err == nil && n >= 0 && n <= 32767 {
			return int16(n)
		}
	}
	return 0
}

func parseSetCodeFromBlock(block, defaultImage, fallback string) string {
	if m := rePrintingIdent.FindStringSubmatch(block); len(m) >= 2 {
		return strings.ToUpper(strings.TrimSpace(m[1]))
	}
	if m := regexp.MustCompile(`^([A-Za-z]+)\d`).FindStringSubmatch(strings.TrimSpace(defaultImage)); len(m) >= 2 {
		return strings.ToUpper(m[1])
	}
	return strings.ToUpper(strings.TrimSpace(fallback))
}

// MapCardObjectToInput maps one fabrary card object literal (TS) into our CreateCardInput.
func MapCardObjectToInput(setID int, fallbackSetCode string, block string) (repository.CreateCardInput, []string, error) {
	var issues []string
	m := reCardIdentifier.FindStringSubmatch(block)
	if len(m) < 2 {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: missing cardIdentifier")
	}
	cardID := strings.TrimSpace(m[1])
	if cardID == "" {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: empty cardIdentifier")
	}

	nm := reName.FindStringSubmatch(block)
	if len(nm) < 2 {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: %s: missing name", cardID)
	}
	name := strings.TrimSpace(unescapeTSString(nm[1]))
	if name == "" {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: %s: empty name", cardID)
	}

	dim := reDefaultImage.FindStringSubmatch(block)
	defaultImage := ""
	if len(dim) >= 2 {
		defaultImage = strings.TrimSpace(dim[1])
	}

	rm := reRarity.FindStringSubmatch(block)
	if len(rm) < 2 {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: %s: missing rarity", cardID)
	}
	rarityKey := rm[1]
	rarityVal, ok := fabRarityKeyToSmallint[rarityKey]
	if !ok {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: %s: unknown rarity %q", cardID, rarityKey)
	}

	typeKeys := []string{}
	if tm := reTypesLine.FindStringSubmatch(block); len(tm) > 1 {
		typeKeys = fabEnumMembers(tm[1], "Type")
	}
	subKeys := []string{}
	if sm := reSubtypesLine.FindStringSubmatch(block); len(sm) > 1 {
		subKeys = fabEnumMembers(sm[1], "Subtype")
	}
	classKeys := []string{}
	if cm := reClassesLine.FindStringSubmatch(block); len(cm) > 1 {
		classKeys = fabEnumMembers(cm[1], "Class")
	}
	talentKeys := []string{}
	if tlm := reTalentsLine.FindStringSubmatch(block); len(tlm) > 1 {
		talentKeys = fabEnumMembers(tlm[1], "Talent")
	}
	kwKeys := []string{}
	if km := reKeywordsLine.FindStringSubmatch(block); len(km) > 1 {
		kwKeys = fabEnumMembers(km[1], "Keyword")
	}
	formatKeys := []string{}
	if fm := reLegalFormats.FindStringSubmatch(block); len(fm) > 1 {
		formatKeys = fabEnumMembers(fm[1], "Format")
	}
	heroKeys := []string{}
	if hm := reLegalHeroes.FindStringSubmatch(block); len(hm) > 1 {
		heroKeys = fabEnumMembers(hm[1], "Hero")
	}
	specKeys := []string{}
	if sm := reSpecsLine.FindStringSubmatch(block); len(sm) > 1 {
		specKeys = fabEnumMembers(sm[1], "Hero")
	}
	fusionKeys := []string{}
	if fm := reFusionsLine.FindStringSubmatch(block); len(fm) > 1 {
		fusionKeys = fabEnumMembers(fm[1], "Fusion")
	}

	cardType := mapCardType(typeKeys, subKeys, &issues, cardID)
	subs := mapSubtypes(subKeys, &issues, cardID)
	classes := mapClasses(classKeys, &issues, cardID)
	if len(classes) == 0 {
		return repository.CreateCardInput{}, issues, fmt.Errorf("fabrary: %s: no valid classes", cardID)
	}

	setCode := parseSetCodeFromBlock(block, defaultImage, fallbackSetCode)
	setNum := parseSetNumFromBlock(block, defaultImage, setCode)

	ci := cardID
	var ft *string
	if fm := reFunctionalText.FindStringSubmatch(block); len(fm) > 1 {
		t := strings.TrimSpace(fm[1])
		if t != "" {
			ft = &t
		}
	}

	img := fmt.Sprintf("https://content.fabrary.net/cards/%s.webp", defaultImage)
	imgPtr := &img

	hybrid := strings.Contains(block, "hybrid: true") || cardID == "third-eye-of-the-sphinx"

	in := repository.CreateCardInput{
		SetID:           setID,
		Name:            name,
		CardIdentifier:  &ci,
		ImageURL:        imgPtr,
		FunctionalText:  ft,
		Rarity:          &rarityVal,
		SetCode:         setCode,
		SetNum:          setNum,
		Type:            cardType,
		Subtypes:        subs,
		Classes:         classes,
		Hybrid:          hybrid,
		Talents:         mapTalents(talentKeys, &issues, cardID),
		Pitch:           parseSmallintPtr(rePitch, block),
		Cost:            parseSmallintPtr(reCost, block),
		Power:           parseSmallintPtr(rePower, block),
		Block:           parseSmallintPtr(reDefense, block),
		Heroes:          mapHeroes(heroKeys, &issues, cardID),
		Life:            parseSmallintPtr(reLife, block),
		Intellect:       parseSmallintPtr(reIntellect, block),
		Keywords:        mapKeywords(kwKeys, &issues, cardID),
		Formats:         mapFormats(formatKeys),
		Specializations: mapHeroes(specKeys, &issues, cardID),
		Fusions:         mapFusions(fusionKeys, &issues, cardID),
	}
	return in, issues, nil
}

func unescapeTSString(s string) string {
	s = strings.ReplaceAll(s, `\"`, `"`)
	s = strings.ReplaceAll(s, `\\`, `\`)
	return s
}
