// Command gmail-oauth-check loads a downloaded Google OAuth client_secret JSON file
// and verifies GMAIL_REFRESH_TOKEN exchanges for an access token (same logic as prod).
//
// Usage:
//
//	export GMAIL_REFRESH_TOKEN="..."
//	go run ./cmd/gmail-oauth-check -client-json /path/to/client_secret_*.json
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"strings"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
	"google.golang.org/api/gmail/v1"
)

type clientSecretFile struct {
	Web struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	} `json:"web"`
	Installed struct {
		ClientID     string `json:"client_id"`
		ClientSecret string `json:"client_secret"`
	} `json:"installed"`
}

func main() {
	clientPath := flag.String("client-json", "", "path to client_secret *.json from Google Cloud Console")
	flag.Parse()
	if strings.TrimSpace(*clientPath) == "" {
		fmt.Fprintln(os.Stderr, "error: set -client-json to your downloaded OAuth client JSON file")
		os.Exit(2)
	}
	refreshToken := strings.TrimSpace(os.Getenv("GMAIL_REFRESH_TOKEN"))
	if refreshToken == "" {
		fmt.Fprintln(os.Stderr, "error: export GMAIL_REFRESH_TOKEN (offline refresh token for the same OAuth client)")
		os.Exit(2)
	}

	data, err := os.ReadFile(*clientPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: read json: %v\n", err)
		os.Exit(1)
	}

	var cf clientSecretFile
	if err := json.Unmarshal(data, &cf); err != nil {
		fmt.Fprintf(os.Stderr, "error: parse json: %v\n", err)
		os.Exit(1)
	}

	clientID, clientSecret, err := pickCredentials(cf)
	if err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	conf := &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		Endpoint:     google.Endpoint,
		Scopes:       []string{gmail.GmailSendScope},
	}
	ts := conf.TokenSource(ctx, &oauth2.Token{RefreshToken: refreshToken})
	tok, err := ts.Token()
	if err != nil {
		fmt.Fprintf(os.Stderr, "token refresh failed (client id/secret + refresh_token rejected): %v\n", err)
		os.Exit(1)
	}

	fmt.Println("OK: oauth token refresh succeeded")
	fmt.Printf("  access_token length: %d\n", len(tok.AccessToken))
	if tok.Expiry.IsZero() {
		fmt.Println("  expiry: (unset)")
	} else {
		fmt.Printf("  expiry: %s\n", tok.Expiry.UTC())
	}
}

func pickCredentials(cf clientSecretFile) (clientID, clientSecret string, err error) {
	if cid, sec := strings.TrimSpace(cf.Web.ClientID), strings.TrimSpace(cf.Web.ClientSecret); cid != "" && sec != "" {
		return cid, sec, nil
	}
	if cid, sec := strings.TrimSpace(cf.Installed.ClientID), strings.TrimSpace(cf.Installed.ClientSecret); cid != "" && sec != "" {
		return cid, sec, nil
	}
	return "", "", errors.New("json must contain \"web\" or \"installed\" with client_id and client_secret")
}
