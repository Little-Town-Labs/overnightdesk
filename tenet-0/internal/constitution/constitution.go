// Task 2.4 implementation: replaces the RED stubs in types.go with real
// behavior. The five MCP tool handlers, New(), Close(), plus production
// adapters for busgoClient / fileLoader / busReader / proseFunc live here.
package constitution

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	sharedconst "github.com/overnightdesk/tenet-0/internal/shared/constitution"
	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

// ---------------------------------------------------------------------------
// New — constructor + production adapters.
// ---------------------------------------------------------------------------

// New validates cfg, opens the underlying pgx pool via bus-go, verifies
// both YAML/MD paths are readable, and returns a Handler.
func New(cfg Config) (*Handler, error) {
	if cfg.Logger == nil {
		return nil, errors.New("constitution.New: Logger is required")
	}
	if cfg.PostgresURL == "" {
		return nil, errors.New("constitution.New: PostgresURL is required")
	}
	if !strings.HasPrefix(cfg.PostgresURL, "postgres://") &&
		!strings.HasPrefix(cfg.PostgresURL, "postgresql://") {
		return nil, errors.New("constitution.New: PostgresURL must use postgres:// or postgresql:// scheme")
	}
	if cfg.ConstitutionMDPath == "" {
		return nil, errors.New("constitution.New: ConstitutionMDPath is required")
	}
	if cfg.ConstitutionYAMLPath == "" {
		return nil, errors.New("constitution.New: ConstitutionYAMLPath is required")
	}
	if cfg.Department == "" {
		cfg.Department = "president"
	}

	// Verify the YAML loads (fail fast at startup if constitution is malformed).
	if _, err := sharedconst.LoadFromFile(cfg.ConstitutionYAMLPath); err != nil {
		return nil, fmt.Errorf("constitution.New: load yaml: %w", err)
	}

	// Verify the MD file is readable.
	if _, err := os.Stat(cfg.ConstitutionMDPath); err != nil {
		return nil, fmt.Errorf("constitution.New: stat constitution.md: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	b, err := busgo.Connect(ctx, busgo.Config{
		PostgresURL: cfg.PostgresURL,
		Department:  cfg.Department,
		Credential:  cfg.Credential,
	})
	if err != nil {
		return nil, fmt.Errorf("constitution.New: bus-go connect: %w", err)
	}

	pool, err := pgxpool.New(ctx, cfg.PostgresURL)
	if err != nil {
		b.Close()
		return nil, fmt.Errorf("constitution.New: pgx pool: %w", err)
	}

	return &Handler{
		bus:    &busgoAdapter{c: b.Constitution(), closer: b},
		file:   &fileAdapter{path: cfg.ConstitutionYAMLPath},
		reader: &busReaderAdapter{pool: pool},
		prose:  proseFromPath(cfg.ConstitutionMDPath),
		logger: cfg.Logger,
	}, nil
}

// closer is the minimal interface used by Handler.Close to tear down
// production adapters that own external resources. Test fakes don't
// implement it so Close is a no-op in unit tests.
type closer interface {
	close()
}

// Close releases any bus/pool held by production adapters. Safe to call on
// nil Handler. Safe to call multiple times (each adapter's close is idempotent
// because pgxpool.Close + busgo.Bus.Close are idempotent).
func (h *Handler) Close() {
	if h == nil {
		return
	}
	if c, ok := h.bus.(closer); ok && c != nil {
		c.close()
	}
	if c, ok := h.reader.(closer); ok && c != nil {
		c.close()
	}
}

// proseFromPath returns a proseFunc that re-reads path on every call. The
// production handler uses this so operator-driven constitution.md edits are
// visible without restarting the MCP process.
func proseFromPath(path string) proseFunc {
	return func() (string, error) {
		b, err := os.ReadFile(path)
		if err != nil {
			return "", err
		}
		return string(b), nil
	}
}

