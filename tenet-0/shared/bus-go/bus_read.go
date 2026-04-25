// Read API — historical query, single fetch, causality walk, and a polling
// "unprocessed events" primitive. Added Task 2.2 to close Feature 49's
// sdk-api.md drift (spec promised "President can query historical events"
// but the shipped SDK only exposed Subscribe + Audit.Query). See
// .specify/specs/49-event-bus-constitution-governor/contracts/sdk-api.md
// "Read API" section.

package bus

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ---------------------------------------------------------------------------
// QueryEvents
// ---------------------------------------------------------------------------

// QueryFilter constrains a QueryEvents call.
//
// EventTypePattern uses the same shape as Subscribe's pattern:
//   - "" (empty)                 -> all events
//   - "dept.subject.verb"        -> exact match
//   - "dept.*"                   -> prefix match
//   - "*.verb"                   -> suffix match
//   - "*"                        -> all events
type QueryFilter struct {
	EventTypePattern string
	SourceDepartment string
	StartTime        *time.Time
	EndTime          *time.Time
	Limit            int
	// Cursor is an opaque keyset pagination cursor returned as
	// QueryResult.NextCursor from a prior call. Empty on first page.
	Cursor string
}

// QueryResult is the paginated result of QueryEvents.
type QueryResult struct {
	Events     []Event
	NextCursor string
}

// queryLimitMax/Default are shared by QueryEvents and bounded by the contract.
const (
	queryLimitDefault = 100
	queryLimitMax     = 1000
)

// QueryEvents returns events matching the filter in published_at/id order
// (oldest first). Uses keyset pagination on (published_at, id) so cursor
// paging is stable under concurrent inserts.
func (b *Bus) QueryEvents(ctx context.Context, filter QueryFilter) (QueryResult, error) {
	if filter.StartTime != nil && filter.EndTime != nil && filter.StartTime.After(*filter.EndTime) {
		return QueryResult{}, ErrQueryInvalid
	}

	limit := filter.Limit
	if limit <= 0 {
		limit = queryLimitDefault
	}
	if limit > queryLimitMax {
		limit = queryLimitMax
	}

	// Decode cursor: "<rfc3339nano>|<id>". Empty -> no cursor.
	var curTs *time.Time
	var curID string
	if filter.Cursor != "" {
		idx := strings.IndexByte(filter.Cursor, '|')
		if idx <= 0 || idx == len(filter.Cursor)-1 {
			return QueryResult{}, fmt.Errorf("%w: malformed cursor", ErrQueryInvalid)
		}
		ts, err := time.Parse(time.RFC3339Nano, filter.Cursor[:idx])
		if err != nil {
			return QueryResult{}, fmt.Errorf("%w: malformed cursor timestamp", ErrQueryInvalid)
		}
		curTs = &ts
		curID = filter.Cursor[idx+1:]
	}

	// Build WHERE clause dynamically.
	var (
		where []string
		args  []any
	)
	add := func(clauseFmt string, v any) {
		args = append(args, v)
		where = append(where, fmt.Sprintf(clauseFmt, len(args)))
	}

	if filter.EventTypePattern != "" && filter.EventTypePattern != "*" {
		add("event_type LIKE $%d", parsePattern(filter.EventTypePattern).toLike())
	}
	if filter.SourceDepartment != "" {
		add("source_department_id = $%d", filter.SourceDepartment)
	}
	if filter.StartTime != nil {
		add("published_at >= $%d", *filter.StartTime)
	}
	if filter.EndTime != nil {
		add("published_at <= $%d", *filter.EndTime)
	}
	if curTs != nil {
		args = append(args, *curTs, curID)
		where = append(where, fmt.Sprintf("(published_at, id) > ($%d, $%d)", len(args)-1, len(args)))
	}

	args = append(args, limit)
	limIdx := fmt.Sprintf("$%d", len(args))

	sql := `SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
	          FROM events`
	if len(where) > 0 {
		sql += " WHERE " + strings.Join(where, " AND ")
	}
	sql += " ORDER BY published_at ASC, id ASC LIMIT " + limIdx

	rows, err := b.pool.Query(ctx, sql, args...)
	if err != nil {
		return QueryResult{}, fmt.Errorf("bus: query events: %w", err)
	}
	defer rows.Close()

	var out []Event
	for rows.Next() {
		var e Event
		var parent *string
		if err := rows.Scan(&e.ID, &e.Type, &e.Source, &e.Payload, &parent, &e.PublishedAt); err != nil {
			return QueryResult{}, fmt.Errorf("bus: query events scan: %w", err)
		}
		if parent != nil {
			e.ParentID = *parent
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return QueryResult{}, fmt.Errorf("bus: query events: %w", err)
	}

	var nextCursor string
	if len(out) == limit && limit > 0 {
		last := out[len(out)-1]
		nextCursor = last.PublishedAt.UTC().Format(time.RFC3339Nano) + "|" + last.ID
	}
	return QueryResult{Events: out, NextCursor: nextCursor}, nil
}

// ---------------------------------------------------------------------------
// GetEvent
// ---------------------------------------------------------------------------

// GetEvent returns one event by ID. Returns ErrNotFound if absent.
func (b *Bus) GetEvent(ctx context.Context, eventID string) (Event, error) {
	row := b.pool.QueryRow(ctx,
		`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
		   FROM events WHERE id = $1`, eventID)
	var e Event
	var parent *string
	if err := row.Scan(&e.ID, &e.Type, &e.Source, &e.Payload, &parent, &e.PublishedAt); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return Event{}, ErrNotFound
		}
		return Event{}, fmt.Errorf("bus: get event: %w", err)
	}
	if parent != nil {
		e.ParentID = *parent
	}
	return e, nil
}

