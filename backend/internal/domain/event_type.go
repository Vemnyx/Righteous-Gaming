package domain

import "strings"

// EventType identifies a FabTCG coverage segment (Pro Tour, Calling, etc.).
type EventType int16

const (
	EventTypeProTour   EventType = 1
	EventTypeNationals EventType = 2
	EventTypeCalling   EventType = 3
	EventTypeShowdown  EventType = 4
)

var eventTypeNames = map[EventType]string{
	EventTypeProTour:   "Pro Tour",
	EventTypeNationals: "Nationals",
	EventTypeCalling:   "Calling",
	EventTypeShowdown:  "Showdown",
}

var eventTypeDays = map[EventType]int{
	EventTypeProTour:   3,
	EventTypeNationals: 3,
	EventTypeCalling:   2,
	EventTypeShowdown:  1,
}

// Valid reports whether t is a defined EventType constant.
func (t EventType) Valid() bool {
	_, ok := eventTypeNames[t]
	return ok
}

// String returns the display name for t.
func (t EventType) String() string {
	if name, ok := eventTypeNames[t]; ok {
		return name
	}
	return "EventType"
}

// DurationDays returns how many calendar days this event type spans.
func (t EventType) DurationDays() int {
	if d, ok := eventTypeDays[t]; ok {
		return d
	}
	return 1
}

// StreamTabLabels returns UI labels for stream URL inputs for this event type.
func (t EventType) StreamTabLabels() []string {
	switch t {
	case EventTypeProTour, EventTypeNationals:
		return []string{"Day 1", "Day 2", "Top 8"}
	case EventTypeCalling:
		return []string{"Day 1", "Day 2 + Top 8"}
	case EventTypeShowdown:
		return []string{"Day 1 + Top 8"}
	default:
		return []string{"Stream"}
	}
}

// EventTypeFromCoverageLabel maps a scraped FabTCG coverage card label to an event type.
func EventTypeFromCoverageLabel(label string) (EventType, bool) {
	s := strings.ToLower(strings.TrimSpace(label))
	switch {
	case strings.Contains(s, "pro tour"):
		return EventTypeProTour, true
	case strings.Contains(s, "nationals"):
		return EventTypeNationals, true
	case strings.Contains(s, "calling"):
		return EventTypeCalling, true
	case strings.Contains(s, "showdown"):
		return EventTypeShowdown, true
	default:
		return 0, false
	}
}
