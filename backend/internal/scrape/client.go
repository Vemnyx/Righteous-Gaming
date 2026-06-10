package scrape

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"

	"golang.org/x/net/proxy"

	"righteous-gaming/backend/internal/secrets"
)

const fabFetchTimeout = 45 * time.Second

// Client fetches FabTCG pages with browser-like headers, optional outbound proxy,
// and a shared cookie jar.
type Client struct {
	proxyOverride string
	mu            sync.Mutex
	httpClient    *http.Client
	initErr       error
	inited        bool
}

// NewClient builds a FabTCG scraper client. Outbound proxy config (first match wins):
//   - FABTCG_HTTP_PROXY — full URL, or Secret Manager version name with the full URL
//   - FABTCG_PROXY_HOST + FABTCG_PROXY_USER + password (FABTCG_PROXY_PASSWORD or FABTCG_PROXY_PASSWORD_SECRET)
//   - HTTPS_PROXY / HTTP_PROXY
//
// Supported schemes: http, https, socks5, socks5h.
func NewClient() *Client {
	return &Client{}
}

// NewClientWithProxy is like NewClient but uses an explicit proxy URL (tests).
func NewClientWithProxy(proxyURL string) *Client {
	return &Client{proxyOverride: strings.TrimSpace(proxyURL)}
}

func proxyURLFromEnv() string {
	for _, key := range []string{"FABTCG_HTTP_PROXY", "HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			return v
		}
	}
	return ""
}

func resolveProxyURL(ctx context.Context, override string) (string, error) {
	if override != "" {
		return resolveConfigValue(ctx, override)
	}
	if raw := proxyURLFromEnv(); raw != "" {
		return resolveConfigValue(ctx, raw)
	}

	host := strings.TrimSpace(os.Getenv("FABTCG_PROXY_HOST"))
	user := strings.TrimSpace(os.Getenv("FABTCG_PROXY_USER"))
	if host == "" || user == "" {
		return "", nil
	}
	port := strings.TrimSpace(os.Getenv("FABTCG_PROXY_PORT"))
	if port == "" {
		port = "823"
	}
	pass := strings.TrimSpace(os.Getenv("FABTCG_PROXY_PASSWORD"))
	if pass == "" {
		passRef := strings.TrimSpace(os.Getenv("FABTCG_PROXY_PASSWORD_SECRET"))
		if passRef == "" {
			return "", fmt.Errorf("fabtcg proxy: set FABTCG_PROXY_PASSWORD or FABTCG_PROXY_PASSWORD_SECRET")
		}
		var err error
		pass, err = resolveConfigValue(ctx, passRef)
		if err != nil {
			return "", fmt.Errorf("fabtcg proxy password: %w", err)
		}
	}
	u := &url.URL{
		Scheme: "http",
		Host:   net.JoinHostPort(host, port),
		User:   url.UserPassword(user, pass),
	}
	return u.String(), nil
}

func resolveConfigValue(ctx context.Context, raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if secrets.IsGCPSecretVersionName(raw) {
		return secrets.AccessPayload(ctx, raw)
	}
	return raw, nil
}

func buildHTTPClient(proxyURL string) (*http.Client, error) {
	jar, _ := cookiejar.New(nil)
	transport := &http.Transport{
		TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12},
	}
	if proxyURL != "" {
		u, err := url.Parse(proxyURL)
		if err != nil {
			return nil, fmt.Errorf("invalid fabtcg proxy URL: %w", err)
		}
		switch strings.ToLower(u.Scheme) {
		case "http", "https":
			transport.Proxy = http.ProxyURL(u)
			slog.Info("fabtcg scrape: using HTTP proxy", "host", u.Host)
		case "socks5", "socks5h":
			dialer, err := proxy.FromURL(u, proxy.Direct)
			if err != nil {
				return nil, fmt.Errorf("fabtcg socks proxy: %w", err)
			}
			transport.DialContext = func(ctx context.Context, network, addr string) (net.Conn, error) {
				return dialer.Dial(network, addr)
			}
			slog.Info("fabtcg scrape: using SOCKS proxy", "host", u.Host)
		default:
			return nil, fmt.Errorf("unsupported fabtcg proxy scheme %q", u.Scheme)
		}
	}
	return &http.Client{
		Transport: transport,
		Timeout:   fabFetchTimeout,
		Jar:       jar,
	}, nil
}

func (c *Client) ensureClient(ctx context.Context) (*http.Client, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.inited {
		return c.httpClient, c.initErr
	}
	proxyURL, err := resolveProxyURL(ctx, c.proxyOverride)
	if err != nil {
		c.initErr = err
		c.inited = true
		return nil, c.initErr
	}
	c.httpClient, c.initErr = buildHTTPClient(proxyURL)
	c.inited = true
	return c.httpClient, c.initErr
}
