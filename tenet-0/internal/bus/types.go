// Package bus implements the tenet0-bus-mcp tool handlers — a thin MCP
// adapter over the Feature 49 bus client (shared/bus-go). Each method
// corresponds to one tool in
// .specify/specs/50-tenet0-director-runtime/contracts/mcp-tool-contracts.yaml
// (servers.tenet0-bus-mcp).
package bus

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"regexp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/overnightdesk/tenet-0/internal/shared/credentials"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
	"github.com/overnightdesk/tenet-0/internal/shared/pgxutil"
	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

// ---------------------------------------------------------------------------
// Typed error sentinels — one per contract errorCode for tenet0-bus-mcp.
// Handlers return these; toolErrorCode maps them to the wire code string.
// ---------------------------------------------------------------------------

var (
	// ErrBusUnauthorized: credential missing or revoked.
	ErrBusUnauthorized = errors.New("bus-mcp: unauthorized")

	// ErrBusNamespaceViolation: event_type prefix does not match the
	// caller's department namespace (FR-2a).
	ErrBusNamespaceViolation = errors.New("bus-mcp: namespace violation")

	// ErrBusRuleViolation: a constitution rule rejected the publish (FR-11).
	ErrBusRuleViolation = errors.New("bus-mcp: rule violation")

	// ErrBusPayloadInvalid: input failed JSON Schema / format validation
	// (e.g. event_type does not match the dotted-namespace regex).
	ErrBusPayloadInvalid = errors.New("bus-mcp: payload invalid")

	// ErrBusDown: transport failure talking to the bus (PostgreSQL down,
	// pool exhausted, deadline exceeded).
	ErrBusDown = errors.New("bus-mcp: bus down")

	// ErrBusDuplicateIdempotency: the same idempotency_key was used with a
	// different payload within the dedup window.
	ErrBusDuplicateIdempotency = errors.New("bus-mcp: duplicate idempotency key")

	// ErrBusNotFound: the requested event_id does not exist (or the caller
	// has no subscription right that would let them see it).
	ErrBusNotFound = errors.New("bus-mcp: not found")

	// ErrBusQueryInvalid: the query parameters are mutually inconsistent
	// (e.g. end_time before start_time).
	ErrBusQueryInvalid = errors.New("bus-mcp: query invalid")
)

// toolErrorCode maps a handler-returned sentinel to the wire `code` string
// declared in the contract's errorCodes list. Unknown errors map to
// "INTERNAL" — handlers are expected to wrap with errors.Join/fmt.Errorf
// using `%w` so errors.Is sees the sentinel.
func toolErrorCode(err error) string {
	switch {
	case err == nil:
		return ""
	case errors.Is(err, ErrBusUnauthorized):
		return "BUS_UNAUTHORIZED"
	case errors.Is(err, ErrBusNamespaceViolation):
		return "BUS_NAMESPACE_VIOLATION"
	case errors.Is(err, ErrBusRuleViolation):
		return "BUS_RULE_VIOLATION"
	case errors.Is(err, ErrBusPayloadInvalid):
		return "BUS_PAYLOAD_INVALID"
	case errors.Is(err, ErrBusDown):
		return "BUS_DOWN"
	case errors.Is(err, ErrBusDuplicateIdempotency):
		return "BUS_DUPLICATE_IDEMPOTENCY"
	case errors.Is(err, ErrBusNotFound):
		return "BUS_NOT_FOUND"
	case errors.Is(err, ErrBusQueryInvalid):
		return "BUS_QUERY_INVALID"
	default:
		return "INTERNAL"
	}
}

// ---------------------------------------------------------------------------
// Test seam: busClient is the subset of the real *busgo.Bus surface that the
// handler actually uses. Tests provide a fake; production wires *busgo.Bus.
//
// QueryEvents / GetEvent / WalkCausality / ListUnprocessedEvents are NOT yet
// in shared/bus-go (Feature 49 only ships Publish + Subscribe). Task 2.2
// will either extend bus-go with these read methods or implement them here
// against the pool. The interface lives here so the contract is defined
// before that decision is made.
// ---------------------------------------------------------------------------

// busClient is the abstract bus-mcp dependency. The real implementation is
// satisfied by a thin wrapper around *busgo.Bus + *pgxpool.Pool; tests use
// a fakeBus that captures calls and returns canned data.
type busClient interface {
	Publish(ctx context.Context, eventType string, payload json.RawMessage, opts ...busgo.PublishOption) (string, error)

	QueryEvents(ctx context.Context, q QueryEventsRequest) ([]Event, string, error)
	GetEvent(ctx context.Context, eventID string) (Event, error)
	WalkCausality(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error)
	ListUnprocessedEvents(ctx context.Context, req ListUnprocessedEventsRequest) ([]Event, *string, error)

	Close()
}

