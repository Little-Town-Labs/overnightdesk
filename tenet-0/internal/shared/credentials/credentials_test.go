package credentials

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestSignVerify_Roundtrip(t *testing.T) {
	v := New([]byte("super-secret"))
	now := time.Now().UTC()

	sig := v.Sign("president", "call-1", now)
	if sig == "" {
		t.Fatal("Sign returned empty signature")
	}
	if err := v.Verify("president", "call-1", now, sig); err != nil {
		t.Fatalf("Verify failed on legitimate sig: %v", err)
	}
}

func TestVerify_RejectsTamperedSig(t *testing.T) {
	v := New([]byte("super-secret"))
	now := time.Now().UTC()
	sig := v.Sign("president", "call-1", now)

	// Flip first hex character.
	tampered := flipFirstHex(sig)
	if err := v.Verify("president", "call-1", now, tampered); err == nil {
		t.Fatal("Verify accepted tampered signature")
	}
}

func TestVerify_RejectsTamperedDirectorID(t *testing.T) {
	v := New([]byte("super-secret"))
	now := time.Now().UTC()
	sig := v.Sign("president", "call-1", now)
	if err := v.Verify("attacker", "call-1", now, sig); err == nil {
		t.Fatal("Verify accepted sig with substituted directorID")
	}
}

func TestVerify_RejectsTamperedCallID(t *testing.T) {
	v := New([]byte("super-secret"))
	now := time.Now().UTC()
	sig := v.Sign("president", "call-1", now)
	if err := v.Verify("president", "call-2", now, sig); err == nil {
		t.Fatal("Verify accepted sig with substituted callID")
	}
}

func TestVerify_RejectsStaleTimestamp(t *testing.T) {
	v := New([]byte("super-secret"))
	stale := time.Now().Add(-5 * time.Minute)
	sig := v.Sign("president", "call-1", stale)
	if err := v.Verify("president", "call-1", stale, sig); err == nil {
		t.Fatal("Verify accepted timestamp older than MaxSkew")
	}
}

func TestVerify_RejectsFutureTimestamp(t *testing.T) {
	v := New([]byte("super-secret"))
	future := time.Now().Add(5 * time.Minute)
	sig := v.Sign("president", "call-1", future)
	if err := v.Verify("president", "call-1", future, sig); err == nil {
		t.Fatal("Verify accepted timestamp far in the future")
	}
}

func TestVerify_AcceptsTimestampWithinSkew(t *testing.T) {
	v := New([]byte("super-secret"))
	close := time.Now().Add(-30 * time.Second) // within 60s window
	sig := v.Sign("president", "call-1", close)
	if err := v.Verify("president", "call-1", close, sig); err != nil {
		t.Errorf("Verify rejected timestamp inside MaxSkew: %v", err)
	}
}

func TestNew_EmptySecretRejectsEverything(t *testing.T) {
	v := New(nil)
	now := time.Now().UTC()
	if err := v.Verify("president", "call-1", now, "deadbeef"); err == nil {
		t.Fatal("Verifier built with empty secret must reject all signatures")
	}
}

// TestVerify_UsesConstantTimeCompare is a source-level guard: we read the
// implementation file and assert it imports crypto/subtle. It catches
// drift away from the constant-time requirement (security §3).
func TestVerify_UsesConstantTimeCompare(t *testing.T) {
	_, thisFile, _, _ := runtime.Caller(0)
	dir := filepath.Dir(thisFile)
	candidates := []string{"credentials.go", "verifier.go", "types.go"}

	var found bool
	for _, name := range candidates {
		body, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		if strings.Contains(string(body), "crypto/subtle") &&
			strings.Contains(string(body), "ConstantTimeCompare") {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("no impl file in %s imports crypto/subtle.ConstantTimeCompare; security §3 violation", dir)
	}
}

func flipFirstHex(s string) string {
	if s == "" {
		return s
	}
	b := []byte(s)
	if b[0] == '0' {
		b[0] = '1'
	} else {
		b[0] = '0'
	}
	return string(b)
}
