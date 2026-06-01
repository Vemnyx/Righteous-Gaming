package fabrary

import "testing"

func TestIsLimitedFamilyFormatLabel(t *testing.T) {
	for _, label := range []string{"Limited", "Draft", "Sealed"} {
		if !IsLimitedFamilyFormatLabel(label) {
			t.Errorf("IsLimitedFamilyFormatLabel(%q) = false, want true", label)
		}
	}
	if IsLimitedFamilyFormatLabel("Classic Constructed") {
		t.Error("Classic Constructed should not be limited family")
	}
}