// ---------------------------------------------------------------------------
// Handler — the package's central type. One Handler per bus-mcp process.
// ---------------------------------------------------------------------------

// Handler owns the bus client, the per-Director credential verifier, the
// pgx pool (for read-side queries that bypass bus-go), and the logger.
type Handler struct {
	bus      busClient
	verifier *credentials.Verifier
	pool     *pgxpool.Pool
	logger   *slog.Logger

	// department is the namespace prefix the caller is bound to. Used to
	// pre-validate event_type before paying the round-trip cost.
	department string
}

// Config is the constructor input.
type Config struct {
	// Department is the calling Director's department slug
	// (e.g. "ops", "fin", "president"). Must match the credential.
	Department string

	// Credential is the bearer token shared with bus-go and verified
	// server-side against departments.credential_hash.
	Credential string

	// PostgresURL is the libpq DSN; passed through to bus-go and used for
	// read-side queries (query_events, get_event, walk_causality,
	// list_unprocessed_events).
	PostgresURL string

	// HMACSecret is the per-Director HMAC secret used by the request
	// verifier (security §3 / research.md §MCP Server Auth).
	HMACSecret []byte

	// Logger is required; nil returns an error from New.
	Logger *slog.Logger
}

// New constructs a Handler, validates the Config, opens the bus connection,
// pings the pool, and returns the Handler. Caller owns Close.
func New(cfg Config) (*Handler, error) {
	if cfg.Logger == nil {
		return nil, errors.New("bus.New: Logger is required")
	}
	if cfg.Department == "" {
		return nil, errors.New("bus.New: Department is required")
	}
	if cfg.Credential == "" {
		return nil, errors.New("bus.New: Credential is required")
	}
	if cfg.PostgresURL == "" {
		return nil, errors.New("bus.New: PostgresURL is required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := pgxutil.New(ctx, cfg.PostgresURL, "bus-mcp")
	if err != nil {
		return nil, fmt.Errorf("bus.New: pool: %w", err)
	}

	b, err := busgo.Connect(ctx, busgo.Config{
		PostgresURL: cfg.PostgresURL,
		Department:  cfg.Department,
		Credential:  cfg.Credential,
	})
	if err != nil {
		pool.Close()
		return nil, fmt.Errorf("bus.New: connect bus-go: %w", err)
	}

	return &Handler{
		bus:        busgoAdapter{b: b},
		verifier:   credentials.New([]byte(cfg.HMACSecret)),
		pool:       pool,
		logger:     cfg.Logger,
		department: cfg.Department,
	}, nil
}

// Close releases the bus client and pool.
func (h *Handler) Close() {
	if h.bus != nil {
		h.bus.Close()
	}
	if h.pool != nil {
		h.pool.Close()
	}
}

// ---------------------------------------------------------------------------
// busgoAdapter wraps *busgo.Bus to satisfy the busClient interface. Needed
// because bus-go exposes native filter/opts structs; the adapter translates
// the MCP request shapes to those.
// ---------------------------------------------------------------------------

type busgoAdapter struct {
	b *busgo.Bus
}

func (a busgoAdapter) Publish(ctx context.Context, eventType string, payload json.RawMessage, opts ...busgo.PublishOption) (string, error) {
	return a.b.Publish(ctx, eventType, payload, opts...)
}

func (a busgoAdapter) QueryEvents(ctx context.Context, q QueryEventsRequest) ([]Event, string, error) {
	filter := busgo.QueryFilter{
		EventTypePattern: q.EventTypePattern,
		SourceDepartment: q.SourceDepartment,
		StartTime:        q.StartTime,
		EndTime:          q.EndTime,
		Limit:            q.Limit,
	}
	if q.Cursor != nil {
		filter.Cursor = *q.Cursor
	}
	res, err := a.b.QueryEvents(ctx, filter)
	if err != nil {
		return nil, "", err
	}
	return convertEvents(res.Events), res.NextCursor, nil
}

func (a busgoAdapter) GetEvent(ctx context.Context, eventID string) (Event, error) {
	e, err := a.b.GetEvent(ctx, eventID)
	if err != nil {
		return Event{}, err
	}
	return convertEvent(e), nil
}

func (a busgoAdapter) WalkCausality(ctx context.Context, req WalkCausalityRequest) ([]Event, string, error) {
	dir := busgo.WalkAncestors
	if req.Direction == "descendants" {
		dir = busgo.WalkDescendants
	}
	res, err := a.b.WalkCausality(ctx, req.EventID, busgo.WalkOptions{
		MaxDepth:  req.MaxDepth,
		Direction: dir,
	})
	if err != nil {
		return nil, "", err
	}
	return convertEvents(res.Chain), string(res.TerminatedReason), nil
}

func (a busgoAdapter) ListUnprocessedEvents(ctx context.Context, req ListUnprocessedEventsRequest) ([]Event, *string, error) {
	r := busgo.ListUnprocessedRequest{Limit: req.Limit}
	if req.SinceEventID != nil {
		r.SinceEventID = *req.SinceEventID
	}
	res, err := a.b.ListUnprocessedEvents(ctx, r)
	if err != nil {
		return nil, nil, err
	}
	var hwm *string
	if res.HighWaterMark != "" {
		s := res.HighWaterMark
		hwm = &s
	}
	return convertEvents(res.Events), hwm, nil
}

func (a busgoAdapter) Close() { a.b.Close() }

// convertEvent maps busgo.Event → internal/bus.Event (wire shape).
func convertEvent(e busgo.Event) Event {
	ev := Event{
		ID:          e.ID,
		Type:        e.Type,
		Source:      e.Source,
		Payload:     json.RawMessage(e.Payload),
		PublishedAt: e.PublishedAt,
	}
	if e.ParentID != "" {
		pid := e.ParentID
		ev.ParentEventID = &pid
	}
	return ev
}

func convertEvents(in []busgo.Event) []Event {
	if in == nil {
		return nil
	}
	out := make([]Event, len(in))
	for i, e := range in {
		out[i] = convertEvent(e)
	}
	return out
}

// ---------------------------------------------------------------------------
// Error mapping helpers
// ---------------------------------------------------------------------------

// eventTypePattern enforces the `<a>.<b>.<c>` namespace shape at handler
// entry so bad inputs fail locally (no round trip).
var eventTypePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`)

// mapBusError translates a bus-go error into an internal/bus sentinel.
// Used by every handler that calls bus-go so error mapping lives in one spot.
func mapBusError(err error) error {
	if err == nil {
		return nil
	}
	// Already an internal sentinel? Pass through.
	if errors.Is(err, ErrBusUnauthorized) || errors.Is(err, ErrBusNamespaceViolation) ||
		errors.Is(err, ErrBusRuleViolation) || errors.Is(err, ErrBusNotFound) ||
		errors.Is(err, ErrBusQueryInvalid) || errors.Is(err, ErrBusDuplicateIdempotency) ||
		errors.Is(err, ErrBusDown) || errors.Is(err, ErrBusPayloadInvalid) {
		return err
	}
	switch {
	case errors.Is(err, busgo.ErrUnauthenticated):
		return fmt.Errorf("%w: %v", ErrBusUnauthorized, err)
	case errors.Is(err, busgo.ErrNamespaceViolation):
		return fmt.Errorf("%w: %v", ErrBusNamespaceViolation, err)
	case errors.Is(err, busgo.ErrConstitutionRejected):
		return fmt.Errorf("%w: %v", ErrBusRuleViolation, err)
	case errors.Is(err, busgo.ErrCausalityLoop):
		return fmt.Errorf("%w: %v", ErrBusRuleViolation, err)
	case errors.Is(err, busgo.ErrNoConstitution):
		return fmt.Errorf("%w: %v", ErrBusRuleViolation, err)
	case errors.Is(err, busgo.ErrNotFound):
		return fmt.Errorf("%w: %v", ErrBusNotFound, err)
	case errors.Is(err, busgo.ErrQueryInvalid):
		return fmt.Errorf("%w: %v", ErrBusQueryInvalid, err)
	case errors.Is(err, busgo.ErrDuplicateIdempotency):
		return fmt.Errorf("%w: %v", ErrBusDuplicateIdempotency, err)
	case errors.Is(err, busgo.ErrConnectionLost),
		errors.Is(err, context.DeadlineExceeded),
		errors.Is(err, context.Canceled):
		return fmt.Errorf("%w: %v", ErrBusDown, err)
	}
	// Heuristic: bus-go wraps some transport errors with net.* underneath.
	var netErr net.Error
	if errors.As(err, &netErr) {
		return fmt.Errorf("%w: %v", ErrBusDown, err)
	}
	// Client-side idempotency detection: bus-go currently does not expose a
	// typed sentinel for dedup conflicts (SP doesn't track them yet). We
	// detect the concept in the error text so the MCP adapter can surface
	// BUS_DUPLICATE_IDEMPOTENCY consistently once SP support lands.
	if s := err.Error(); strings.Contains(s, "idempotency") {
		return fmt.Errorf("%w: %v", ErrBusDuplicateIdempotency, err)
	}
	return err
}

// ---------------------------------------------------------------------------
// Tool request / response structs — JSON shapes mirror the contract exactly.
// ---------------------------------------------------------------------------

// Event is the wire shape returned for a single event in query/get/walk/list
// responses. Mirrors contract `Event` shape (additionalProperties: true at
// the contract level; we publish a typed core + a tail of extras only when
// future fields appear).
type Event struct {
	ID            string          `json:"id"`
	Type          string          `json:"event_type"`
	Source        string          `json:"source_department"`
	Payload       json.RawMessage `json:"payload"`
	ParentEventID *string         `json:"parent_event_id,omitempty"`
	PublishedAt   time.Time       `json:"published_at"`
}

// --- publish_event ---------------------------------------------------------

// PublishEventRequest mirrors inputSchema for tenet0-bus-mcp.publish_event.
type PublishEventRequest struct {
	EventType      string          `json:"event_type"`
	Payload        json.RawMessage `json:"payload"`
	ParentEventID  *string         `json:"parent_event_id,omitempty"`
	IdempotencyKey *string         `json:"idempotency_key,omitempty"`
}

// PublishEventResponse mirrors outputSchema.
type PublishEventResponse struct {
	EventID     string    `json:"event_id"`
	PublishedAt time.Time `json:"published_at"`
}

// PublishEvent handles the publish_event tool call.
func (h *Handler) PublishEvent(ctx context.Context, req PublishEventRequest) (PublishEventResponse, error) {
	if !eventTypePattern.MatchString(req.EventType) {
		return PublishEventResponse{}, fmt.Errorf("%w: event_type %q does not match <a>.<b>.<c>", ErrBusPayloadInvalid, req.EventType)
	}
	var opts []busgo.PublishOption
	if req.ParentEventID != nil && *req.ParentEventID != "" {
		opts = append(opts, busgo.WithParent(*req.ParentEventID))
	}
	// NOTE: idempotency_key is currently accepted at the wire but not yet
	// plumbed into the stored procedure (see ErrDuplicateIdempotency godoc).
	// We propagate detection via mapBusError's text heuristic.
	id, err := h.bus.Publish(ctx, req.EventType, req.Payload, opts...)
	if err != nil {
		return PublishEventResponse{}, mapBusError(err)
	}
	return PublishEventResponse{
		EventID:     id,
		PublishedAt: time.Now().UTC(),
	}, nil
}

// --- query_events ----------------------------------------------------------

// QueryEventsRequest mirrors inputSchema for tenet0-bus-mcp.query_events.
type QueryEventsRequest struct {
	EventTypePattern string     `json:"event_type_pattern,omitempty"`
	SourceDepartment string     `json:"source_department,omitempty"`
	StartTime        *time.Time `json:"start_time,omitempty"`
	EndTime          *time.Time `json:"end_time,omitempty"`
	Limit            int        `json:"limit,omitempty"`
	Cursor           *string    `json:"cursor,omitempty"`
}

// QueryEventsResponse mirrors outputSchema.
type QueryEventsResponse struct {
	Events     []Event `json:"events"`
	NextCursor *string `json:"next_cursor,omitempty"`
}

// QueryEvents handles the query_events tool call.
func (h *Handler) QueryEvents(ctx context.Context, req QueryEventsRequest) (QueryEventsResponse, error) {
	if req.StartTime != nil && req.EndTime != nil && req.StartTime.After(*req.EndTime) {
		return QueryEventsResponse{}, fmt.Errorf("%w: start_time > end_time", ErrBusQueryInvalid)
	}
	events, nextCursor, err := h.bus.QueryEvents(ctx, req)
	if err != nil {
		return QueryEventsResponse{}, mapBusError(err)
	}
	if events == nil {
		events = []Event{}
	}
	resp := QueryEventsResponse{Events: events}
	if nextCursor != "" {
		resp.NextCursor = &nextCursor
	}
	return resp, nil
}

// --- get_event -------------------------------------------------------------

// GetEventRequest mirrors inputSchema for tenet0-bus-mcp.get_event.
type GetEventRequest struct {
	EventID string `json:"event_id"`
}

// GetEventResponse mirrors outputSchema.
type GetEventResponse struct {
	Event Event `json:"event"`
}

// GetEvent handles the get_event tool call.
func (h *Handler) GetEvent(ctx context.Context, req GetEventRequest) (GetEventResponse, error) {
	ev, err := h.bus.GetEvent(ctx, req.EventID)
	if err != nil {
		return GetEventResponse{}, mapBusError(err)
	}
	return GetEventResponse{Event: ev}, nil
}

// --- walk_causality --------------------------------------------------------

// WalkCausalityRequest mirrors inputSchema for tenet0-bus-mcp.walk_causality.
type WalkCausalityRequest struct {
	EventID   string `json:"event_id"`
	MaxDepth  int    `json:"max_depth,omitempty"`
	Direction string `json:"direction,omitempty"`
}

// WalkCausalityResponse mirrors outputSchema.
type WalkCausalityResponse struct {
	Chain            []Event `json:"chain"`
	TerminatedReason string  `json:"terminated_reason"`
}

// WalkCausality handles the walk_causality tool call.
func (h *Handler) WalkCausality(ctx context.Context, req WalkCausalityRequest) (WalkCausalityResponse, error) {
	if req.Direction == "" {
		req.Direction = "ancestors"
	}
	chain, reason, err := h.bus.WalkCausality(ctx, req)
	if err != nil {
		return WalkCausalityResponse{}, mapBusError(err)
	}
	if chain == nil {
		chain = []Event{}
	}
	if reason == "" {
		reason = "reached_root"
	}
	return WalkCausalityResponse{Chain: chain, TerminatedReason: reason}, nil
}

// --- list_unprocessed_events ----------------------------------------------

// ListUnprocessedEventsRequest mirrors inputSchema for
// tenet0-bus-mcp.list_unprocessed_events.
type ListUnprocessedEventsRequest struct {
	Limit         int     `json:"limit,omitempty"`
	SinceEventID  *string `json:"since_event_id,omitempty"`
}

// ListUnprocessedEventsResponse mirrors outputSchema.
type ListUnprocessedEventsResponse struct {
	Events        []Event `json:"events"`
	HighWaterMark *string `json:"high_water_mark,omitempty"`
}

// ListUnprocessedEvents handles the list_unprocessed_events tool call.
func (h *Handler) ListUnprocessedEvents(ctx context.Context, req ListUnprocessedEventsRequest) (ListUnprocessedEventsResponse, error) {
	events, hwm, err := h.bus.ListUnprocessedEvents(ctx, req)
	if err != nil {
		return ListUnprocessedEventsResponse{}, mapBusError(err)
	}
	if events == nil {
		events = []Event{}
	}
	return ListUnprocessedEventsResponse{Events: events, HighWaterMark: hwm}, nil
}

// ---------------------------------------------------------------------------
// MCP wiring — RegisterTools registers the five tools on a *mcp.Server.
// ---------------------------------------------------------------------------

// ToolNames is the canonical, ordered list of tools this handler exposes.
// Used by RegisterTools and asserted in tests.
var ToolNames = []string{
	"publish_event",
	"query_events",
	"get_event",
	"walk_causality",
	"list_unprocessed_events",
}

// schemas — JSON Schema fragments lifted verbatim from the contract.
// Keeping them in one place makes the tests assertable and the next
// implementer's job copy/paste-free.
var (
	publishEventInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event_type", "payload"],
		"additionalProperties": false,
		"properties": {
			"event_type":      {"type": "string", "pattern": "^[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$"},
			"payload":         {"type": "object", "additionalProperties": true},
			"parent_event_id": {"type": ["string", "null"], "format": "uuid"},
			"idempotency_key": {"type": "string", "pattern": "^[0-9a-fA-F-]{36}$|^[0-9A-HJKMNP-TV-Z]{26}$"}
		}
	}`)
	publishEventOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event_id", "published_at"],
		"additionalProperties": false,
		"properties": {
			"event_id":     {"type": "string", "format": "uuid"},
			"published_at": {"type": "string", "format": "date-time"}
		}
	}`)

	queryEventsInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"event_type_pattern": {"type": "string"},
			"source_department":  {"type": "string", "pattern": "^[a-z][a-z0-9_]+$"},
			"start_time":         {"type": "string", "format": "date-time"},
			"end_time":           {"type": "string", "format": "date-time"},
			"limit":              {"type": "integer", "minimum": 1, "maximum": 1000, "default": 100},
			"cursor":             {"type": ["string", "null"]}
		}
	}`)
	queryEventsOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["events"],
		"additionalProperties": false,
		"properties": {
			"events":      {"type": "array", "items": {"type": "object", "additionalProperties": true}},
			"next_cursor": {"type": ["string", "null"]}
		}
	}`)

	getEventInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event_id"],
		"additionalProperties": false,
		"properties": {
			"event_id": {"type": "string", "format": "uuid"}
		}
	}`)
	getEventOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event"],
		"additionalProperties": false,
		"properties": {
			"event": {"type": "object", "additionalProperties": true}
		}
	}`)

	walkCausalityInputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["event_id"],
		"additionalProperties": false,
		"properties": {
			"event_id":  {"type": "string", "format": "uuid"},
			"max_depth": {"type": "integer", "minimum": 1, "maximum": 50, "default": 10},
			"direction": {"type": "string", "enum": ["ancestors", "descendants"], "default": "ancestors"}
		}
	}`)
	walkCausalityOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["chain", "terminated_reason"],
		"additionalProperties": false,
		"properties": {
			"chain":             {"type": "array", "items": {"type": "object", "additionalProperties": true}},
			"terminated_reason": {"type": "string", "enum": ["reached_root", "max_depth", "cycle_detected"]}
		}
	}`)

	listUnprocessedInputSchema = json.RawMessage(`{
		"type": "object",
		"additionalProperties": false,
		"properties": {
			"limit":          {"type": "integer", "minimum": 1, "maximum": 500, "default": 50},
			"since_event_id": {"type": ["string", "null"], "format": "uuid"}
		}
	}`)
	listUnprocessedOutputSchema = json.RawMessage(`{
		"type": "object",
		"required": ["events"],
		"additionalProperties": false,
		"properties": {
			"events":          {"type": "array", "items": {"type": "object", "additionalProperties": true}},
			"high_water_mark": {"type": ["string", "null"], "format": "uuid"}
		}
	}`)
)

// RegisterTools wires this Handler's five methods onto srv as MCP tools.
// Returns the first registration error.
func (h *Handler) RegisterTools(srv *mcp.Server) error {
	tools := []mcp.Tool{
		{
			Name:         "publish_event",
			Description:  "Publish an event to the Tenet-0 bus",
			InputSchema:  publishEventInputSchema,
			OutputSchema: publishEventOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req PublishEventRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, fmt.Errorf("%w: %v", ErrBusPayloadInvalid, err)
				}
				return h.PublishEvent(ctx, req)
			},
		},
		{
			Name:         "query_events",
			Description:  "Query historical events",
			InputSchema:  queryEventsInputSchema,
			OutputSchema: queryEventsOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req QueryEventsRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, fmt.Errorf("%w: %v", ErrBusPayloadInvalid, err)
					}
				}
				return h.QueryEvents(ctx, req)
			},
		},
		{
			Name:         "get_event",
			Description:  "Fetch a single event by ID",
			InputSchema:  getEventInputSchema,
			OutputSchema: getEventOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req GetEventRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, fmt.Errorf("%w: %v", ErrBusPayloadInvalid, err)
				}
				return h.GetEvent(ctx, req)
			},
		},
		{
			Name:         "walk_causality",
			Description:  "Walk the causality chain rooted at an event",
			InputSchema:  walkCausalityInputSchema,
			OutputSchema: walkCausalityOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req WalkCausalityRequest
				if err := json.Unmarshal(in, &req); err != nil {
					return nil, fmt.Errorf("%w: %v", ErrBusPayloadInvalid, err)
				}
				return h.WalkCausality(ctx, req)
			},
		},
		{
			Name:         "list_unprocessed_events",
			Description:  "List events newer than the caller's high-water mark",
			InputSchema:  listUnprocessedInputSchema,
			OutputSchema: listUnprocessedOutputSchema,
			Handler: func(ctx context.Context, in json.RawMessage) (any, error) {
				var req ListUnprocessedEventsRequest
				if len(in) > 0 && string(in) != "null" {
					if err := json.Unmarshal(in, &req); err != nil {
						return nil, fmt.Errorf("%w: %v", ErrBusPayloadInvalid, err)
					}
				}
				return h.ListUnprocessedEvents(ctx, req)
			},
		},
	}
	for _, t := range tools {
		if err := srv.RegisterTool(t); err != nil {
			return err
		}
	}
	return nil
}