// busgoAdapter wraps *busgo.Constitution to satisfy busgoClient. It also
// owns the underlying *busgo.Bus so Handler.Close can shut it down.
type busgoAdapter struct {
	c      *busgo.Constitution
	closer *busgo.Bus
}

func (a *busgoAdapter) Load(ctx context.Context) (*busgo.LoadedConstitution, error) {
	return a.c.Load(ctx)
}

func (a *busgoAdapter) CurrentVersion(ctx context.Context) (int64, error) {
	return a.c.CurrentVersion(ctx)
}

func (a *busgoAdapter) close() {
	if a.closer != nil {
		a.closer.Close()
	}
}

// fileAdapter wraps sharedconst.LoadFromFile + os.ReadFile so the handler can
// compute a deterministic SHA256 over raw bytes.
type fileAdapter struct {
	path string
}

func (a *fileAdapter) Load() (*sharedconst.File, []byte, error) {
	raw, err := os.ReadFile(a.path)
	if err != nil {
		return nil, nil, fmt.Errorf("constitution: read yaml: %w", err)
	}
	parsed, err := sharedconst.LoadFromFile(a.path)
	if err != nil {
		return nil, nil, err
	}
	return parsed, raw, nil
}

// busReaderAdapter issues a QueryEvents-equivalent read against the events
// table for president.authorization.granted events.
type busReaderAdapter struct {
	pool *pgxpool.Pool
}

func (a *busReaderAdapter) close() {
	if a.pool != nil {
		a.pool.Close()
	}
}

func (a *busReaderAdapter) ListAuthorizations(ctx context.Context, category string) ([]AuthorizationEvent, error) {
	// Query all president.authorization.granted events (optionally filtered
	// by category at the payload level). Category filter is applied after
	// unmarshaling the payload so category can be nested.
	rows, err := a.pool.Query(ctx,
		`SELECT id, payload, published_at
		   FROM events
		  WHERE event_type = 'president.authorization.granted'
		  ORDER BY published_at DESC
		  LIMIT 500`)
	if err != nil {
		return nil, fmt.Errorf("constitution: list authorizations: %w", err)
	}
	defer rows.Close()

	var out []AuthorizationEvent
	for rows.Next() {
		var id string
		var payload []byte
		var publishedAt time.Time
		if err := rows.Scan(&id, &payload, &publishedAt); err != nil {
			return nil, fmt.Errorf("constitution: scan authorization: %w", err)
		}
		var p struct {
			Category    string          `json:"category"`
			ExpiresAt   *time.Time      `json:"expires_at"`
			Revoked     bool            `json:"revoked"`
			Constraints json.RawMessage `json:"constraints,omitempty"`
		}
		_ = json.Unmarshal(payload, &p)
		if category != "" && p.Category != category {
			continue
		}
		out = append(out, AuthorizationEvent{
			EventID:     id,
			Category:    p.Category,
			GrantedAt:   publishedAt,
			ExpiresAt:   p.ExpiresAt,
			Revoked:     p.Revoked,
			Constraints: p.Constraints,
		})
	}
	return out, rows.Err()
}

// ---------------------------------------------------------------------------
// LoadConstitution
// ---------------------------------------------------------------------------

func (h *Handler) LoadConstitution(ctx context.Context, _ LoadConstitutionRequest) (LoadConstitutionResponse, error) {
	prose, err := h.prose()
	if err != nil {
		return LoadConstitutionResponse{}, fmt.Errorf("%w: read prose: %v", ErrConstitutionLoadFailed, err)
	}

	_, raw, err := h.file.Load()
	if err != nil {
		return LoadConstitutionResponse{}, fmt.Errorf("%w: load yaml: %v", ErrConstitutionLoadFailed, err)
	}

	loaded, err := h.bus.Load(ctx)
	if err != nil {
		return LoadConstitutionResponse{}, fmt.Errorf("%w: bus version: %v", ErrConstitutionLoadFailed, err)
	}

	sum := sha256.Sum256(raw)
	return LoadConstitutionResponse{
		Version:       strconv.FormatInt(loaded.VersionID, 10),
		ProseMarkdown: prose,
		RulesHash:     hex.EncodeToString(sum[:]),
	}, nil
}

