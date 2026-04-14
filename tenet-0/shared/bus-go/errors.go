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
)
