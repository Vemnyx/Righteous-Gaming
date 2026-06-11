package events

import (
	"regexp"
	"strconv"
	"strings"
	"time"
)

const monthPat = `January|February|March|April|May|June|July|August|September|October|November|December`

var (
	// Cross-month: January 31 – February 2nd, 2025
	reMonthCross = regexp.MustCompile(`(?i)(` + monthPat + `)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–—]\s*(` + monthPat + `)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})`)
	// Same month: May 9-11, 2026 or February 1-2, 2025
	reMonthRange = regexp.MustCompile(`(?i)(` + monthPat + `)\s+(\d{1,2})(?:st|nd|rd|th)?\s*[-–—]\s*(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})`)
	// Single day: February 2, 2025
	reMonthSingle = regexp.MustCompile(`(?i)(` + monthPat + `)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})`)
)

var monthIndex = map[string]time.Month{
	"january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
	"july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
}

func sanitizeDateText(s string) string {
	s = strings.TrimSpace(s)
	if i := strings.Index(strings.ToLower(s), "venue:"); i > 0 {
		s = strings.TrimSpace(s[:i])
	}
	s = strings.ReplaceAll(s, "–", "-")
	s = strings.ReplaceAll(s, "—", "-")
	return strings.TrimSpace(s)
}

func dayEndUTC(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 23, 59, 59, 999999999, time.UTC)
}

func dayStartUTC(year int, month time.Month, day int) time.Time {
	return time.Date(year, month, day, 0, 0, 0, 0, time.UTC)
}

func parseMonth(name string) time.Month {
	return monthIndex[strings.ToLower(strings.TrimSpace(name))]
}

// ParseDateRange parses FabTCG event date text into UTC day boundaries.
// Start is 00:00:00 UTC on the first day; end is 23:59:59.999999999 UTC on the last day.
func ParseDateRange(dateText string) (start, end time.Time, ok bool) {
	text := sanitizeDateText(dateText)
	if text == "" {
		return time.Time{}, time.Time{}, false
	}
	if m := reMonthCross.FindStringSubmatch(text); len(m) >= 6 {
		m1 := parseMonth(m[1])
		d1, _ := strconv.Atoi(m[2])
		m2 := parseMonth(m[3])
		d2, _ := strconv.Atoi(m[4])
		year, _ := strconv.Atoi(m[5])
		if m1 == 0 || m2 == 0 || d1 <= 0 || d2 <= 0 || year <= 0 {
			return time.Time{}, time.Time{}, false
		}
		return dayStartUTC(year, m1, d1), dayEndUTC(year, m2, d2), true
	}
	if m := reMonthRange.FindStringSubmatch(text); len(m) >= 5 {
		month := parseMonth(m[1])
		day1, _ := strconv.Atoi(m[2])
		day2, _ := strconv.Atoi(m[3])
		year, _ := strconv.Atoi(m[4])
		if month == 0 || day1 <= 0 || day2 <= 0 || year <= 0 {
			return time.Time{}, time.Time{}, false
		}
		return dayStartUTC(year, month, day1), dayEndUTC(year, month, day2), true
	}
	if m := reMonthSingle.FindStringSubmatch(text); len(m) >= 4 {
		month := parseMonth(m[1])
		day, _ := strconv.Atoi(m[2])
		year, _ := strconv.Atoi(m[3])
		if month == 0 || day <= 0 || year <= 0 {
			return time.Time{}, time.Time{}, false
		}
		return dayStartUTC(year, month, day), dayEndUTC(year, month, day), true
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