// ---------------------------------------------------------------------------
// WalkCausality
// ---------------------------------------------------------------------------

// WalkDirection selects ancestors (parent chain) or descendants (children).
type WalkDirection string

const (
	WalkAncestors   WalkDirection = "ancestors"
	WalkDescendants WalkDirection = "descendants"
)

// WalkTermination explains why the walk stopped.
type WalkTermination string

const (
	WalkReachedRoot   WalkTermination = "reached_root"
	WalkMaxDepth      WalkTermination = "max_depth"
	WalkCycleDetected WalkTermination = "cycle_detected"
)

// WalkOptions tunes WalkCausality.
type WalkOptions struct {
	MaxDepth  int
	Direction WalkDirection
}

// WalkResult is the result of WalkCausality.
type WalkResult struct {
	Chain            []Event
	TerminatedReason WalkTermination
}

const (
	walkDepthDefault = 10
	walkDepthMax     = 50
)

// WalkCausality traverses a causality chain starting at eventID. For
// WalkAncestors, follows parent_event_id until a root is reached (no parent)
// or MaxDepth. For WalkDescendants, follows children (events with
// parent_event_id = current.id) breadth-first.
//
// Cycle detection: a cycle terminates the walk with WalkCycleDetected; the
// duplicated node is NOT appended.
//
// Returns ErrNotFound if eventID does not exist.
func (b *Bus) WalkCausality(ctx context.Context, eventID string, opts WalkOptions) (WalkResult, error) {
	max := opts.MaxDepth
	if max <= 0 {
		max = walkDepthDefault
	}
	if max > walkDepthMax {
		max = walkDepthMax
	}
	dir := opts.Direction
	if dir == "" {
		dir = WalkAncestors
	}

	// Seed: fetch the starting event (also yields NotFound semantics).
	seed, err := b.GetEvent(ctx, eventID)
	if err != nil {
		return WalkResult{}, err
	}
	chain := []Event{seed}
	visited := map[string]struct{}{seed.ID: {}}

	if dir == WalkAncestors {
		cur := seed
		for depth := 1; depth <= max; depth++ {
			if cur.ParentID == "" {
				return WalkResult{Chain: chain, TerminatedReason: WalkReachedRoot}, nil
			}
			if _, seen := visited[cur.ParentID]; seen {
				return WalkResult{Chain: chain, TerminatedReason: WalkCycleDetected}, nil
			}
			next, err := b.GetEvent(ctx, cur.ParentID)
			if err != nil {
				if errors.Is(err, ErrNotFound) {
					// Dangling parent: treat as root.
					return WalkResult{Chain: chain, TerminatedReason: WalkReachedRoot}, nil
				}
				return WalkResult{}, err
			}
			visited[next.ID] = struct{}{}
			chain = append(chain, next)
			cur = next
		}
		return WalkResult{Chain: chain, TerminatedReason: WalkMaxDepth}, nil
	}

	// Descendants: BFS one level at a time. Track frontier.
	frontier := []string{seed.ID}
	for depth := 1; depth <= max; depth++ {
		if len(frontier) == 0 {
			return WalkResult{Chain: chain, TerminatedReason: WalkReachedRoot}, nil
		}
		rows, err := b.pool.Query(ctx,
			`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
			   FROM events WHERE parent_event_id = ANY($1)
			  ORDER BY published_at ASC, id ASC`,
			frontier)
		if err != nil {
			return WalkResult{}, fmt.Errorf("bus: walk descendants: %w", err)
		}
		var nextFrontier []string
		for rows.Next() {
			var e Event
			var parent *string
			if err := rows.Scan(&e.ID, &e.Type, &e.Source, &e.Payload, &parent, &e.PublishedAt); err != nil {
				rows.Close()
				return WalkResult{}, fmt.Errorf("bus: walk descendants scan: %w", err)
			}
			if parent != nil {
				e.ParentID = *parent
			}
			if _, seen := visited[e.ID]; seen {
				rows.Close()
				return WalkResult{Chain: chain, TerminatedReason: WalkCycleDetected}, nil
			}
			visited[e.ID] = struct{}{}
			chain = append(chain, e)
			nextFrontier = append(nextFrontier, e.ID)
		}
		rows.Close()
		frontier = nextFrontier
	}
	if len(frontier) == 0 {
		return WalkResult{Chain: chain, TerminatedReason: WalkReachedRoot}, nil
	}
	return WalkResult{Chain: chain, TerminatedReason: WalkMaxDepth}, nil
}

