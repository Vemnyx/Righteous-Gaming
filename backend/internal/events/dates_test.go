package events

import (
	"testing"
	"time"

	"righteous-gaming/backend/internal/domain"
)

func TestParseDateRangeYokohama(t *testing.T) {
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

func TestParseDateRangeMemphisCrossMonth(t *testing.T) {
	cases := []string{
		"January 31 – February 2nd, 2025",
		"January 31 - February 2, 2025",
		"January 31-February 2, 2025",
	}
	for _, c := range cases {
		start, end, ok := ParseDateRange(c)
		if !ok {
			t.Fatalf("expected ok for %q", c)
		}
		if start.Month() != time.January || start.Day() != 31 || start.Year() != 2025 {
			t.Fatalf("start for %q: %v", c, start)
		}
		if end.Month() != time.February || end.Day() != 2 || end.Year() != 2025 {
			t.Fatalf("end for %q: %v", c, end)
		}
	}
}

func TestParseDateRangeMemphisSameMonth(t *testing.T) {
	start, end, ok := ParseDateRange("February 1-2, 2025")
	if !ok {
		t.Fatal("expected ok")
	}
	if start.Day() != 1 || end.Day() != 2 || start.Month() != time.February {
		t.Fatalf("range: %v - %v", start, end)
	}
}

func TestParseDateRangeSingleDay(t *testing.T) {
	start, end, ok := ParseDateRange("February 2, 2025")
	if !ok {
		t.Fatal("expected ok")
	}
	if start.Day() != 2 || end.Day() != 2 {
		t.Fatalf("day: %v - %v", start, end)
	}
}

func TestParseDateRangeStripsVenueSuffix(t *testing.T) {
	start, end, ok := ParseDateRange("January 31 – February 2nd, 2025Venue: Renasant Convention Center")
	if !ok {
		t.Fatal("expected ok")
	}
	if start.Day() != 31 || end.Day() != 2 {
		t.Fatalf("range: %v - %v", start, end)
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

func TestEventDataDateRangeMemphisCalling(t *testing.T) {
	start, end, ok := ParseDateRange("January 31 – February 2nd, 2025")
	if !ok {
		t.Fatal("parse")
	}
	ds, de := EventDataDateRange(start, end, domain.EventTypeCalling.DurationDays())
	if ds.Month() != time.February || ds.Day() != 1 {
		t.Fatalf("calling start: %v", ds)
	}
	if de.Day() != 2 || de.Month() != time.February {
		t.Fatalf("calling end: %v", de)
	}
}
