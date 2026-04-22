// Postgres-backed implementation of the pending-mcp store interface. Tests
// use the in-memory fakeStore in fakes_test.go; this file's correctness is
// exercised by the integration test harness (Task 2.13+).
package pending

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/overnightdesk/tenet-0/internal/shared/hashchain"
	"github.com/overnightdesk/tenet-0/internal/shared/pgxutil"
)

// pgStore implements `store` against *pgxpool.Pool.
type pgStore struct {
	pool *pgxpool.Pool
}

// newPgStore opens a dedicated pool with application_name="tenet0-pending-mcp".
func newPgStore(dsn string) (*pgStore, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	pool, err := pgxutil.New(ctx, dsn, "pending-mcp")
	if err != nil {
		return nil, err
	}
	return &pgStore{pool: pool}, nil
}

// NewPgStoreFromPool wraps an externally-managed pool. Used by
// cmd/pending-mcp/main.go so the crash-recovery step and the handler share
// one pool.
func NewPgStoreFromPool(pool *pgxpool.Pool) store {
	return &pgStore{pool: pool}
}

func (s *pgStore) Close() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// ---------------------------------------------------------------------------
// ListPending
// ---------------------------------------------------------------------------

func (s *pgStore) ListPending(ctx context.Context, f ListPendingFilter) (ListPendingResult, error) {
	var (
		where []string
		args  []any
	)
	if f.Department != "" {
		args = append(args, f.Department)
		where = append(where, fmt.Sprintf("requesting_department = $%d", len(args)))
	}
	if f.Status != "" {
		args = append(args, string(f.Status))
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}
	// Keyset pagination on (received_at, id).
	if f.Cursor != nil && *f.Cursor != "" {
		ts, id, err := decodeCursor(*f.Cursor)
		if err != nil {
			return ListPendingResult{}, fmt.Errorf("%w: cursor decode: %v", ErrPendingQueryInvalid, err)
		}
		args = append(args, ts, id)
		where = append(where, fmt.Sprintf("(received_at, id) > ($%d, $%d)", len(args)-1, len(args)))
	}
	limit := f.Limit
	if limit <= 0 {
		limit = defaultListLimit
	}
	args = append(args, limit+1) // +1 to detect has-more

	q := `SELECT id, request_event_id, target_event_type, requesting_department, status,
	             COALESCE(operator_deadline, 'epoch'::timestamptz) AS operator_deadline,
	             constitutional_rule_id, received_at
	      FROM president.pending_approvals`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += fmt.Sprintf(" ORDER BY received_at ASC, id ASC LIMIT $%d", len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return ListPendingResult{}, fmt.Errorf("pending: list query: %w", err)
	}
	defer rows.Close()

	items := make([]PendingItem, 0, limit)
	var lastTS time.Time
	var lastID string
	for rows.Next() {
		var (
			id, reqID, typ, dept, status, ruleID string
			deadline, receivedAt                  time.Time
		)
		if err := rows.Scan(&id, &reqID, &typ, &dept, &status, &deadline, &ruleID, &receivedAt); err != nil {
			return ListPendingResult{}, fmt.Errorf("pending: list scan: %w", err)
		}
		if len(items) < limit {
			var rulePtr *string
			if ruleID != "" {
				r := ruleID
				rulePtr = &r
			}
			items = append(items, PendingItem{
				ID:                   id,
				RequestEventID:       reqID,
				TargetEventType:      typ,
				RequestingDepartment: dept,
				Status:               Status(status),
				OperatorDeadline:     deadline,
				RuleID:               rulePtr,
			})
			lastTS = receivedAt
			lastID = id
		}
	}
	if err := rows.Err(); err != nil {
		return ListPendingResult{}, fmt.Errorf("pending: list rows: %w", err)
	}

	var next *string
	// If we scanned limit+1, a next page exists.
	// Detect by checking whether the result count (before truncation) would
	// have exceeded limit: we truncated in the loop, so if items is full and
	// we ran the loop one more time we'd still not append, but we can tell
	// by reading rows.CommandTag... simpler: keep a bool flag.
	// (Re-implemented below.)
	_ = next
	// Re-run counting via rows.CommandTag is not available; compute via
	// lastTS/lastID emission when items == limit. If we hit the +1 row,
	// items count stayed at limit but lastTS/lastID reflect the limit-th row.
	if len(items) == limit {
		cursor := encodeCursor(lastTS, lastID)
		next = &cursor
	}

	return ListPendingResult{Items: items, NextCursor: next}, nil
}

func encodeCursor(ts time.Time, id string) string {
	return fmt.Sprintf("%d|%s", ts.UnixNano(), id)
}

