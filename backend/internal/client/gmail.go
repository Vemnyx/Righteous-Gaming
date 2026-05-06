package client

import (
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/gmail/v1"
	"google.golang.org/api/option"

	"righteous-gaming/backend/internal/secrets"
)

// Gmail wraps Gmail API operations for a specific sender account.
type Gmail struct {
	svc    *gmail.Service
	sender string
}

// NewGmail creates a Gmail API client using OAuth refresh-token credentials.
//
// Reads from GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and sender
// GMAIL_SENDER_EMAIL (preferred) or legacy typo GMAIL_SENDERER_EMAIL.
//
// Each value may be plaintext or a full Secret Manager version resource name
// (projects/PROJECT_ID/secrets/SECRET_ID/versions/VERSION), fetched with ADC on GCE.
//
// Startup forces one OAuth refresh so bad credentials fail before serving traffic.
func NewGmail(ctx context.Context) (*Gmail, error) {
	resolve := func(raw string) (string, error) {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return "", nil
		}
		if secrets.IsGCPSecretVersionName(raw) {
			return secrets.AccessPayload(ctx, raw)
		}
		return raw, nil
	}

	clientID, err := resolve(os.Getenv("GMAIL_CLIENT_ID"))
	if err != nil {
		return nil, fmt.Errorf("gmail: GMAIL_CLIENT_ID: %w", err)
	}
	clientSecret, err := resolve(os.Getenv("GMAIL_CLIENT_SECRET"))
	if err != nil {
		return nil, fmt.Errorf("gmail: GMAIL_CLIENT_SECRET: %w", err)
	}
	refreshToken, err := resolve(os.Getenv("GMAIL_REFRESH_TOKEN"))
	if err != nil {
		return nil, fmt.Errorf("gmail: GMAIL_REFRESH_TOKEN: %w", err)
	}

	senderAddr := strings.TrimSpace(os.Getenv("GMAIL_SENDER_EMAIL"))
	if senderAddr == "" {
		senderAddr = strings.TrimSpace(os.Getenv("GMAIL_SENDERER_EMAIL"))
	}
	sender, err := resolve(senderAddr)
	if err != nil {
		return nil, fmt.Errorf("gmail: sender: %w", err)
	}

	if clientID == "" || clientSecret == "" || refreshToken == "" || sender == "" {
		return nil, fmt.Errorf(`gmail: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL (or GMAIL_SENDERER_EMAIL)`)
	}

	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		Scopes:       []string{gmail.GmailSendScope},
	}
	ts := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
	if _, err := ts.Token(); err != nil {
		return nil, fmt.Errorf("gmail: oauth token refresh: %w", err)
	}

	svc, err := gmail.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("gmail: new service: %w", err)
	}

	return &Gmail{svc: svc, sender: sender}, nil
}

// SendEmail sends a plain-text email from the configured Gmail sender
// (GMAIL_SENDER_EMAIL / GMAIL_SENDERER_EMAIL after optional Secret Manager lookup).
func (g *Gmail) SendEmail(ctx context.Context, to, subject, body string) error {
	to = strings.TrimSpace(to)
	if to == "" {
		return fmt.Errorf("gmail: recipient is required")
	}
	subject = strings.TrimSpace(subject)

	raw := strings.Join([]string{
		fmt.Sprintf("From: %s", g.sender),
		fmt.Sprintf("To: %s", to),
		fmt.Sprintf("Subject: %s", subject),
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")

	encoded := base64.RawURLEncoding.EncodeToString([]byte(raw))
	_, err := g.svc.Users.Messages.Send("me", &gmail.Message{Raw: encoded}).Context(ctx).Do()
	if err != nil {
		return fmt.Errorf("gmail: send message: %w", err)
	}
	return nil
}
