package db

import (
	"context"
	"fmt"
	"strings"

	secretmanager "cloud.google.com/go/secretmanager/apiv1"
	"cloud.google.com/go/secretmanager/apiv1/secretmanagerpb"
)

// databaseURLFromSecretManager loads the connection string payload using the VM's
// default credentials (workload identity on GCE). name must be a full version
// resource, e.g. projects/my-project/secrets/my-secret/versions/latest
func databaseURLFromSecretManager(ctx context.Context, name string) (string, error) {
	client, err := secretmanager.NewClient(ctx)
	if err != nil {
		return "", fmt.Errorf("secretmanager client: %w", err)
	}
	defer client.Close()

	res, err := client.AccessSecretVersion(ctx, &secretmanagerpb.AccessSecretVersionRequest{
		Name: name,
	})
	if err != nil {
		return "", fmt.Errorf("access secret version %q: %w", name, err)
	}
	if res.Payload == nil || len(res.Payload.Data) == 0 {
		return "", fmt.Errorf("secret %q has empty payload", name)
	}
	return strings.TrimSpace(string(res.Payload.Data)), nil
}
