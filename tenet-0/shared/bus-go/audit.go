package bus

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

// Audit returns the audit-log view. Intended for SecOps callers — the
// underlying SELECT requires `tenet0_secops` permissions on audit_log
// (granted in migration 006). Calling Query/Stream from a Bus connected as
// `tenet0_app` yields a permission error wrapped as "audit: query: ...".
//
// The library does not enforce role separation; the caller chooses the
// PostgresURL that determines effective grants.
func (b *Bus) Audit() *Audit {
	return &Audit{bus: b}
}

// Audit wraps read-only queries against audit_log.
type Audit struct {
	bus *Bus
}

// AuditFilter narrows an Audit.Query or Audit.Stream.
// Zero-value fields are ignored.
type AuditFilter struct {
	Actor    string
	Action   string
	FromTime time.Time
	ToTime   time.Time
	Limit    int // default 1000
}

// AuditEntry is one row from audit_log.
type AuditEntry struct {
	ID         int64
	Actor      string
	Action     string
	Detail     json.RawMessage
	RecordedAt time.Time
}

// Query returns matching audit log entries, newest first.
func (a *Audit) Query(ctx context.Context, f AuditFilter) ([]AuditEntry, error) {
	q, args := buildAuditQuery(f)
	rows, err := a.bus.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, fmt.Errorf("audit: query: %w", err)
	}
	defer rows.Close()

	var entries []AuditEntry
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Actor, &e.Action, &e.Detail, &e.RecordedAt); err != nil {
			return nil, fmt.Errorf("audit: scan: %w", err)
		}
		entries = append(entries, e)
	}
	return entries, rows.Err()
}

// Stream polls the audit log and invokes onEntry for each new entry since
// the last poll. Returns a stop function the caller invokes to cancel.
// Each entry fires at most once (tracked by internal last-seen ID).
//
// onEntry runs synchronously inside the polling goroutine; a slow callback
// blocks the next tick. Offload to a goroutine if needed.
func (a *Audit) Stream(ctx context.Context, interval time.Duration, f AuditFilter, onEntry func(AuditEntry)) (stop func(), err error) {
	if interval <= 0 {
		return nil, fmt.Errorf("audit: stream interval must be positive")
	}

	// Start watching from "now" — don't replay history.
	var lastID int64
	err = a.bus.pool.QueryRow(ctx, `SELECT COALESCE(MAX(id), 0) FROM audit_log`).Scan(&lastID)
	if err != nil {
		return nil, fmt.Errorf("audit: stream init: %w", err)
	}

	watchCtx, cancel := context.WithCancel(ctx)
	done := make(chan struct{})

	go func() {
		defer close(done)
		ticker := time.NewTicker(interval)
		defer ticker.Stop()

		for {
			select {
			case <-watchCtx.Done():
				return
			case <-ticker.C:
				newEntries, newLast, err := a.pollSince(watchCtx, lastID, f)
				if err != nil {
					if watchCtx.Err() != nil {
						return
					}
					a.bus.logger.Warn("audit: stream poll failed", "error", err)
					continue
				}
				for _, e := range newEntries {
					onEntry(e)
				}
				if newLast > lastID {
					lastID = newLast
				}
			}
		}
	}()

	return func() { cancel(); <-done }, nil
}

// pollSince fetches audit entries with id > since that match f, oldest first.
func (a *Audit) pollSince(ctx context.Context, sinceID int64, f AuditFilter) ([]AuditEntry, int64, error) {
	clauses, args := buildAuditClauses(f)
	args = append(args, sinceID)
	clauses = append(clauses, fmt.Sprintf("id > $%d", len(args)))

	limit := f.Limit
	if limit <= 0 {
		limit = 1000
	}
	args = append(args, limit)

	q := fmt.Sprintf(`SELECT id, actor_id, action, detail_json, recorded_at
		FROM audit_log WHERE %s ORDER BY id ASC LIMIT $%d`,
		strings.Join(clauses, " AND "), len(args))

	rows, err := a.bus.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, sinceID, err
	}
	defer rows.Close()

	var entries []AuditEntry
	last := sinceID
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.Actor, &e.Action, &e.Detail, &e.RecordedAt); err != nil {
			return nil, last, err
		}
		entries = append(entries, e)
		if e.ID > last {
			last = e.ID
		}
	}
	return entries, last, rows.Err()
}

// buildAuditQuery assembles the SELECT for one-shot Query calls.
func buildAuditQuery(f AuditFilter) (string, []any) {
	clauses, args := buildAuditClauses(f)

	limit := f.Limit
	if limit <= 0 {
		limit = 1000
	}
	args = append(args, limit)

	where := ""
	if len(clauses) > 0 {
		where = "WHERE " + strings.Join(clauses, " AND ")
	}

	q := fmt.Sprintf(`SELECT id, actor_id, action, detail_json, recorded_at
		FROM audit_log %s ORDER BY recorded_at DESC LIMIT $%d`, where, len(args))
	return q, args
}

// buildAuditClauses returns the WHERE-clause fragments and bound args for an
// AuditFilter (without leading "WHERE"). Empty clauses for a zero-value filter.
func buildAuditClauses(f AuditFilter) ([]string, []any) {
	var clauses []string
	var args []any

	if f.Actor != "" {
		args = append(args, f.Actor)
		clauses = append(clauses, fmt.Sprintf("actor_id = $%d", len(args)))
	}
	if f.Action != "" {
		args = append(args, f.Action)
		clauses = append(clauses, fmt.Sprintf("action = $%d", len(args)))
	}
	if !f.FromTime.IsZero() {
		args = append(args, f.FromTime)
		clauses = append(clauses, fmt.Sprintf("recorded_at >= $%d", len(args)))
	}
	if !f.ToTime.IsZero() {
		args = append(args, f.ToTime)
		clauses = append(clauses, fmt.Sprintf("recorded_at < $%d", len(args)))
	}
	return clauses, args
}
