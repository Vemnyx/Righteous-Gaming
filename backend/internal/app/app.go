package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"righteous-gaming/backend/internal/repository"
)

// App holds shared runtime services for the HTTP server and workers.
type App struct {
	Log  *slog.Logger
	Repo *repository.Repository

	closeLog func()
}

func newInfoFileLogger(stderr *slog.Logger) (info *slog.Logger, closeFn func()) {
	path := strings.TrimSpace(os.Getenv("BACKEND_LOG_FILE"))
	if path == "" {
		path = "logs/backend.log"
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		stderr.Warn("info log: mkdir failed; file info logs disabled", "dir", dir, "error", err)
		return slog.New(slog.DiscardHandler), func() {}
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
	if err != nil {
		stderr.Warn("info log: open failed; file info logs disabled", "path", path, "error", err)
		return slog.New(slog.DiscardHandler), func() {}
	}
	h := slog.NewTextHandler(f, &slog.HandlerOptions{Level: slog.LevelInfo})
	return slog.New(h), func() { _ = f.Close() }
}

// New constructs an App: stderr + file sloggers, database pool (via repository), and repository.
func New(ctx context.Context) (*App, error) {
	stderrLog := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	infoLog, closeInfoLog := newInfoFileLogger(stderrLog)

	repo, err := repository.New(ctx)
	if err != nil {
		closeInfoLog()
		return nil, fmt.Errorf("app: %w", err)
	}

	a := &App{
		Log:  infoLog,
		Repo: repo,
	}

	stderrLog.Info("database connection established")
	infoLog.Info("database connection established")
	return a, nil
}

// Close releases the database pool and closes the info log file.
func (a *App) Close() {
	if a.Repo != nil {
		a.Repo.Close()
	}
	if a.closeLog != nil {
		a.closeLog()
		a.closeLog = nil
	}
}
