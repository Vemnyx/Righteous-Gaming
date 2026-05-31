package fabrary

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const MaxSourceDownloadBytes = 20 << 20

// FetchSourceURL downloads a fabrary TypeScript source file.
func FetchSourceURL(ctx context.Context, rawURL string) ([]byte, error) {
	client := &http.Client{Timeout: 120 * time.Second}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "RighteousGamingFabraryImport/1.0")
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch fabrary source: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		slurp, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("fetch fabrary source: HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(slurp)))
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, MaxSourceDownloadBytes))
	if err != nil {
		return nil, err
	}
	return data, nil
}
