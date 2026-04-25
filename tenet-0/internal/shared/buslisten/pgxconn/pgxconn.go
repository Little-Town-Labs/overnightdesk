// Package pgxconn provides the production pgx-backed ConnAcquirer for
// buslisten. It lives in a sub-package so the parent buslisten package
// stays fully unit-testable (no real Postgres dialing logic mixed in).
package pgxconn

import (
	"context"

	"github.com/jackc/pgx/v5"

	"github.com/overnightdesk/tenet-0/internal/shared/buslisten"
)

// Acquirer satisfies buslisten.ConnAcquirer by dialing a real Postgres
// using pgx.Connect.
type Acquirer struct {
	DSN string
}

// New returns a ready-to-use *Acquirer.
func New(dsn string) *Acquirer { return &Acquirer{DSN: dsn} }

// Acquire dials a fresh pgx.Conn and wraps it in a buslisten.ListenConn.
func (a *Acquirer) Acquire(ctx context.Context) (buslisten.ListenConn, error) {
	c, err := pgx.Connect(ctx, a.DSN)
	if err != nil {
		return nil, err
	}
	return &connAdapter{c: c}, nil
}

type connAdapter struct{ c *pgx.Conn }

func (a *connAdapter) Exec(ctx context.Context, sql string, args ...any) error {
	_, err := a.c.Exec(ctx, sql, args...)
	return err
}

func (a *connAdapter) WaitForNotification(ctx context.Context) (string, string, error) {
	n, err := a.c.WaitForNotification(ctx)
	if err != nil {
		return "", "", err
	}
	return n.Channel, n.Payload, nil
}

func (a *connAdapter) Close(ctx context.Context) error { return a.c.Close(ctx) }
