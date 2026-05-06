package db

import (
	"context"
	"fmt"

	"righteous-gaming/backend/internal/secrets"
)

// databaseURLFromSecretManager loads the connection string payload using the VM's
// default credentials (workload identity on GCE). name must be a full version
// resource, e.g. projects/my-project/secrets/my-secret/versions/latest
func databaseURLFromSecretManager(ctx context.Context, name string) (string, error) {
	u, err := secrets.AccessPayload(ctx, name)
	if err != nil {
		return "", err
	}
	if u == "" {
		return "", fmt.Errorf("db: secret %q resolved to empty connection string", name)
	}
	return u, nil
}
