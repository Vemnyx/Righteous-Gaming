package eventmeta

import "testing"

func TestNationalsRoundUsesDraft(t *testing.T) {
	cases := []struct {
		round int
		want  bool
	}{
		{1, false},
		{5, false},
		{6, true},
		{8, true},
		{9, true},
		{11, true},
		{12, false},
		{15, false},
	}
	for _, tc := range cases {
		if got := NationalsRoundUsesDraft(tc.round); got != tc.want {
			t.Fatalf("NationalsRoundUsesDraft(%d) = %v, want %v", tc.round, got, tc.want)
		}
	}
}

func TestNationalsMetaSharePairingsRoundDay2(t *testing.T) {
	if got := NationalsMetaSharePairingsRound(9, MetaSharePhaseDraft); got != 9 {
		t.Fatalf("day2 draft pairings round = %d, want 9", got)
	}
	if got := NationalsMetaSharePairingsRound(12, MetaSharePhaseCC); got != 12 {
		t.Fatalf("day2 cc pairings round = %d, want 12", got)
	}
}
