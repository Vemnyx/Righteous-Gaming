package client

import (
	"context"
	"fmt"
	"io"
	"strings"

	"cloud.google.com/go/storage"
)

// AssetsBucketName is the only bucket used for uploads from this service (public
// asset URLs use storage.googleapis.com/righteous-assets/...).
const AssetsBucketName = "righteous-assets"

// AssetsPublicURL returns the public HTTPS URL for an object in righteous-assets.
func AssetsPublicURL(objectPath string) string {
	objectPath = strings.TrimSpace(objectPath)
	objectPath = strings.TrimPrefix(objectPath, "/")
	return "https://storage.googleapis.com/" + AssetsBucketName + "/" + objectPath
}

// GCS is a Google Cloud Storage client using Application Default Credentials
// (ADC). Use the same GCP project and service account (or
// GOOGLE_APPLICATION_CREDENTIALS) as other server-side Google APIs: grant
// *roles/storage.objectUser* (or objectAdmin) on the target bucket.
//
// This is separate from the Gmail client, which uses OAuth user refresh tokens;
// GCS requires an identity that can call the Storage API (typically a
// service account in the same project as the bucket).
type GCS struct {
	client *storage.Client
}

// NewGCS creates a Storage client. It uses ADC (metadata on GCE/Cloud Run, or
// GOOGLE_APPLICATION_CREDENTIALS / gcloud auth application-default login locally).
func NewGCS(ctx context.Context) (*GCS, error) {
	c, err := storage.NewClient(ctx)
	if err != nil {
		return nil, fmt.Errorf("gcs: new client: %w", err)
	}
	return &GCS{client: c}, nil
}

// Close releases underlying connections.
func (g *GCS) Close() error {
	if g == nil || g.client == nil {
		return nil
	}
	return g.client.Close()
}

// Upload writes the contents of r to gs://righteous-assets/objectPath.
// objectPath should be the object key (e.g. "uploads/cards/foo.webp"); leading
// slashes are stripped. contentType may be empty; set when known (e.g.
// "image/webp") so browsers and CDNs can serve the object correctly.
func (g *GCS) Upload(ctx context.Context, objectPath string, r io.Reader, contentType string) error {
	if g == nil || g.client == nil {
		return fmt.Errorf("gcs: nil client")
	}
	objectPath = strings.TrimSpace(objectPath)
	objectPath = strings.TrimPrefix(objectPath, "/")
	if objectPath == "" {
		return fmt.Errorf("gcs: object path is required")
	}

	w := g.client.Bucket(AssetsBucketName).Object(objectPath).NewWriter(ctx)
	contentType = strings.TrimSpace(contentType)
	if contentType != "" {
		w.ContentType = contentType
	}

	if _, err := io.Copy(w, r); err != nil {
		_ = w.CloseWithError(err)
		return fmt.Errorf("gcs: write object %q: %w", objectPath, err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("gcs: finalize object %q: %w", objectPath, err)
	}
	return nil
}
