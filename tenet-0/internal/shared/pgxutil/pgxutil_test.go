package pgxutil

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v3"
)

// TestNew_RejectsBadDSN verifies New surfaces parse errors from pgxpool
// rather than swallowing them.
func TestNew_RejectsBadDSN(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err := New(ctx, "::not a dsn::", "test-role")
	if err == nil {
		t.Fatal("New with malformed DSN must return error")
	}
}

// TestNew_RejectsEmptyRole guards against pg_stat_activity rows showing up
// as bare `tenet0-` with no role suffix.
func TestNew_RejectsEmptyRole(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	_, err := New(ctx, "postgres://test:test@localhost/tenet0", "")
	if err == nil {
		t.Fatal("New with empty role must return error")
	}
	if !strings.Contains(strings.ToLower(err.Error()), "role") {
		t.Errorf("error should mention role; got %v", err)
	}
}

// TestNew_AppliesApplicationName confirms the produced DSN carries
// application_name=tenet0-<role>. This is asserted via the parsed config
// the implementation derives from dsn (we cannot dial a real DB here).
//
// The implementation MUST expose this somehow — for the test we rely on a
// helper `applicationNameFor(role)` that the implementation should provide
// alongside New for unit-testability.
func TestApplicationNameFor(t *testing.T) {
	got := applicationNameFor("bus-mcp")
	if got != "tenet0-bus-mcp" {
		t.Errorf("applicationNameFor(bus-mcp) = %q, want tenet0-bus-mcp", got)
	}
}

// TestWithTx_CommitsOnSuccess uses pgxmock to assert Begin → Commit happens
// when fn returns nil.
func TestWithTx_CommitsOnSuccess(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	mock.ExpectBegin()
	mock.ExpectCommit()

	err = withTxMock(context.Background(), mock, func(tx pgx.Tx) error { return nil })
	if err != nil {
		t.Fatalf("WithTx returned error: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("expectations: %v", err)
	}
}

// TestWithTx_RollsBackOnError asserts non-nil fn error triggers Rollback,
// and the original error propagates.
func TestWithTx_RollsBackOnError(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	mock.ExpectBegin()
	mock.ExpectRollback()

	want := errors.New("boom")
	err = withTxMock(context.Background(), mock, func(tx pgx.Tx) error { return want })
	if !errors.Is(err, want) {
		t.Errorf("WithTx error = %v, want wrap of %v", err, want)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Errorf("expectations: %v", err)
	}
}

// TestWithTx_RollsBackOnPanic asserts a panicking fn rolls back and
// re-panics with the original value.
func TestWithTx_RollsBackOnPanic(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	mock.ExpectBegin()
	mock.ExpectRollback()

	defer func() {
		r := recover()
		if r == nil {
			t.Fatal("expected re-panic from WithTx")
		}
		if s, _ := r.(string); s != "kaboom" {
			t.Errorf("panic value = %v, want kaboom", r)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("expectations: %v", err)
		}
	}()

	_ = withTxMock(context.Background(), mock, func(tx pgx.Tx) error {
		panic("kaboom")
	})
}
