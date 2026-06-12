package eventmeta

import (
	"strings"

	"righteous-gaming/backend/internal/domain"
)

// MetaSharePhase selects which Nationals Swiss segment meta share reflects.
type MetaSharePhase string

const (
	MetaSharePhaseCC    MetaSharePhase = "cc"
	MetaSharePhaseDraft MetaSharePhase = "draft"
)

// ParseMetaSharePhase normalizes a query value for Nationals meta share.
func ParseMetaSharePhase(raw string) MetaSharePhase {
	switch MetaSharePhase(strings.ToLower(strings.TrimSpace(raw))) {
	case MetaSharePhaseCC:
		return MetaSharePhaseCC
	case MetaSharePhaseDraft:
		return MetaSharePhaseDraft
	default:
		return ""
	}
}

// NationalsRoundUsesDraft reports whether Swiss round n is booster draft (young heroes).
func NationalsRoundUsesDraft(round int) bool {
	if round <= domain.NationalsCCMaxRound {
		return false
	}
	if round <= domain.NationalsDraftDay1MaxRound {
		return true
	}
	if round >= domain.NationalsCCDay2FromRound {
		return false
	}
	return round <= domain.NationalsDraftDay2MaxRound
}

// NationalsMetaSharePairingsRound returns which round's pairings seed the field meta share.
func NationalsMetaSharePairingsRound(fromRound int, phase MetaSharePhase) int {
	switch phase {
	case MetaSharePhaseCC:
		if fromRound >= domain.NationalsCCDay2FromRound {
			return domain.NationalsMetaShareCCDay2Pairings
		}
		return domain.NationalsMetaShareCCPairings
	case MetaSharePhaseDraft:
		if fromRound >= domain.NationalsDraftDay2FromRound {
			return domain.NationalsMetaShareDraftDay2Pairings
		}
		return domain.NationalsMetaShareDraftDay1Pairings
	default:
		if fromRound >= domain.NationalsCCDay2FromRound {
			return domain.NationalsMetaShareCCDay2Pairings
		}
		if fromRound >= domain.NationalsDraftDay2FromRound {
			return domain.NationalsMetaShareDraftDay2Pairings
		}
		return domain.NationalsMetaShareCCPairings
	}
}

// NationalsHeroFormatForRound picks adult heroes for CC Swiss and young heroes for draft Swiss.
func NationalsHeroFormatForRound(round int) *int16 {
	cc := int16(domain.CardFormatClassicConstruction)
	limited := int16(domain.CardFormatLimited)
	if NationalsRoundUsesDraft(round) {
		return &limited
	}
	return &cc
}

// MetaShareHeroFormat returns the hero pool for Nationals field meta share.
func MetaShareHeroFormat(phase MetaSharePhase, fromRound int) *int16 {
	switch phase {
	case MetaSharePhaseCC:
		if fromRound >= domain.NationalsCCDay2FromRound {
			return NationalsHeroFormatForRound(domain.NationalsCCDay2FromRound)
		}
		return NationalsHeroFormatForRound(domain.NationalsMetaShareCCPairings)
	case MetaSharePhaseDraft:
		if fromRound >= domain.NationalsDraftDay2FromRound {
			return NationalsHeroFormatForRound(domain.NationalsDraftDay2FromRound)
		}
		return NationalsHeroFormatForRound(domain.NationalsDraftDay1FromRound)
	default:
		return NationalsHeroFormatForRound(domain.NationalsMetaShareCCPairings)
	}
}
