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
	"righteous-gaming/backend/log"
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
// Startup runs shape checks on id/secret/token, then forces one OAuth refresh;
// Google does not expose a separate “ping” for id/secret without the token exchange.
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

	if err := validateOAuthCredentialShapes(clientID, clientSecret, refreshToken); err != nil {
		return nil, err
	}

	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		Scopes:       []string{gmail.GmailSendScope},
	}
	ts := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
	log.Info("gmail oauth performing startup token refresh", "sender", sender)
	if _, err := ts.Token(); err != nil {
		log.Error("gmail oauth startup token refresh failed", "sender", sender, "error", err)
		return nil, fmt.Errorf("gmail: oauth token refresh: %w", err)
	}
	log.Info("gmail oauth startup token refresh ok", "sender", sender)

	svc, err := gmail.NewService(ctx, option.WithTokenSource(ts))
	if err != nil {
		return nil, fmt.Errorf("gmail: new service: %w", err)
	}

	return &Gmail{svc: svc, sender: sender}, nil
}

// validateOAuthCredentialShapes catches common misconfiguration before calling Google’s
// token endpoint. It does not prove credentials are correct; ts.Token() does.
func validateOAuthCredentialShapes(clientID, clientSecret, refreshToken string) error {
	const suffix = ".apps.googleusercontent.com"
	if !strings.HasSuffix(clientID, suffix) {
		return fmt.Errorf("gmail: GMAIL_CLIENT_ID should be a Web or Desktop OAuth client id ending in %q", suffix)
	}
	base := strings.TrimSuffix(clientID, suffix)
	if base == "" || !strings.Contains(base, "-") {
		return fmt.Errorf("gmail: GMAIL_CLIENT_ID should look like NUMBER-RANDOM.apps.googleusercontent.com")
	}
	for _, label := range []struct {
		name, v string
	}{
		{"GMAIL_CLIENT_ID", clientID},
		{"GMAIL_CLIENT_SECRET", clientSecret},
		{"GMAIL_REFRESH_TOKEN", refreshToken},
	} {
		if strings.TrimSpace(label.v) != label.v {
			return fmt.Errorf("gmail: %s has leading or trailing whitespace", label.name)
		}
		if strings.ContainsAny(label.v, "\n\r\t") {
			return fmt.Errorf("gmail: %s contains disallowed whitespace", label.name)
		}
	}
	const minSecret = 16
	if len(clientSecret) < minSecret {
		return fmt.Errorf("gmail: GMAIL_CLIENT_SECRET looks too short (expected at least %d characters; check Secret Manager payload)", minSecret)
	}
	const minRefresh = 20
	if len(refreshToken) < minRefresh {
		return fmt.Errorf("gmail: GMAIL_REFRESH_TOKEN looks too short (expected at least %d characters)", minRefresh)
	}
	return nil
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
