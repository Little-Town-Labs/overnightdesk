package bus

import "errors"

// Typed errors returned by Publish and the Governor wrapper. Callers use
// errors.Is for branching. Each corresponds to a rejection status returned by
// the publish_event stored procedure.
var (
	// ErrUnauthenticated: the credential did not match any department. Check
	// rotation state and credential configuration.
	ErrUnauthenticated = errors.New("bus: unauthenticated")

	// ErrNamespaceViolation: the event type's prefix does not match the
	// publishing department.
	ErrNamespaceViolation = errors.New("bus: namespace violation")

	// ErrConstitutionRejected: a constitutional rule blocked the publish —
	// most commonly a missing or expired approval.
	ErrConstitutionRejected = errors.New("bus: constitution rejected")

	// ErrCausalityLoop: the causality chain rooted at the parent event either
	// forms a cycle or exceeds the depth limit (10).
	ErrCausalityLoop = errors.New("bus: causality loop")

	// ErrNoConstitution: no active constitution is loaded. Run the
	// bump-constitution migration before publishing.
	ErrNoConstitution = errors.New("bus: no active constitution")

	// ErrBudgetBlocked: the governor prevented a Claude call because the
	// department has spent 100% of its monthly budget.
	ErrBudgetBlocked = errors.New("bus: budget blocked")

	// ErrConnectionLost: the underlying PostgreSQL connection is unavailable.
	// Callers may spool and retry.
	ErrConnectionLost = errors.New("bus: connection lost")

	// ErrNotFound: the requested event (by ID) does not exist. Returned by
	// GetEvent and WalkCausality when the starting event is missing.
	ErrNotFound = errors.New("bus: not found")

	// ErrQueryInvalid: query filter arguments are mutually inconsistent
	// (e.g. StartTime > EndTime). Returned by QueryEvents.
	ErrQueryInvalid = errors.New("bus: query invalid")

	// ErrDuplicateIdempotency: the caller supplied an idempotency key that
	// was previously used with a different payload within the dedup window.
	// NOTE: the Feature 49 stored procedure does not currently track
	// idempotency state; this sentinel exists so MCP adapters can surface
	// the concept consistently once SP-side dedup lands. For now the
	// bus-go client only returns this if the error string coming back from
	// the SP contains an "idempotency" marker (detected client-side).
	ErrDuplicateIdempotency = errors.New("bus: duplicate idempotency key")
)
