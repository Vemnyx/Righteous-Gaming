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
)

// Gmail wraps Gmail API operations for a specific sender account.
type Gmail struct {
	svc    *gmail.Service
	sender string
}

// NewGmail creates a Gmail API client using OAuth refresh-token credentials.
//
// Required env vars:
//   - GMAIL_CLIENT_ID
//   - GMAIL_CLIENT_SECRET
//   - GMAIL_REFRESH_TOKEN
//   - GMAIL_SENDER_EMAIL
func NewGmail(ctx context.Context) (*Gmail, error) {
	clientID := strings.TrimSpace(os.Getenv("GMAIL_CLIENT_ID"))
	clientSecret := strings.TrimSpace(os.Getenv("GMAIL_CLIENT_SECRET"))
	refreshToken := strings.TrimSpace(os.Getenv("GMAIL_REFRESH_TOKEN"))
	sender := strings.TrimSpace(os.Getenv("GMAIL_SENDER_EMAIL"))
	if clientID == "" || clientSecret == "" || refreshToken == "" || sender == "" {
		return nil, fmt.Errorf("gmail: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN, and GMAIL_SENDER_EMAIL")
	}

	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		Scopes:       []string{gmail.GmailSendScope},
	}
	ts := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})

	svc, err := gmail.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("gmail: new service: %w", err)
	}

	return &Gmail{svc: svc, sender: sender}, nil
}

// SendEmail sends a plain-text email from the configured Gmail sender.
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
