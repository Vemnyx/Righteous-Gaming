package app

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"righteous-gaming/backend/internal/repository"
	"righteous-gaming/backend/log"
)

// App holds shared runtime services for the HTTP server and workers.
type App struct {
	Repo *repository.Repository

	closeLog func()
}

// openInfoFileHandler returns a handler writing to BACKEND_LOG_FILE (default
// logs/app.log) and a close func for the file. On failure, returns Discard + no-op close.
func openInfoFileHandler() (slog.Handler, func()) {
	path := strings.TrimSpace(os.Getenv("BACKEND_LOG_FILE"))
	if path == "" {
		path = "logs/app.log"
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		fmt.Fprintf(os.Stderr, "info log: mkdir %q: %v (file logging disabled)\n", dir, err)
		return slog.DiscardHandler, func() {}
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
	if err != nil {
		fmt.Fprintf(os.Stderr, "info log: open %q: %v (file logging disabled)\n", path, err)
		return slog.DiscardHandler, func() {}
	}
	h := slog.NewTextHandler(f, &slog.HandlerOptions{Level: slog.LevelInfo})
	return h, func() { _ = f.Close() }
}

// New constructs an App: installs slog.Default() (stderr + optional file tee),
// opens the database pool, and constructs the repository.
func New(ctx context.Context) (*App, error) {
	stderrHandler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	fileHandler, closeInfo := openInfoFileHandler()

	root := slog.New(&teeHandler{a: stderrHandler, b: fileHandler})
	slog.SetDefault(root)

	repo, err := repository.New(ctx)
	if err != nil {
		closeInfo()
		return nil, fmt.Errorf("app: %w", err)
	}

	a := &App{
		Repo:     repo,
		closeLog: closeInfo,
	}
	log.Info("database connection established")
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
