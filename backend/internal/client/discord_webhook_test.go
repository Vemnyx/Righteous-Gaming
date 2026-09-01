package client

import (
	"testing"

	"righteous-gaming/backend/internal/domain"
)

func TestPlayTestingDiscordChannelForFormat(t *testing.T) {
	cases := []struct {
		format domain.CardFormat
		want   string
	}{
		{domain.CardFormatLimited, PlayTestingDiscordLimited},
		{domain.CardFormatSilverAge, PlayTestingDiscordSilverAge},
		{domain.CardFormatClassicConstruction, PlayTestingDiscordClassicConstructed},
		{domain.CardFormatGoldenAge, PlayTestingDiscordLivingLegendGoldenAge},
		{domain.CardFormatLivingLegend, PlayTestingDiscordLivingLegendGoldenAge},
		{domain.CardFormat(99), ""},
	}
	for _, tc := range cases {
		got := PlayTestingDiscordChannelForFormat(tc.format)
		if got != tc.want {
			t.Fatalf("format %v: got %q want %q", tc.format, got, tc.want)
		}
	}
}

func TestParsePlayTestingDiscordConfig(t *testing.T) {
	got, err := parsePlayTestingDiscordConfig(`{
		"limited": "https://discord.com/api/webhooks/1/a",
		"SILVER_AGE": "https://discord.com/api/webhooks/2/b",
		"classic_constructed": "",
		"lfg_role_id": "999888777",
		"": "https://ignored"
	}`)
	if err != nil {
		t.Fatal(err)
	}
	if got.URLs[PlayTestingDiscordLimited] != "https://discord.com/api/webhooks/1/a" {
		t.Fatalf("limited: %#v", got.URLs[PlayTestingDiscordLimited])
	}
	if got.URLs[PlayTestingDiscordSilverAge] != "https://discord.com/api/webhooks/2/b" {
		t.Fatalf("silver: %#v", got.URLs[PlayTestingDiscordSilverAge])
	}
	if _, ok := got.URLs[PlayTestingDiscordClassicConstructed]; ok {
		t.Fatal("empty classic url should be omitted")
	}
	if got.LFGRoleID != "999888777" {
		t.Fatalf("lfg role: %#v", got.LFGRoleID)
	}
}
