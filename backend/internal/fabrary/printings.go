package fabrary

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"righteous-gaming/backend/internal/repository"
)

var (
	rePrintingsHead    = regexp.MustCompile(`(?m)\bprintings:\s*\[`)
	rePrintingIdentStr = regexp.MustCompile(`(?m)\bidentifier:\s*"([^"]+)"`)
	rePrintingImage    = regexp.MustCompile(`(?m)\bimage:\s*"([^"]+)"`)
	rePrintingRarity   = regexp.MustCompile(`(?m)\brarity:\s*Rarity\.(\w+)`)
	rePrintingCodeNum  = regexp.MustCompile(`^([A-Za-z]+)(\d+)`)
)

func parseCodeNumFromIdent(ident string) (setCode string, setNum int16, ok bool) {
	m := rePrintingCodeNum.FindStringSubmatch(strings.TrimSpace(ident))
	if len(m) < 3 {
		return "", 0, false
	}
	n, err := strconv.Atoi(m[2])
	if err != nil || n < 0 || n > 32767 {
		return "", 0, false
	}
	return strings.ToUpper(strings.TrimSpace(m[1])), int16(n), true
}

func printingImageURL(imageKey string) *string {
	key := strings.TrimSpace(imageKey)
	if key == "" {
		return nil
	}
	u := fmt.Sprintf("https://content.fabrary.net/cards/%s.webp", key)
	return &u
}

// ExtractPrintingsFromBlock parses the printings array on a fabrary card object literal.
func ExtractPrintingsFromBlock(block string) ([]repository.CreateCardPrintingInput, error) {
	loc := rePrintingsHead.FindStringIndex(block)
	if loc == nil {
		return fallbackPrintingFromDefaultImage(block)
	}
	openBracket := strings.Index(block[loc[0]:], "[") + loc[0]
	end, err := matchingCloseBracket(block, openBracket, '[', ']')
	if err != nil {
		return nil, err
	}
	inner := block[openBracket+1 : end]
	objStrs, err := splitTopLevelBraceObjects(inner)
	if err != nil {
		return nil, err
	}
	out := make([]repository.CreateCardPrintingInput, 0, len(objStrs))
	for _, obj := range objStrs {
		p, err := parsePrintingObject(obj)
		if err != nil {
			continue
		}
		out = append(out, p)
	}
	if len(out) == 0 {
		return fallbackPrintingFromDefaultImage(block)
	}
	return out, nil
}

func parsePrintingObject(obj string) (repository.CreateCardPrintingInput, error) {
	im := rePrintingIdentStr.FindStringSubmatch(obj)
	if len(im) < 2 {
		return repository.CreateCardPrintingInput{}, fmt.Errorf("missing identifier")
	}
	setCode, setNum, ok := parseCodeNumFromIdent(im[1])
	if !ok {
		return repository.CreateCardPrintingInput{}, fmt.Errorf("bad identifier %q", im[1])
	}
	imageKey := im[1]
	if imgm := rePrintingImage.FindStringSubmatch(obj); len(imgm) >= 2 && strings.TrimSpace(imgm[1]) != "" {
		imageKey = strings.TrimSpace(imgm[1])
	}
	var rarity *int16
	if rm := rePrintingRarity.FindStringSubmatch(obj); len(rm) >= 2 {
		if v, ok := fabRarityKeyToSmallint[rm[1]]; ok {
			r := v
			rarity = &r
		}
	}
	return repository.CreateCardPrintingInput{
		SetCode:  setCode,
		SetNum:   setNum,
		Rarity:   rarity,
		ImageURL: printingImageURL(imageKey),
	}, nil
}

func fallbackPrintingFromDefaultImage(block string) ([]repository.CreateCardPrintingInput, error) {
	dim := reDefaultImage.FindStringSubmatch(block)
	if len(dim) < 2 {
		return nil, fmt.Errorf("no printings and no defaultImage")
	}
	setCode, setNum, ok := parseCodeNumFromIdent(dim[1])
	if !ok {
		setCode = parseSetCodeFromBlock(block, dim[1], "")
		setNum = parseSetNumFromBlock(block, dim[1], setCode)
	}
	var rarity *int16
	if rm := reRarity.FindStringSubmatch(block); len(rm) >= 2 {
		if v, ok := fabRarityKeyToSmallint[rm[1]]; ok {
			r := v
			rarity = &r
		}
	}
	return []repository.CreateCardPrintingInput{{
		SetCode:  setCode,
		SetNum:   setNum,
		Rarity:   rarity,
		ImageURL: printingImageURL(dim[1]),
	}}, nil
}

func pickPrimaryPrinting(block string, printings []repository.CreateCardPrintingInput) repository.CreateCardPrintingInput {
	if len(printings) == 0 {
		return repository.CreateCardPrintingInput{}
	}
	dim := reDefaultImage.FindStringSubmatch(block)
	if len(dim) >= 2 {
		want := strings.ToUpper(strings.TrimSpace(dim[1]))
		for _, p := range printings {
			if p.ImageURL == nil {
				continue
			}
			if strings.Contains(*p.ImageURL, "/"+want+".webp") {
				return p
			}
		}
		code, num, ok := parseCodeNumFromIdent(dim[1])
		if ok {
			for _, p := range printings {
				if p.SetCode == code && p.SetNum == num {
					return p
				}
			}
		}
	}
	return printings[0]
}
