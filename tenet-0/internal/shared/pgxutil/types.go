// Package pgxutil wraps pgx/v5/pgxpool with role-aware DSN handling so every
// Tenet-0 binary registers itself in pg_stat_activity with a stable
// application_name (`tenet0-<role>`).
package pgxutil

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// applicationNameFor returns the PostgreSQL application_name string that
// New attaches to its pool.
func applicationNameFor(role string) string {
	return "tenet0-" + role
}

// New constructs a pgxpool.Pool from dsn, sets application_name to
// `tenet0-<role>`, pings the database, and returns the pool. The caller
// owns Close.
func New(ctx context.Context, dsn string, role string) (*pgxpool.Pool, error) {
	if role == "" {
		return nil, errors.New("pgxutil.New: role must not be empty")
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxutil.New: parse dsn: %w", err)
	}
	if cfg.ConnConfig.RuntimeParams == nil {
		cfg.ConnConfig.RuntimeParams = map[string]string{}
	}
	cfg.ConnConfig.RuntimeParams["application_name"] = applicationNameFor(role)

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pgxutil.New: create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pgxutil.New: ping: %w", err)
	}
	return pool, nil
}

// TxBeginner is the minimal Begin interface WithTx needs. Both
// *pgxpool.Pool and pgxmock.PgxPoolIface satisfy it.
type TxBeginner interface {
	Begin(ctx context.Context) (pgx.Tx, error)
}

// WithTx runs fn inside a transaction. Commits on nil error; rolls back on
// non-nil error or panic. Panics inside fn are re-raised after rollback so
// callers see the original stack. Accepts any TxBeginner; in production
// callers pass *pgxpool.Pool, in tests they pass pgxmock pools.
func WithTx(ctx context.Context, pool TxBeginner, fn func(tx pgx.Tx) error) error {
	return withTxMock(ctx, pool, fn)
}

// withTxMock is retained as the test-targeted internal name. Behaviour
// identical to WithTx; tests written against this name continue to work.
func withTxMock(ctx context.Context, pool TxBeginner, fn func(tx pgx.Tx) error) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("pgxutil.WithTx: begin: %w", err)
	}

	// Run fn under a recover wrapper so we can roll back then re-panic.
	var fnErr error
	func() {
		defer func() {
			if r := recover(); r != nil {
				_ = tx.Rollback(ctx)
				panic(r) // propagate after rollback
			}
		}()
		fnErr = fn(tx)
	}()

	if fnErr != nil {
		_ = tx.Rollback(ctx)
		return fnErr
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("pgxutil.WithTx: commit: %w", err)
	}
	return nil
}
