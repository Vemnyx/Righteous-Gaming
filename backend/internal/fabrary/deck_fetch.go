package fabrary

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cognitoidentity"
	v4 "github.com/aws/aws-sdk-go-v2/aws/signer/v4"

	"righteous-gaming/backend/internal/scrape"
)

const (
	appSyncGraphQLEndpoint = "https://42xrd23ihbd47fjvsrt27ufpfe.appsync-api.us-east-2.amazonaws.com/graphql"
	appSyncRegion          = "us-east-2"
	guestIdentityPoolID    = "us-east-2:e50f3ed7-32ed-4b22-a05e-10b3e7e03fe0"
	// Fabrary's AppSync WAF blocks requests without a browser User-Agent.
	appSyncUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)

// DeckCard is one card line from a Fabrary deck list.
type DeckCard struct {
	CardIdentifier     string
	MainboardQuantity  int
	SideboardQuantity  int
}

// Deck is parsed Fabrary deck metadata and card lines.
type Deck struct {
	DeckID         string
	Name           string
	Format         string
	HeroIdentifier string
	CreatedAt      *time.Time
	Cards          []DeckCard
}

type graphQLRequest struct {
	Query     string         `json:"query"`
	Variables map[string]any `json:"variables"`
}

type graphQLResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

type fetchedDeck struct {
	Name           string  `json:"name"`
	Format         string  `json:"format"`
	HeroIdentifier string  `json:"heroIdentifier"`
	CreatedAt      *string `json:"createdAt"`
	DeckCards      []struct {
		Quantity          int    `json:"quantity"`
		SideboardQuantity int    `json:"sideboardQuantity"`
		CardIdentifier    string `json:"cardIdentifier"`
	} `json:"deckCards"`
}

const getDeckQuery = `
query getDeck($deckId: ID!) {
  getDeck(deckId: $deckId) {
    name
    format
    heroIdentifier
    createdAt
    deckCards {
      quantity
      sideboardQuantity
      cardIdentifier
    }
  }
}`

const getDeckCreatedAtQuery = `
query getDeck($deckId: ID!) {
  getDeck(deckId: $deckId) {
    createdAt
  }
}`

