package events

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	reMonthRange = regexp.MustCompile(`(?i)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(\d{4})`)
	reMonthSingle = regexp.MustCompile(`(?i)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s*(\d{4})`)
)

var monthIndex = map[string]time.Month{
	"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
	"july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

// ParseDateRange parses FabTCG event date text into UTC day boundaries.
// Start is 00:00:00 UTC on the first day; end is 23:59:59.999999999 UTC on the last day.
func ParseDateRange(dateText string) (start, end time.Time, ok bool) {
	text := strings.TrimSpace(dateText)
	if text == "" {
		return time.Time{}, time.Time{}, false
	}
	if m := reMonthRange.FindStringSubmatch(text); len(m) >= 5 {
		month := monthIndex[strings.ToLower(m[1])]
		day1, _ := strconv.Atoi(m[2])
		day2, _ := strconv.Atoi(m[3])
		year, _ := strconv.Atoi(m[4])
		if month == 0 || day1 <= 0 || day2 <= 0 || year <= 0 {
			return time.Time{}, time.Time{}, false
		}
		start = time.Date(year, month, day1, 0, 0, 0, 0, time.UTC)
		end = time.Date(year, month, day2, 23, 59, 59, 999999999, time.UTC)
		return start, end, true
	}
	if m := reMonthSingle.FindStringSubmatch(text); len(m) >= 4 {
		month := monthIndex[strings.ToLower(m[1])]
		day, _ := strconv.Atoi(m[2])
		year, _ := strconv.Atoi(m[3])
		if month == 0 || day <= 0 || year <= 0 {
			return time.Time{}, time.Time{}, false
		}
		start = time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
		end = time.Date(year, month, day, 23, 59, 59, 999999999, time.UTC)
		return start, end, true
	}
	return time.Time{}, time.Time{}, false
}

// ParentSpanDays returns inclusive calendar days between parent start and end.
func ParentSpanDays(parentStart, parentEnd time.Time) int {
	if parentEnd.Before(parentStart) {
		return 1
	}
	s := parentStart.UTC()
	e := parentEnd.UTC()
	days := int(e.Sub(s).Hours()/24) + 1
	if days < 1 {
		return 1
	}
	return days
}

// EventDataDateRange computes event_data bounds from parent event dates and type duration.
// Shorter event types align to the end of the parent window (drop days from the front).
func EventDataDateRange(parentStart, parentEnd time.Time, typeDays int) (start, end time.Time) {
	parentDays := ParentSpanDays(parentStart, parentEnd)
	offset := parentDays - typeDays
	if offset < 0 {
		offset = 0
	}
	startDay := parentStart.UTC().AddDate(0, 0, offset)
	start = time.Date(startDay.Year(), startDay.Month(), startDay.Day(), 0, 0, 0, 0, time.UTC)
	end = parentEnd.UTC()
	return start, end
}

// EmptyStreamURLs returns a JSON-ready slice of empty strings for stream URL tabs.
func EmptyStreamURLs(tabCount int) []string {
	out := make([]string, tabCount)
	return out
}
