package fabrary

import (
	"fmt"
	"strings"

	"righteous-gaming/backend/internal/repository"
)

// MapCardBlockForImport maps one fabrary card object into CreateCardInput with all printings.
func MapCardBlockForImport(setCodeToID map[string]int, block string) (repository.CreateCardInput, []string, error) {
	printings, err := ExtractPrintingsFromBlock(block)
	if err != nil {
		return repository.CreateCardInput{}, nil, err
	}
	primary := pickPrimaryPrinting(block, printings)
	setCodeKey := strings.ToLower(strings.TrimSpace(primary.SetCode))
	setID, ok := setCodeToID[setCodeKey]
	if !ok {
		return repository.CreateCardInput{}, nil, fmt.Errorf("fabrary: set code %q not in database", primary.SetCode)
	}

	in, issues, err := MapCardObjectToInput(setID, primary.SetCode, block)
	if err != nil {
		return repository.CreateCardInput{}, issues, err
	}
	in.Printings = printings
	in.SetCode = primary.SetCode
	in.SetNum = primary.SetNum
	in.Rarity = primary.Rarity
	in.ImageURL = primary.ImageURL
	return in, issues, nil
}
