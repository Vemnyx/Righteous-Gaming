package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"righteous-gaming/backend/internal/app"
	"righteous-gaming/backend/internal/handler"
	"righteous-gaming/backend/internal/service"
	"righteous-gaming/backend/log"
)

func listenAddr() string {
	p := strings.TrimSpace(os.Getenv("PORT"))
	if p == "" {
		return ":8080"
	}
	if strings.HasPrefix(p, ":") {
		return p
	}
	return ":" + p
}

func main() {
	ctx := context.Background()
	application, err := app.New(ctx)
	if err != nil {
		log.Fatal("failed to initialize app", "error", err)
	}
	defer application.Close()

	log.Info("application initialized")

	addr := listenAddr()

	userSvc := service.NewUserService(application.Repo, application.Firebase)
	mux := handler.NewRouter(application, userSvc)

	// Read/write timeouts must cover large recording uploads proxied through nginx.
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       2 * time.Hour,
		WriteTimeout:      2 * time.Hour,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("listen", "error", err)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-ctx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal("shutdown", "error", err)
	}
	log.Info("server stopped")
}
