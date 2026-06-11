package fabrary_test

import (
	"context"
	"testing"

	"righteous-gaming/backend/internal/fabrary"
)

func TestFetchDeckLive(t *testing.T) {
	if testing.Short() {
		t.Skip("network")
	}
	d, err := fabrary.FetchDeck(context.Background(), "01KJZY83F7HCDBG59CQRPCDRCK")
	if err != nil {
		t.Fatalf("FetchDeck: %v", err)
	}
	if d.Name == "" {
		t.Fatal("empty name")
	}
	t.Logf("deck: %s cards=%d", d.Name, len(d.Cards))
}
