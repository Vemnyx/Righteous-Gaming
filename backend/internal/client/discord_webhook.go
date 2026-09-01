package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"righteous-gaming/backend/internal/domain"
	"righteous-gaming/backend/internal/secrets"
)

const discordWebhookTimeout = 8 * time.Second

// Play-testing Discord channel keys (match Secret Manager JSON / env vars).
const (
	PlayTestingDiscordLimited                = "limited"
	PlayTestingDiscordSilverAge              = "silver_age"
	PlayTestingDiscordClassicConstructed     = "classic_constructed"
	PlayTestingDiscordLivingLegendGoldenAge  = "living_legend_golden_age"
)

// DiscordWebhook posts messages to a Discord incoming webhook URL.
type DiscordWebhook struct {
	url    string
	client *http.Client
}

// PlayTestingDiscord routes Looking for Games notifications by format channel.
type PlayTestingDiscord struct {
	client *http.Client
	urls   map[string]string
}

// DiscordEmbed is a Discord webhook embed payload.
type DiscordEmbed struct {
	Title       string              `json:"title,omitempty"`
	Description string              `json:"description,omitempty"`
	URL         string              `json:"url,omitempty"`
	Color       int                 `json:"color,omitempty"`
	Fields      []DiscordEmbedField `json:"fields,omitempty"`
	Timestamp   string              `json:"timestamp,omitempty"`
}

// DiscordEmbedField is one embed field.
type DiscordEmbedField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline,omitempty"`
}

type discordWebhookBody struct {
	Content string         `json:"content,omitempty"`
	Embeds  []DiscordEmbed `json:"embeds,omitempty"`
}

// PlayTestingDiscordChannelForFormat maps a card format to a webhook channel key.
func PlayTestingDiscordChannelForFormat(format domain.CardFormat) string {
	switch format {
	case domain.CardFormatLimited:
		return PlayTestingDiscordLimited
	case domain.CardFormatSilverAge:
		return PlayTestingDiscordSilverAge
	case domain.CardFormatClassicConstruction:
		return PlayTestingDiscordClassicConstructed
	case domain.CardFormatGoldenAge, domain.CardFormatLivingLegend:
		return PlayTestingDiscordLivingLegendGoldenAge
	default:
		return ""
	}
}

// NewDiscordPlayTestingWebhook loads per-format webhook URLs.
// Sources (first match wins):
//  1. DISCORD_PLAY_TESTING_WEBHOOKS_JSON — JSON object of channel key → URL
//  2. DISCORD_PLAY_TESTING_WEBHOOKS_SECRET — Secret Manager payload (same JSON)
//  3. Per-channel env vars DISCORD_PLAY_TESTING_WEBHOOK_<CHANNEL>
// Missing config returns an empty (disabled) router with nil error.
func NewDiscordPlayTestingWebhook(ctx context.Context) (*PlayTestingDiscord, error) {
	urls, err := resolvePlayTestingDiscordURLs(ctx)
	if err != nil {
		return nil, err
	}
	return &PlayTestingDiscord{
		client: &http.Client{Timeout: discordWebhookTimeout},
		urls:   urls,
	}, nil
}

func resolvePlayTestingDiscordURLs(ctx context.Context) (map[string]string, error) {
	if raw := strings.TrimSpace(os.Getenv("DISCORD_PLAY_TESTING_WEBHOOKS_JSON")); raw != "" {
		return parsePlayTestingDiscordURLMap(raw)
	}
	if ref := strings.TrimSpace(os.Getenv("DISCORD_PLAY_TESTING_WEBHOOKS_SECRET")); ref != "" {
		if !secrets.IsGCPSecretVersionName(ref) {
			return nil, fmt.Errorf("discord webhook: DISCORD_PLAY_TESTING_WEBHOOKS_SECRET must be a Secret Manager version name")
		}
		payload, err := secrets.AccessPayload(ctx, ref)
		if err != nil {
			return nil, err
		}
		return parsePlayTestingDiscordURLMap(payload)
	}

	out := map[string]string{}
	for _, key := range playTestingDiscordChannelKeys() {
		envKey := "DISCORD_PLAY_TESTING_WEBHOOK_" + strings.ToUpper(key)
		if u := strings.TrimSpace(os.Getenv(envKey)); u != "" {
			out[key] = u
		}
	}
	return out, nil
}

func playTestingDiscordChannelKeys() []string {
	return []string{
		PlayTestingDiscordLimited,
		PlayTestingDiscordSilverAge,
		PlayTestingDiscordClassicConstructed,
		PlayTestingDiscordLivingLegendGoldenAge,
	}
}

func parsePlayTestingDiscordURLMap(raw string) (map[string]string, error) {
	var parsed map[string]string
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return nil, fmt.Errorf("discord webhook: invalid JSON map: %w", err)
	}
	out := make(map[string]string, len(parsed))
	for k, v := range parsed {
		key := strings.TrimSpace(strings.ToLower(k))
		url := strings.TrimSpace(v)
		if key == "" || url == "" {
			continue
		}
		out[key] = url
	}
	return out, nil
}

// Enabled reports whether any format webhook is configured.
func (d *PlayTestingDiscord) Enabled() bool {
	return d != nil && len(d.urls) > 0
}

// HasChannel reports whether a specific channel key has a webhook URL.
func (d *PlayTestingDiscord) HasChannel(channel string) bool {
	if d == nil {
		return false
	}
	return strings.TrimSpace(d.urls[strings.TrimSpace(strings.ToLower(channel))]) != ""
}

// ConfiguredChannels returns configured channel keys (stable order).
func (d *PlayTestingDiscord) ConfiguredChannels() []string {
	if d == nil {
		return nil
	}
	out := make([]string, 0, len(d.urls))
	for _, key := range playTestingDiscordChannelKeys() {
		if strings.TrimSpace(d.urls[key]) != "" {
			out = append(out, key)
		}
	}
	return out
}

// SendToChannel posts to the webhook for channel. No-op when that channel is unset.
func (d *PlayTestingDiscord) SendToChannel(ctx context.Context, channel, content string, embeds ...DiscordEmbed) error {
	if d == nil {
		return nil
	}
	url := strings.TrimSpace(d.urls[strings.TrimSpace(strings.ToLower(channel))])
	if url == "" {
		return nil
	}
	wh := &DiscordWebhook{url: url, client: d.client}
	return wh.Send(ctx, content, embeds...)
}

// Send posts content and/or embeds to the webhook. No-op when disabled.
func (d *DiscordWebhook) Send(ctx context.Context, content string, embeds ...DiscordEmbed) error {
	if d == nil || strings.TrimSpace(d.url) == "" {
		return nil
	}
	payload := discordWebhookBody{
		Content: strings.TrimSpace(content),
		Embeds:  embeds,
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("discord webhook: marshal: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, d.url, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("discord webhook: request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	res, err := d.client.Do(req)
	if err != nil {
		return fmt.Errorf("discord webhook: post: %w", err)
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("discord webhook: status %d: %s", res.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}

// PublicAppURL returns the site origin used in notification links.
func PublicAppURL() string {
	if u := strings.TrimSpace(os.Getenv("PUBLIC_APP_URL")); u != "" {
		return strings.TrimRight(u, "/")
	}
	return "https://righteousgaming.team"
}
