package repository_test

import (
	"testing"
	"time"

	"righteous-gaming/backend/internal/repository"
)

func TestClassifyPlayTestingSession(t *testing.T) {
	now := time.Date(2026, 8, 31, 18, 0, 0, 0, time.UTC)

	t.Run("closed is past", func(t *testing.T) {
		s := &repository.PlayTestingSession{
			Status:    repository.PlayTestingSessionStatusClosed,
			CreatedAt: now.Add(-time.Hour),
		}
		if got := repository.ClassifyPlayTestingSession(s, now); got != repository.PlayTestingBucketPast {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("no timeframes current within 24h", func(t *testing.T) {
		s := &repository.PlayTestingSession{
			Status:    repository.PlayTestingSessionStatusOpen,
			CreatedAt: now.Add(-2 * time.Hour),
		}
		if got := repository.ClassifyPlayTestingSession(s, now); got != repository.PlayTestingBucketCurrent {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("no timeframes past after 24h", func(t *testing.T) {
		s := &repository.PlayTestingSession{
			Status:    repository.PlayTestingSessionStatusOpen,
			CreatedAt: now.Add(-25 * time.Hour),
		}
		if got := repository.ClassifyPlayTestingSession(s, now); got != repository.PlayTestingBucketPast {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("future range is upcoming", func(t *testing.T) {
		start := now.Add(2 * time.Hour)
		end := now.Add(4 * time.Hour)
		s := &repository.PlayTestingSession{
			Status:    repository.PlayTestingSessionStatusOpen,
			CreatedAt: now.Add(-time.Hour),
			Timeframes: []repository.PlayTestingSessionTimeframe{
				{StartsAt: start, EndsAt: &end},
			},
		}
		if got := repository.ClassifyPlayTestingSession(s, now); got != repository.PlayTestingBucketUpcoming {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("active range is current", func(t *testing.T) {
		start := now.Add(-time.Hour)
		end := now.Add(time.Hour)
		s := &repository.PlayTestingSession{
			Status:    repository.PlayTestingSessionStatusOpen,
			CreatedAt: now.Add(-2 * time.Hour),
			Timeframes: []repository.PlayTestingSessionTimeframe{
				{StartsAt: start, EndsAt: &end},
			},
		}
		if got := repository.ClassifyPlayTestingSession(s, now); got != repository.PlayTestingBucketCurrent {
			t.Fatalf("got %q", got)
		}
	})

	t.Run("open-ended expires after 24h from start", func(t *testing.T) {
		s := &repository.PlayTestingSession{
			Status:    repository.PlayTestingSessionStatusOpen,
			CreatedAt: now.Add(-30 * time.Hour),
			Timeframes: []repository.PlayTestingSessionTimeframe{
				{StartsAt: now.Add(-25 * time.Hour), EndsAt: nil},
			},
		}
		if got := repository.ClassifyPlayTestingSession(s, now); got != repository.PlayTestingBucketPast {
			t.Fatalf("got %q", got)
		}
	})
}
