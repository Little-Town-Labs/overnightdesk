package bus

// Status strings returned by stored procedures. Keeping them centralized
// prevents typos in switch statements from silently masking SP behavior.
const (
	spStatusOK                      = "ok"
	spStatusRejectedUnauthenticated = "rejected_unauthenticated"
	spStatusRejectedNamespace       = "rejected_namespace"
	spStatusRejectedConstitution    = "rejected_constitution"
	spStatusRejectedCausality       = "rejected_causality"
	spStatusRejectedNoConstitution  = "rejected_no_constitution"

	budgetStatusOK              = "ok"
	budgetStatusWarning         = "warning"
	budgetStatusBlocked         = "blocked"
	budgetStatusUnauthenticated = "unauthenticated"
)
