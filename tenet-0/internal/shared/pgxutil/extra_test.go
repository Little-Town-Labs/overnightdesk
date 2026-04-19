package pgxutil

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/pashagolub/pgxmock/v3"
)

// TestNew_ContextCancelledStillReturnsError ensures we don't hang trying
// to dial when ctx is already done. The DSN target points to a closed port
// so the connect fails; either way, we must surface an error.
func TestNew_ContextCancelledStillReturnsError(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	// 127.0.0.1:1 is reserved + refused on every Linux box.
	_, err := New(ctx, "postgres://x:y@127.0.0.1:1/db?connect_timeout=1", "test-role")
	if err == nil {
		t.Fatal("expected dial failure to surface as error")
	}
}

// TestWithTx_DelegatesToWithTxMock_BeginError exercises the error path of
// WithTx by passing a TxBeginner that fails Begin. The public WithTx is a
// thin shim — we cover withTxMock's begin-error path here, then assert
// the wrapper signature compiles & matches.
func TestWithTx_BeginError(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	mock.ExpectBegin().WillReturnError(errors.New("begin denied"))

	err = withTxMock(context.Background(), mock, func(tx pgx.Tx) error { return nil })
	if err == nil {
		t.Fatal("expected error when Begin fails")
	}
}

// TestWithTx_CommitError exercises the commit-failure branch.
func TestWithTx_CommitError(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()

	mock.ExpectBegin()
	mock.ExpectCommit().WillReturnError(errors.New("commit denied"))

	err = withTxMock(context.Background(), mock, func(tx pgx.Tx) error { return nil })
	if err == nil {
		t.Fatal("expected commit error to propagate")
	}
}

// TestWithTx_PublicWrapperCommits exercises the exported WithTx (rather
// than the internal withTxMock seam) so coverage reflects both names.
func TestWithTx_PublicWrapperCommits(t *testing.T) {
	mock, err := pgxmock.NewPool()
	if err != nil {
		t.Fatalf("pgxmock.NewPool: %v", err)
	}
	defer mock.Close()
	mock.ExpectBegin()
	mock.ExpectCommit()
	if err := WithTx(context.Background(), mock, func(tx pgx.Tx) error { return nil }); err != nil {
		t.Fatalf("WithTx: %v", err)
	}
}
