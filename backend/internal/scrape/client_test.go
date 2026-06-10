package scrape

import (
	"context"
	"os"
	"testing"
)

func TestResolveProxyURLFromComponents(t *testing.T) {
	t.Setenv("FABTCG_HTTP_PROXY", "")
	t.Setenv("HTTPS_PROXY", "")
	t.Setenv("HTTP_PROXY", "")
	t.Setenv("FABTCG_PROXY_HOST", "gw.dataimpulse.com")
	t.Setenv("FABTCG_PROXY_PORT", "823")
	t.Setenv("FABTCG_PROXY_USER", "ec2db91067d0b2dba976")
	t.Setenv("FABTCG_PROXY_PASSWORD", "secret-pass")
	t.Setenv("FABTCG_PROXY_PASSWORD_SECRET", "")

	got, err := resolveProxyURL(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	want := "http://ec2db91067d0b2dba976:secret-pass@gw.dataimpulse.com:823"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
}

func TestResolveProxyURLEmptyWithoutConfig(t *testing.T) {
	for _, key := range []string{
		"FABTCG_HTTP_PROXY", "HTTPS_PROXY", "HTTP_PROXY",
		"FABTCG_PROXY_HOST", "FABTCG_PROXY_USER", "FABTCG_PROXY_PASSWORD", "FABTCG_PROXY_PASSWORD_SECRET",
	} {
		_ = os.Unsetenv(key)
	}
	got, err := resolveProxyURL(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	if got != "" {
		t.Fatalf("expected empty proxy URL, got %q", got)
	}
}
