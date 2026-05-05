package repository

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"

	"righteous-gaming/backend/internal/db"
)

// Repository owns database access for the application.
// Add typed methods here as you introduce tables and queries.
type Repository struct {
	pool *pgxpool.Pool
}

// New opens the connection pool from config and constructs a Repository.
func New(ctx context.Context, cfg db.Config) (*Repository, error) {
	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("repository: db pool: %w", err)
	}
	return &Repository{pool: pool}, nil
}

// Close shuts down the connection pool.
func (r *Repository) Close() {
	if r.pool == nil {
		return
	}
	r.pool.Close()
	r.pool = nil
}

// Ping verifies connectivity to PostgreSQL.
func (r *Repository) Ping(ctx context.Context) error {
	if r.pool == nil {
		return fmt.Errorf("repository: pool is closed")
	}
	return r.pool.Ping(ctx)
}
