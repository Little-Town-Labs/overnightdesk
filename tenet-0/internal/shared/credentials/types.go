// Package credentials implements the per-Director HMAC verifier from
// security §3 / research.md §MCP Server Auth. Every MCP call carries a
// signature `HMAC-SHA256(secret, directorID|callID|RFC3339Nano)` plus the
// timestamp itself; the verifier rejects sigs older than 60s and uses
// crypto/subtle for constant-time comparison.
package credentials

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"errors"
	"time"
)

// MaxSkew is the largest accepted gap between the signed timestamp and
// the verifier's wall clock. Replays older than this are rejected.
const MaxSkew = 60 * time.Second

// Verifier signs and verifies HMAC tokens for one Director.
type Verifier struct {
	secret []byte
}

// New constructs a Verifier from the shared secret. Empty secret returns
// a Verifier that rejects every Verify call (defence in depth — never
// silently accept all signatures because of a config typo).
func New(secret []byte) *Verifier {
	// Make defensive copy so callers can zero theirs.
	cp := make([]byte, len(secret))
	copy(cp, secret)
	return &Verifier{secret: cp}
}

// canonical builds the signing payload. Format pinned: directorID|callID|RFC3339Nano(UTC).
func canonical(directorID, callID string, ts time.Time) string {
	return directorID + "|" + callID + "|" + ts.UTC().Format(time.RFC3339Nano)
}

// Sign returns the hex-encoded HMAC-SHA256 of the canonical
// directorID|callID|timestamp tuple. Returns empty string if the verifier
// has no secret (defence in depth).
func (v *Verifier) Sign(directorID, callID string, ts time.Time) string {
	if len(v.secret) == 0 {
		return ""
	}
	mac := hmac.New(sha256.New, v.secret)
	mac.Write([]byte(canonical(directorID, callID, ts)))
	return hex.EncodeToString(mac.Sum(nil))
}

// Verify recomputes the signature, compares constant-time, and rejects
// stale timestamps (|now - ts| > MaxSkew). Returns nil on success.
func (v *Verifier) Verify(directorID, callID string, ts time.Time, sig string) error {
	if len(v.secret) == 0 {
		return errors.New("credentials: verifier has no secret")
	}
	skew := time.Since(ts)
	if skew < 0 {
		skew = -skew
	}
	if skew > MaxSkew {
		return errors.New("credentials: timestamp outside MaxSkew window")
	}
	want, err := hex.DecodeString(sig)
	if err != nil {
		return errors.New("credentials: signature is not valid hex")
	}
	mac := hmac.New(sha256.New, v.secret)
	mac.Write([]byte(canonical(directorID, callID, ts)))
	got := mac.Sum(nil)
	if subtle.ConstantTimeCompare(got, want) != 1 {
		return errors.New("credentials: signature mismatch")
	}
	return nil
}