// ---------------------------------------------------------------------------
// EvaluateEvent
// ---------------------------------------------------------------------------

// ruleMatches returns true when a rule applies to the given event_type.
// Supports exact match and trailing ".*" prefix wildcard.
func ruleMatches(rule sharedconst.Rule, eventType string) bool {
	pat := rule.EventTypePattern
	if pat == "" {
		return false
	}
	if strings.HasSuffix(pat, ".*") {
		prefix := strings.TrimSuffix(pat, ".*")
		return strings.HasPrefix(eventType, prefix+".") || eventType == prefix
	}
	return pat == eventType
}

// causalityHasApproval scans the causality chain for a president.approved
// event. Malformed (non-object) entries are skipped. Payload is ignored;
// any approved ancestor counts (the engine-level target-binding is enforced
// at publish time by bus-go, not here).
func causalityHasApproval(chain []json.RawMessage) bool {
	for _, raw := range chain {
		if len(raw) == 0 {
			continue
		}
		var m map[string]any
		if err := json.Unmarshal(raw, &m); err != nil {
			continue
		}
		if t, ok := m["event_type"].(string); ok {
			if t == "president.approved" || t == "president.approval.granted" {
				return true
			}
		}
	}
	return false
}

func truncateReason(s string) *string {
	if s == "" {
		return nil
	}
	if len(s) > maxReasonChars {
		s = s[:maxReasonChars]
	}
	return &s
}

func (h *Handler) EvaluateEvent(ctx context.Context, req EvaluateEventRequest) (EvaluateEventResponse, error) {
	file, _, err := h.file.Load()
	if err != nil {
		return EvaluateEventResponse{}, fmt.Errorf("%w: load yaml: %v", ErrConstitutionLoadFailed, err)
	}
	if file == nil || len(file.Rules) == 0 {
		return EvaluateEventResponse{}, fmt.Errorf("%w: no rules loaded", ErrConstitutionRuleInvalid)
	}

	for _, rule := range file.Rules {
		if !ruleMatches(rule, req.EventType) {
			continue
		}
		ruleID := rule.ID
		switch rule.RequiresApproval {
		case "", "none":
			return EvaluateEventResponse{Allowed: true}, nil
		case "per_action":
			if causalityHasApproval(req.CausalityChain) {
				return EvaluateEventResponse{Allowed: true}, nil
			}
			reason := rule.Description
			if reason == "" {
				reason = fmt.Sprintf("missing per-action approval for %s", req.EventType)
			}
			return EvaluateEventResponse{
				Allowed:        false,
				ViolatedRuleID: &ruleID,
				Reason:         truncateReason(reason),
			}, nil
		case "blanket_category":
			// Blanket authorizations are validated at publish time by the
			// bus / President; the pre-check allows the event through so
			// the runtime can consult the live authorization registry.
			return EvaluateEventResponse{Allowed: true}, nil
		default:
			// Unknown mode — fail closed.
			reason := fmt.Sprintf("rule %s has unknown requires_approval mode %q",
				rule.ID, rule.RequiresApproval)
			return EvaluateEventResponse{}, fmt.Errorf("%w: %s", ErrConstitutionRuleInvalid, reason)
		}
	}

	// No rule matched → default-allow.
	return EvaluateEventResponse{Allowed: true}, nil
}

// ---------------------------------------------------------------------------
// RequiresApproval
// ---------------------------------------------------------------------------

