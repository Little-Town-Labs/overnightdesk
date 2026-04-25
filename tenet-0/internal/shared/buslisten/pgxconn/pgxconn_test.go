package pgxconn

import (
	"context"
	"testing"
	"time"
)

// Acquire with a malformed DSN must fail fast. We can't unit-test the
// happy path without a real Postgres; the integration suite covers it.
func TestAcquire_BadDSNFails(t *testing.T) {
	a := New("::not a dsn::")
	ctx, cancel := context.WithTimeout(context.Background(), 500*time.Millisecond)
	defer cancel()
	if _, err := a.Acquire(ctx); err == nil {
		t.Fatal("expected error from pgx.Connect with malformed DSN")
	}
}