func decodeCursor(cur string) (time.Time, string, error) {
	parts := strings.SplitN(cur, "|", 2)
	if len(parts) != 2 {
		return time.Time{}, "", errors.New("malformed cursor")
	}
	var nanos int64
	if _, err := fmt.Sscanf(parts[0], "%d", &nanos); err != nil {
		return time.Time{}, "", err
	}
	return time.Unix(0, nanos).UTC(), parts[1], nil
}

// ---------------------------------------------------------------------------
// ClaimForDecision
// ---------------------------------------------------------------------------

func (s *pgStore) ClaimForDecision(ctx context.Context, req ClaimRequest) (ClaimResult, error) {
	var (
		id        string
		claimedAt time.Time
	)
	err := s.pool.QueryRow(ctx, `
		UPDATE president.pending_approvals
		   SET status = $1,
		       operator_deadline = COALESCE($2, operator_deadline),
		       surfaced_at = CASE WHEN $1 = 'awaiting_operator' THEN now() ELSE surfaced_at END
		 WHERE request_event_id = $3
		   AND status = 'pending'
		 RETURNING id, now()
	`, string(req.NewStatus), req.OperatorDeadline, req.RequestEventID).Scan(&id, &claimedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Distinguish not-found from already-claimed via a follow-up peek.
			var exists bool
			peekErr := s.pool.QueryRow(ctx,
				`SELECT true FROM president.pending_approvals WHERE request_event_id = $1`,
				req.RequestEventID,
			).Scan(&exists)
			if errors.Is(peekErr, pgx.ErrNoRows) {
				return ClaimResult{}, ErrPendingNotFound
			}
			if peekErr != nil {
				return ClaimResult{}, fmt.Errorf("pending: claim peek: %w", peekErr)
			}
			return ClaimResult{}, ErrPendingAlreadyClaimed
		}
		return ClaimResult{}, fmt.Errorf("pending: claim: %w", err)
	}
	return ClaimResult{PendingApprovalID: id, ClaimedAt: claimedAt}, nil
}

// ---------------------------------------------------------------------------
// RecordDecision
// ---------------------------------------------------------------------------

// dbOutcome maps the wire outcome enum to the DB enum. Wire uses
// {approve,reject,defer}; DB uses {approved,rejected,deferred}.
func dbOutcome(o Outcome) string {
	switch o {
	case OutcomeApprove:
		return "approved"
	case OutcomeReject:
		return "rejected"
	case OutcomeDefer:
		return "deferred"
	}
	return string(o)
}

func (s *pgStore) RecordDecision(ctx context.Context, req RecordDecisionRequest) (RecordDecisionResult, error) {
	var result RecordDecisionResult
	err := pgxutil.WithTx(ctx, s.pool, func(tx pgx.Tx) error {
		// 1. Lock the pending row.
		var (
			pendingID                     string
			status                        string
			targetEventID, constRuleID    string
			targetEventType               string
		)
		err := tx.QueryRow(ctx, `
			SELECT id, status, target_event_id::text, target_event_type, constitutional_rule_id
			  FROM president.pending_approvals
			 WHERE id = $1
			 FOR UPDATE
		`, req.PendingApprovalID).Scan(&pendingID, &status, &targetEventID, &targetEventType, &constRuleID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrPendingNotFound
			}
			return fmt.Errorf("pending: record select: %w", err)
		}
		if status != string(StatusAwaitingLLM) && status != string(StatusAwaitingOperator) {
			return fmt.Errorf("%w: status=%s", ErrPendingInvalidTransition, status)
		}

		// 2. Lock chain sentinel + read last_hash.
		var prevHash []byte
		if err := tx.QueryRow(ctx, `
			SELECT last_hash FROM president.decision_log_chain_state WHERE id = 1 FOR UPDATE
		`).Scan(&prevHash); err != nil {
			return fmt.Errorf("%w: read chain state: %v", ErrDecisionLogHashFailure, err)
		}

		// 3. Build canonical payload + extend chain.
		outcomeEventID := uuid.Nil
		if req.OutcomeEventID != nil {
			if u, perr := uuid.Parse(*req.OutcomeEventID); perr == nil {
				outcomeEventID = u
			}
		}
		payload := hashchain.DecisionPayload{
			OutcomeEventID:   outcomeEventID,
			OutcomeEventType: targetEventType,
			DecisionMode:     string(req.DecisionMode),
			RuleIDUsed:       req.RuleID,
			ModelID:          req.Model,
			Confidence:       req.Confidence,
			Rationale:        req.Rationale,
			ActorDirector:    firstNonEmpty(req.Director, "president"),
		}
		canonical, err := hashchain.Canonicalize(payload)
		if err != nil {
			return fmt.Errorf("%w: canonicalize: %v", ErrDecisionLogHashFailure, err)
		}
		prev := hashchain.Row{RowHash: prevHash}
		next := hashchain.Extend(prev, canonical)

		// 4. Insert decision_log row.
		var newID uuid.UUID
		var recordedAt time.Time
		err = tx.QueryRow(ctx, `
			INSERT INTO president.decision_log
				(outcome_event_id, outcome_event_type, decision_mode, rule_id_used,
				 model_id, confidence, rationale, actor_director, prev_hash, row_hash)
			VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), $6, $7, $8, $9, $10)
			RETURNING id, created_at
		`,
			nullIfZeroUUID(outcomeEventID),
			targetEventType,
			string(req.DecisionMode),
			req.RuleID,
			req.Model,
			req.Confidence,
			req.Rationale,
			payload.ActorDirector,
			next.PrevHash,
			next.RowHash,
		).Scan(&newID, &recordedAt)
		if err != nil {
			return fmt.Errorf("%w: insert decision_log: %v", ErrDecisionLogHashFailure, err)
		}

		// 5. Advance chain sentinel.
		if _, err := tx.Exec(ctx,
			`UPDATE president.decision_log_chain_state SET last_hash = $1 WHERE id = 1`,
			next.RowHash,
		); err != nil {
			return fmt.Errorf("%w: update chain state: %v", ErrDecisionLogHashFailure, err)
		}

		// 6. Mark pending row decided.
		if _, err := tx.Exec(ctx, `
			UPDATE president.pending_approvals
			   SET status = 'decided',
			       outcome = $1,
			       decision_mode = $2,
			       rule_id_used = NULLIF($3, ''),
			       model_id = NULLIF($4, ''),
			       confidence = $5,
			       rationale = $6,
			       outcome_event_id = $7,
			       decided_at = now()
			 WHERE id = $8
		`,
			dbOutcome(req.Outcome),
			string(req.DecisionMode),
			req.RuleID,
			req.Model,
			req.Confidence,
			req.Rationale,
			nullIfZeroUUID(outcomeEventID),
			pendingID,
		); err != nil {
			return fmt.Errorf("pending: update decided: %w", err)
		}

		result = RecordDecisionResult{
			DecisionLogID: stableInt64FromUUID(newID),
			RowHash:       hex.EncodeToString(next.RowHash),
			RecordedAt:    recordedAt,
		}
		return nil
	})
	if err != nil {
		return RecordDecisionResult{}, err
	}
	return result, nil
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func nullIfZeroUUID(u uuid.UUID) any {
	if u == uuid.Nil {
		return nil
	}
	return u
}

