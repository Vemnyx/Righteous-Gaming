package client

import (
	"context"
	"fmt"
	"os"
	"strings"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
)

// Firebase wraps the Firebase Admin SDK for Authentication (server-side).
type Firebase struct {
	auth *auth.Client
}

// New builds a Firebase Admin client using Application Default Credentials.
// Optionally set FIREBASE_PROJECT_ID when your environment does not resolve a default project
// (local dev, non-GCP hosts).
func New(ctx context.Context) (*Firebase, error) {
	conf := &firebase.Config{}
	if pid := strings.TrimSpace(os.Getenv("FIREBASE_PROJECT_ID")); pid != "" {
		conf.ProjectID = pid
	}

	app, err := firebase.NewApp(ctx, conf)
	if err != nil {
		return nil, fmt.Errorf("firebase app: %w", err)
	}
	authClient, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("firebase auth client: %w", err)
	}
	return &Firebase{auth: authClient}, nil
}

// VerifyIDToken validates a Firebase ID token (JWT) from a client.
func (f *Firebase) VerifyIDToken(ctx context.Context, idToken string) (*auth.Token, error) {
	return f.auth.VerifyIDToken(ctx, idToken)
}

// User returns a user record by UID.
func (f *Firebase) User(ctx context.Context, uid string) (*auth.UserRecord, error) {
	return f.auth.GetUser(ctx, uid)
}

// UserByEmail returns a user record by email.
func (f *Firebase) UserByEmail(ctx context.Context, email string) (*auth.UserRecord, error) {
	return f.auth.GetUserByEmail(ctx, email)
}

// CreateUser registers a new Firebase Auth user.
func (f *Firebase) CreateUser(ctx context.Context, params *auth.UserToCreate) (*auth.UserRecord, error) {
	return f.auth.CreateUser(ctx, params)
}

// UpdateUser updates an existing Firebase Auth user.
func (f *Firebase) UpdateUser(ctx context.Context, uid string, params *auth.UserToUpdate) (*auth.UserRecord, error) {
	return f.auth.UpdateUser(ctx, uid, params)
}

// DeleteUser removes a Firebase Auth user.
func (f *Firebase) DeleteUser(ctx context.Context, uid string) error {
	return f.auth.DeleteUser(ctx, uid)
}

// RevokeRefreshTokens invalidates existing refresh tokens for the user.
func (f *Firebase) RevokeRefreshTokens(ctx context.Context, uid string) error {
	return f.auth.RevokeRefreshTokens(ctx, uid)
}