// FetchDeck loads deck metadata and card lines from Fabrary AppSync.
func FetchDeck(ctx context.Context, deckID string) (*Deck, error) {
	deckID = strings.TrimSpace(deckID)
	if deckID == "" {
		return nil, fmt.Errorf("fabrary: empty deck id")
	}

	body, err := json.Marshal(graphQLRequest{
		Query: getDeckQuery,
		Variables: map[string]any{
			"deckId": deckID,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("fabrary: marshal graphql request: %w", err)
	}

	respBody, err := postAppSyncGraphQL(ctx, body)
	if err != nil {
		return nil, err
	}

	var gql graphQLResponse
	if err := json.Unmarshal(respBody, &gql); err != nil {
		return nil, fmt.Errorf("fabrary: decode graphql response: %w", err)
	}
	if len(gql.Errors) > 0 {
		return nil, fmt.Errorf("fabrary: graphql error: %s", gql.Errors[0].Message)
	}

	var data struct {
		GetDeck *fetchedDeck `json:"getDeck"`
	}
	if err := json.Unmarshal(gql.Data, &data); err != nil {
		return nil, fmt.Errorf("fabrary: decode deck payload: %w", err)
	}
	if data.GetDeck == nil {
		return nil, fmt.Errorf("fabrary: deck not found")
	}

	raw := data.GetDeck
	out := &Deck{
		DeckID:         deckID,
		Name:           strings.TrimSpace(raw.Name),
		Format:         strings.TrimSpace(raw.Format),
		HeroIdentifier: strings.TrimSpace(raw.HeroIdentifier),
		CreatedAt:      parseFabraryTimestamp(raw.CreatedAt),
	}
	if out.Name == "" {
		return nil, fmt.Errorf("fabrary: deck has no name")
	}

	for _, line := range raw.DeckCards {
		ident := strings.TrimSpace(line.CardIdentifier)
		if ident == "" {
			continue
		}
		if line.Quantity > 0 {
			out.Cards = append(out.Cards, DeckCard{
				CardIdentifier:    ident,
				MainboardQuantity: line.Quantity,
			})
		}
		if line.SideboardQuantity > 0 {
			out.Cards = append(out.Cards, DeckCard{
				CardIdentifier:    ident,
				SideboardQuantity: line.SideboardQuantity,
			})
		}
	}
	if len(out.Cards) == 0 {
		return nil, fmt.Errorf("fabrary: deck has no cards")
	}
	return out, nil
}

// FetchDeckCreatedAt loads Fabrary createdAt for a deck id (metadata only).
func FetchDeckCreatedAt(ctx context.Context, deckID string) (time.Time, error) {
	deckID = strings.TrimSpace(deckID)
	if deckID == "" {
		return time.Time{}, fmt.Errorf("fabrary: empty deck id")
	}

	body, err := json.Marshal(graphQLRequest{
		Query: getDeckCreatedAtQuery,
		Variables: map[string]any{
			"deckId": deckID,
		},
	})
	if err != nil {
		return time.Time{}, fmt.Errorf("fabrary: marshal graphql request: %w", err)
	}

	respBody, err := postAppSyncGraphQL(ctx, body)
	if err != nil {
		return time.Time{}, err
	}

	var gql graphQLResponse
	if err := json.Unmarshal(respBody, &gql); err != nil {
		return time.Time{}, fmt.Errorf("fabrary: decode graphql response: %w", err)
	}
	if len(gql.Errors) > 0 {
		return time.Time{}, fmt.Errorf("fabrary: graphql error: %s", gql.Errors[0].Message)
	}

	var data struct {
		GetDeck *struct {
			CreatedAt *string `json:"createdAt"`
		} `json:"getDeck"`
	}
	if err := json.Unmarshal(gql.Data, &data); err != nil {
		return time.Time{}, fmt.Errorf("fabrary: decode deck createdAt payload: %w", err)
	}
	if data.GetDeck == nil {
		return time.Time{}, fmt.Errorf("fabrary: deck not found")
	}
	createdAt := parseFabraryTimestamp(data.GetDeck.CreatedAt)
	if createdAt == nil {
		return time.Time{}, fmt.Errorf("fabrary: deck has no createdAt")
	}
	return *createdAt, nil
}

func parseFabraryTimestamp(raw *string) *time.Time {
	if raw == nil {
		return nil
	}
	s := strings.TrimSpace(*raw)
	if s == "" {
		return nil
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		t, err = time.Parse(time.RFC3339, s)
		if err != nil {
			return nil
		}
	}
	utc := t.UTC()
	return &utc
}

func postAppSyncGraphQL(ctx context.Context, body []byte) ([]byte, error) {
	creds, err := guestAppSyncCredentials(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, appSyncGraphQLEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("fabrary: build graphql request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", appSyncUserAgent)
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Origin", "https://fabrary.net")
	req.Header.Set("Referer", "https://fabrary.net/")

	signer := v4.NewSigner()
	sum := sha256.Sum256(body)
	payloadHash := hex.EncodeToString(sum[:])
	if err := signer.SignHTTP(ctx, creds, req, payloadHash, "appsync", appSyncRegion, time.Now()); err != nil {
		return nil, fmt.Errorf("fabrary: sign graphql request: %w", err)
	}

	client, err := scrape.OutboundHTTPClient(ctx, 30*time.Second)
	if err != nil {
		return nil, fmt.Errorf("fabrary: http client: %w", err)
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fabrary: graphql request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("fabrary: read graphql response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("fabrary: graphql HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
	return respBody, nil
}

func guestAppSyncCredentials(ctx context.Context) (aws.Credentials, error) {
	client := cognitoidentity.New(cognitoidentity.Options{Region: appSyncRegion})
	idOut, err := client.GetId(ctx, &cognitoidentity.GetIdInput{
		IdentityPoolId: aws.String(guestIdentityPoolID),
	})
	if err != nil {
		return aws.Credentials{}, fmt.Errorf("fabrary: cognito get id: %w", err)
	}
	if idOut.IdentityId == nil || strings.TrimSpace(*idOut.IdentityId) == "" {
		return aws.Credentials{}, fmt.Errorf("fabrary: cognito returned empty identity")
	}

	credOut, err := client.GetCredentialsForIdentity(ctx, &cognitoidentity.GetCredentialsForIdentityInput{
		IdentityId: idOut.IdentityId,
	})
	if err != nil {
		return aws.Credentials{}, fmt.Errorf("fabrary: cognito get credentials: %w", err)
	}
	if credOut.Credentials == nil {
		return aws.Credentials{}, fmt.Errorf("fabrary: cognito returned no credentials")
	}
	c := credOut.Credentials
	if c.AccessKeyId == nil || c.SecretKey == nil || c.SessionToken == nil {
		return aws.Credentials{}, fmt.Errorf("fabrary: incomplete guest credentials")
	}
	var expires time.Time
	if c.Expiration != nil {
		expires = *c.Expiration
	}
	return aws.Credentials{
		AccessKeyID:     strings.TrimSpace(*c.AccessKeyId),
		SecretAccessKey: strings.TrimSpace(*c.SecretKey),
		SessionToken:    strings.TrimSpace(*c.SessionToken),
		CanExpire:       !expires.IsZero(),
		Expires:         expires,
		Source:          "CognitoIdentityGuest",
	}, nil
}

// HeroFromIdentifier resolves a Fabrary hero slug to a domain CardHero id using known hero keys.
func HeroFromIdentifier(heroIdentifier string) (int16, error) {
	slug := strings.ToLower(strings.TrimSpace(heroIdentifier))
	if slug == "" {
		return 0, fmt.Errorf("fabrary: empty hero identifier")
	}

	// Direct match on slug with domain hero names (e.g. "bravo").
	for key, id := range fabHeroKeyToSmallint {
		if strings.EqualFold(key, slug) || strings.EqualFold(key, strings.ReplaceAll(slug, "-", "")) {
			return id, nil
		}
	}

	// Prefix before first hyphen often identifies the hero (e.g. "arakni-huntsman" -> "Arakni").
	if i := strings.Index(slug, "-"); i > 0 {
		prefix := slug[:i]
		for key, id := range fabHeroKeyToSmallint {
			if strings.EqualFold(key, prefix) {
				return id, nil
			}
		}
	}

	return 0, fmt.Errorf("fabrary: unknown hero identifier %q", heroIdentifier)
}
