package bus

import "strings"

// patternKind classifies a subscription pattern for both in-memory matching
// and SQL LIKE translation. Having one parser prevents drift between the two.
type patternKind int

const (
	patternInvalid patternKind = iota
	patternExact               // "fin.payment.outbound"
	patternPrefix              // "ops.*"   → matches "ops.anything.anything"
	patternSuffix              // "*.failed" → matches "any.thing.failed"
	patternAll                 // "*"       → matches any event
)

// parsedPattern is the normalized form of a subscription pattern.
type parsedPattern struct {
	kind    patternKind
	literal string // for prefix: "ops." ; for suffix: ".failed" ; for exact: full pattern
}

// parsePattern normalizes a user-supplied subscription pattern into a
// parsedPattern. Unknown/invalid shapes fall back to exact match.
func parsePattern(p string) parsedPattern {
	switch {
	case p == "*":
		return parsedPattern{kind: patternAll}
	case len(p) >= 3 && strings.HasSuffix(p, ".*"):
		return parsedPattern{kind: patternPrefix, literal: p[:len(p)-1]}
	case len(p) >= 3 && strings.HasPrefix(p, "*."):
		return parsedPattern{kind: patternSuffix, literal: p[1:]}
	default:
		return parsedPattern{kind: patternExact, literal: p}
	}
}

// matches reports whether eventType satisfies this pattern.
func (p parsedPattern) matches(eventType string) bool {
	switch p.kind {
	case patternAll:
		return true
	case patternPrefix:
		return strings.HasPrefix(eventType, p.literal)
	case patternSuffix:
		return strings.HasSuffix(eventType, p.literal)
	case patternExact:
		return eventType == p.literal
	}
	return false
}

// toLike returns the SQL LIKE equivalent of this pattern.
func (p parsedPattern) toLike() string {
	switch p.kind {
	case patternAll:
		return "%"
	case patternPrefix:
		return p.literal + "%"
	case patternSuffix:
		return "%" + p.literal
	default:
		return p.literal
	}
}
