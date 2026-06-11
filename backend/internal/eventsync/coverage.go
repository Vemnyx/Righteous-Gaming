package eventsync

import (
	"context"
	"time"

	"righteous-gaming/backend/internal/domain"
	evt "righteous-gaming/backend/internal/events"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/internal/scrape"
)

// CreateMissingEventData adds event_data rows for coverage links not yet stored on the event.
func CreateMissingEventData(
	ctx context.Context,
	repo *repository.Repository,
	e repository.Event,
	parsed scrape.EventPageData,
) ([]repository.EventData, error) {
	existing, err := repo.ListEventDataByEventID(ctx, e.ID)
	if err != nil {
		return nil, err
	}
	haveSlug := map[string]struct{}{}
	for _, ed := range existing {
		if ed.CoverageSlug != "" {
			haveSlug[ed.CoverageSlug] = struct{}{}
		}
	}

	eventFormat := evt.ParseCardFormat(parsed.FormatText)
	var created []repository.EventData
	for _, link := range parsed.CoverageLinks {
		if _, ok := haveSlug[link.Slug]; ok {
			continue
		}
		et, ok := domain.EventTypeFromCoverageLabel(link.Label)
		if !ok {
			continue
		}
		var label *string
		if link.Label != "" {
			label = &link.Label
		}
		edStart, edEnd := eventDataDateRange(e, et)
		tabs := et.StreamTabLabels()
		ed, err := repo.CreateEventData(ctx, repository.CreateEventDataParams{
			EventID: e.ID, EventType: int16(et), StartDate: edStart, EndDate: edEnd,
			CoverageSlug: link.Slug, CoverageURL: link.URL, Label: label, Format: eventFormat,
			StreamURLs: evt.EmptyStreamURLs(len(tabs)),
		})
		if err != nil {
			return created, err
		}
		created = append(created, ed)
		haveSlug[link.Slug] = struct{}{}
	}
	return created, nil
}

// DiscoverEventCoverage re-fetches the FabTCG event page and creates any new event_data rows.
func DiscoverEventCoverage(
	ctx context.Context,
	repo *repository.Repository,
	client *scrape.Client,
	e repository.Event,
) ([]repository.EventData, error) {
	parsed, err := client.FetchEventPageData(ctx, e.EventURL)
	if err != nil {
		return nil, err
	}
	if len(parsed.CoverageLinks) == 0 {
		return nil, nil
	}
	return CreateMissingEventData(ctx, repo, e, parsed)
}

func eventDataDateRange(e repository.Event, et domain.EventType) (time.Time, time.Time) {
	if e.StartDate != nil && e.EndDate != nil {
		return evt.EventDataDateRange(*e.StartDate, *e.EndDate, et.DurationDays())
	}
	now := time.Now().UTC()
	ps := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	peDay := ps.AddDate(0, 0, et.DurationDays()-1)
	pe := time.Date(peDay.Year(), peDay.Month(), peDay.Day(), 23, 59, 59, 999999999, time.UTC)
	return evt.EventDataDateRange(ps, pe, et.DurationDays())
}