// ---------------------------------------------------------------------------
// ListUnprocessedEvents (CL-1 polling primitive)
// ---------------------------------------------------------------------------

// ListUnprocessedRequest configures ListUnprocessedEvents.
type ListUnprocessedRequest struct {
	Limit int
	// SinceEventID is an opaque high-water-mark cursor returned as
	// HighWaterMark from a prior call. Empty means "from the beginning".
	SinceEventID string
}

// ListUnprocessedResult is the result of ListUnprocessedEvents.
type ListUnprocessedResult struct {
	Events        []Event
	HighWaterMark string
}

const (
	listUnprocessedDefault = 50
	listUnprocessedMax     = 500
)

// ListUnprocessedEvents returns events newer than SinceEventID in publish
// order. The returned HighWaterMark is the id of the last row; callers pass
// it back as SinceEventID next call to poll only new rows.
//
// This is an MVP polling implementation — no department scoping. Access is
// gated at the MCP layer. Caller passes an empty SinceEventID on cold start
// (returns the oldest N events).
func (b *Bus) ListUnprocessedEvents(ctx context.Context, req ListUnprocessedRequest) (ListUnprocessedResult, error) {
	limit := req.Limit
	if limit <= 0 {
		limit = listUnprocessedDefault
	}
	if limit > listUnprocessedMax {
		limit = listUnprocessedMax
	}

	var rows pgx.Rows
	var err error
	if req.SinceEventID == "" {
		rows, err = b.pool.Query(ctx,
			`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
			   FROM events
			  ORDER BY published_at ASC, id ASC
			  LIMIT $1`,
			limit)
	} else {
		rows, err = b.pool.Query(ctx,
			`SELECT id, event_type, source_department_id, payload, parent_event_id, published_at
			   FROM events
			  WHERE (published_at, id) > (
			        (SELECT published_at FROM events WHERE id = $1),
			        $1
			    )
			  ORDER BY published_at ASC, id ASC
			  LIMIT $2`,
			req.SinceEventID, limit)
	}
	if err != nil {
		return ListUnprocessedResult{}, fmt.Errorf("bus: list unprocessed: %w", err)
	}
	defer rows.Close()

	var out []Event
	for rows.Next() {
		var e Event
		var parent *string
		if err := rows.Scan(&e.ID, &e.Type, &e.Source, &e.Payload, &parent, &e.PublishedAt); err != nil {
			return ListUnprocessedResult{}, fmt.Errorf("bus: list unprocessed scan: %w", err)
		}
		if parent != nil {
			e.ParentID = *parent
		}
		out = append(out, e)
	}
	if err := rows.Err(); err != nil {
		return ListUnprocessedResult{}, fmt.Errorf("bus: list unprocessed: %w", err)
	}

	var hwm string
	if len(out) > 0 {
		hwm = out[len(out)-1].ID
	}
	return ListUnprocessedResult{Events: out, HighWaterMark: hwm}, nil
}