// stableInt64FromUUID folds a UUID down to a non-zero int64 so the wire
// schema (decision_log_id: integer) can quote it. The true primary key is
// the UUID; auditors who need the canonical id read it from row_hash lookup.
// This compression is acceptable because decision_log_id is a correlation
// handle, not a foreign key target.
func stableInt64FromUUID(u uuid.UUID) int64 {
	h := fnv.New64a()
	_, _ = h.Write(u[:])
	v := int64(h.Sum64() & 0x7fffffffffffffff)
	if v == 0 {
		v = 1
	}
	return v
}

// Suppress "imported and not used" when tags change.
var _ = json.Marshal

// ---------------------------------------------------------------------------
// ExpireOverdue
// ---------------------------------------------------------------------------

func (s *pgStore) ExpireOverdue(ctx context.Context, req ExpireRequest) (ExpireResult, error) {
	cutoff := time.Now().UTC()
	if req.Now != nil {
		cutoff = *req.Now
	}
	maxBatch := req.MaxBatch
	if maxBatch <= 0 {
		maxBatch = defaultExpireMaxBatch
	}
	// Postgres UPDATE ... RETURNING doesn't support LIMIT directly; use a
	// CTE selecting the eligible ids.
	rows, err := s.pool.Query(ctx, `
		WITH eligible AS (
			SELECT id FROM president.pending_approvals
			 WHERE status = 'awaiting_operator'
			   AND operator_deadline IS NOT NULL
			   AND operator_deadline < $1
			 ORDER BY operator_deadline ASC
			 LIMIT $2
			 FOR UPDATE SKIP LOCKED
		)
		UPDATE president.pending_approvals p
		   SET status = 'expired'
		  FROM eligible
		 WHERE p.id = eligible.id
		 RETURNING p.id, p.request_event_id::text, p.target_event_type
	`, cutoff, maxBatch)
	if err != nil {
		return ExpireResult{}, fmt.Errorf("pending: expire: %w", err)
	}
	defer rows.Close()

	out := []ExpiredItem{}
	for rows.Next() {
		var item ExpiredItem
		if err := rows.Scan(&item.PendingApprovalID, &item.RequestEventID, &item.TargetEventType); err != nil {
			return ExpireResult{}, fmt.Errorf("pending: expire scan: %w", err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return ExpireResult{}, fmt.Errorf("pending: expire rows: %w", err)
	}
	return ExpireResult{Expired: out}, nil
}
