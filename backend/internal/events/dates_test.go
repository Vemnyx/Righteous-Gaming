package events

import (
	"testing"
	"time"

	"righteous-gaming/backend/internal/domain"
)

func TestParseDateRange(t *testing.T) {
	start, end, ok := ParseDateRange("May 9-11, 2026")
	if !ok {
		t.Fatal("expected ok")
	}
	if start.Year() != 2026 || start.Month() != time.May || start.Day() != 9 {
		t.Fatalf("start: %v", start)
	}
	if end.Day() != 11 {
		t.Fatalf("end: %v", end)
	}
}

func TestEventDataDateRangeCalling(t *testing.T) {
	start, end, ok := ParseDateRange("May 9-11, 2026")
	if !ok {
		t.Fatal("parse")
	}
	ds, de := EventDataDateRange(start, end, domain.EventTypeCalling.DurationDays())
	if ds.Day() != 10 || de.Day() != 11 {
		t.Fatalf("calling range %v - %v", ds, de)
	}
}
