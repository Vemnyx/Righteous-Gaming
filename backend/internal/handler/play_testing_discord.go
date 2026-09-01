package handler

import (
	"context"
	"fmt"
	"strings"
	"time"

	"righteous-gaming/backend/internal/client"
	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

func ownerDisplayName(s *repository.PlayTestingSession) string {
	if s == nil {
		return "Unknown"
	}
	first := ""
	if s.OwnerFirstName != nil {
		first = strings.TrimSpace(*s.OwnerFirstName)
	}
	user := ""
	if s.OwnerUsername != nil {
		user = strings.TrimSpace(*s.OwnerUsername)
	}
	switch {
	case first != "" && user != "":
		return first + " · " + user
	case first != "":
		return first
	case user != "":
		return user
	default:
		return fmt.Sprintf("User %d", s.UserID)
	}
}

func heroNamesForSide(heroes []repository.PlayTestingSessionHero, side int16) string {
	names := make([]string, 0, len(heroes))
	for _, h := range heroes {
		if h.Side != side {
			continue
		}
		name := strings.TrimSpace(h.Name)
		if name == "" {
			continue
		}
		names = append(names, name)
	}
	if len(names) == 0 {
		return "Any"
	}
	return strings.Join(names, ", ")
}

func discordTimestamp(t time.Time) string {
	return fmt.Sprintf("<t:%d:f>", t.UTC().Unix())
}

func formatSessionWhenForDiscord(s *repository.PlayTestingSession) string {
	if s == nil {
		return "Now"
	}
	if len(s.Timeframes) == 0 {
		return "Now"
	}
	parts := make([]string, 0, len(s.Timeframes))
	for _, tf := range s.Timeframes {
		start := discordTimestamp(tf.StartsAt)
		if tf.EndsAt == nil {
			parts = append(parts, start)
			continue
		}
		parts = append(parts, start+" – "+discordTimestamp(*tf.EndsAt))
	}
	return strings.Join(parts, "\n")
}

func truncateDiscordField(value string, max int) string {
	value = strings.TrimSpace(value)
	if max <= 0 || len(value) <= max {
		return value
	}
	if max <= 1 {
		return "…"
	}
	return value[:max-1] + "…"
}

// notifyPlayTestingSessionCreated posts a Discord channel message for a new session.
// Failures are logged only — session create always succeeds independently.
func (h *playTestingHTTP) notifyPlayTestingSessionCreated(session *repository.PlayTestingSession) {
	if h == nil || h.app == nil || session == nil || !h.app.DiscordPlayTesting.Enabled() {
		return
	}
	channel := client.PlayTestingDiscordChannelForFormat(domain.CardFormat(session.Format))
	if channel == "" || !h.app.DiscordPlayTesting.HasChannel(channel) {
		log.Info(
			"discord play testing webhook skipped",
			"session_id", session.ID,
			"format", session.Format,
			"channel", channel,
		)
		return
	}
	go func(s repository.PlayTestingSession, channelKey string) {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()

		sessionURL := fmt.Sprintf("%s/team/play-testing/%d", client.PublicAppURL(), s.ID)
		formatName := domain.CardFormat(s.Format).String()
		fields := []client.DiscordEmbedField{
			{Name: "Format", Value: formatName, Inline: true},
			{Name: "When", Value: truncateDiscordField(formatSessionWhenForDiscord(&s), 1024), Inline: true},
			{Name: "Playing", Value: truncateDiscordField(heroNamesForSide(s.Heroes, repository.PlayTestingHeroSideWith), 1024), Inline: false},
			{Name: "Requesting", Value: truncateDiscordField(heroNamesForSide(s.Heroes, repository.PlayTestingHeroSideAgainst), 1024), Inline: false},
		}
		if note := strings.TrimSpace(s.Note); note != "" {
			fields = append(fields, client.DiscordEmbedField{
				Name:   "Note",
				Value:  truncateDiscordField(note, 1024),
				Inline: false,
			})
		}
		fields = append(fields, client.DiscordEmbedField{Name: "Open session", Value: sessionURL, Inline: false})
		embed := client.DiscordEmbed{
			Title:       "New Looking for Games session",
			Description: fmt.Sprintf("**%s** opened a play testing session.", ownerDisplayName(&s)),
			URL:         sessionURL,
			Color:       0x34d399, // emerald
			Timestamp:   time.Now().UTC().Format(time.RFC3339),
			Fields:      fields,
		}
		content := h.app.DiscordPlayTesting.LFGMention()
		if content == "" {
			content = "@LFG"
		}
		if err := h.app.DiscordPlayTesting.SendToChannel(ctx, channelKey, content, embed); err != nil {
			log.Error("discord play testing webhook", "session_id", s.ID, "channel", channelKey, "error", err)
		}
	}(*session, channel)
}