func (h *Handler) RequiresApproval(ctx context.Context, req RequiresApprovalRequest) (RequiresApprovalResponse, error) {
	file, _, err := h.file.Load()
	if err != nil {
		return RequiresApprovalResponse{}, fmt.Errorf("%w: load yaml: %v", ErrConstitutionLoadFailed, err)
	}
	if file == nil {
		return RequiresApprovalResponse{}, fmt.Errorf("%w: nil file", ErrConstitutionLoadFailed)
	}

	for _, rule := range file.Rules {
		if !ruleMatches(rule, req.EventType) {
			continue
		}
		switch rule.RequiresApproval {
		case "per_action":
			return RequiresApprovalResponse{ApprovalMode: ApprovalModePerAction}, nil
		case "blanket_category":
			cat := rule.ApprovalCategory
			return RequiresApprovalResponse{
				ApprovalMode:    ApprovalModeBlanketEligible,
				BlanketCategory: &cat,
			}, nil
		case "", "none":
			return RequiresApprovalResponse{ApprovalMode: ApprovalModeNone}, nil
		default:
			return RequiresApprovalResponse{}, fmt.Errorf("%w: unknown mode %q", ErrConstitutionRuleInvalid, rule.RequiresApproval)
		}
	}

	// No rule matches → unregulated.
	return RequiresApprovalResponse{ApprovalMode: ApprovalModeNone}, nil
}

// ---------------------------------------------------------------------------
// ListBlanketAuthorizations
// ---------------------------------------------------------------------------

func (h *Handler) ListBlanketAuthorizations(ctx context.Context, req ListBlanketAuthorizationsRequest) (ListBlanketAuthorizationsResponse, error) {
	events, err := h.reader.ListAuthorizations(ctx, req.Category)
	if err != nil {
		// Transport-style errors (timeout, cancellation, connection) surface
		// as BUS_DOWN; everything else falls through to INTERNAL via the
		// handler's default error mapping.
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) {
			return ListBlanketAuthorizationsResponse{}, fmt.Errorf("%w: %v", ErrBusDown, err)
		}
		return ListBlanketAuthorizationsResponse{}, fmt.Errorf("%w: %v", ErrBusDown, err)
	}

	now := time.Now()
	out := make([]BlanketAuthorization, 0, len(events))
	for _, e := range events {
		if e.Revoked {
			continue
		}
		if e.ExpiresAt != nil && !e.ExpiresAt.After(now) {
			continue
		}
		out = append(out, BlanketAuthorization{
			Category:       e.Category,
			GrantedEventID: e.EventID,
			ExpiresAt:      e.ExpiresAt,
			Constraints:    e.Constraints,
		})
	}
	return ListBlanketAuthorizationsResponse{Authorizations: out}, nil
}

// ---------------------------------------------------------------------------
// GetMemoryAccessMatrix
// ---------------------------------------------------------------------------

func (h *Handler) GetMemoryAccessMatrix(ctx context.Context, _ GetMemoryAccessMatrixRequest) (GetMemoryAccessMatrixResponse, error) {
	file, _, err := h.file.Load()
	if err != nil {
		return GetMemoryAccessMatrixResponse{}, fmt.Errorf("%w: load yaml: %v", ErrConstitutionLoadFailed, err)
	}
	if file == nil || len(file.MemoryAccessMatrix) == 0 {
		return GetMemoryAccessMatrixResponse{}, fmt.Errorf("%w: memory_access_matrix missing or empty", ErrConstitutionLoadFailed)
	}

	matrix := make(map[string]MatrixEntry, len(file.MemoryAccessMatrix))
	for ns, entry := range file.MemoryAccessMatrix {
		read := entry.Read
		if read == nil {
			read = []string{}
		}
		write := entry.Write
		if write == nil {
			write = []string{}
		}
		matrix[ns] = MatrixEntry{Read: read, Write: write}
	}
	return GetMemoryAccessMatrixResponse{
		MatrixVersion: strconv.Itoa(file.Version),
		Matrix:        matrix,
	}, nil
}
