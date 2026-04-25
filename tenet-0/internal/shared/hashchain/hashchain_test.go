package hashchain

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/google/uuid"
)

// safeCall runs fn and reports the panic message (or "" on success).
// Used so RED-phase stubs that panic("not implemented") still make the
// test fail cleanly rather than crashing the process.
func safeCall(t *testing.T, fn func()) (panicked bool, msg string) {
	t.Helper()
	defer func() {
		if r := recover(); r != nil {
			panicked = true
			msg = "panic: " + sprint(r)
		}
	}()
	fn()
	return false, ""
}

func sprint(v any) string {
	if s, ok := v.(string); ok {
		return s
	}
	if e, ok := v.(error); ok {
		return e.Error()
	}
	return "non-string panic"
}

func samplePayload() DecisionPayload {
	root := uuid.New()
	return DecisionPayload{
		OutcomeEventID:       uuid.New(),
		OutcomeEventType:     "president.approved",
		CausalityRootEventID: &root,
		DecisionMode:         "rule",
		RuleIDUsed:           "fin-payment-outbound-requires-approval",
		Rationale:            "rule auto-approval",
		ActorDirector:        "president",
	}
}

func TestSeed_IsDeterministic(t *testing.T) {
	a := Seed()
	b := Seed()
	if !bytes.Equal(a.RowHash, b.RowHash) {
		t.Fatalf("Seed.RowHash differs across calls: %x vs %x", a.RowHash, b.RowHash)
	}
	if !bytes.Equal(a.PrevHash, b.PrevHash) {
		t.Fatalf("Seed.PrevHash differs across calls")
	}
	if !bytes.Equal(a.CanonicalPayload, b.CanonicalPayload) {
		t.Fatalf("Seed.CanonicalPayload differs across calls")
	}
}

func TestSeed_PrevHashIsAllZeros(t *testing.T) {
	s := Seed()
	if len(s.PrevHash) != 32 {
		t.Fatalf("Seed.PrevHash length = %d, want 32", len(s.PrevHash))
	}
	for i, b := range s.PrevHash {
		if b != 0 {
			t.Fatalf("Seed.PrevHash[%d] = %d, want 0 (genesis prev)", i, b)
		}
	}
}

func TestExtend_ProducesNonZeroHash(t *testing.T) {
	seed := Seed()
	canonical, err := Canonicalize(samplePayload())
	if err != nil {
		t.Fatalf("Canonicalize: %v", err)
	}
	row := Extend(seed, canonical)
	if len(row.RowHash) != 32 {
		t.Fatalf("Extend.RowHash length = %d, want 32", len(row.RowHash))
	}
	allZero := true
	for _, b := range row.RowHash {
		if b != 0 {
			allZero = false
			break
		}
	}
	if allZero {
		t.Fatal("Extend produced an all-zero RowHash")
	}
}

func TestExtend_DifferentPayloadsDifferentHashes(t *testing.T) {
	seed := Seed()
	c1, _ := Canonicalize(samplePayload())
	c2, _ := Canonicalize(samplePayload()) // different uuid → different bytes
	r1 := Extend(seed, c1)
	r2 := Extend(seed, c2)
	if bytes.Equal(r1.RowHash, r2.RowHash) {
		t.Fatal("different payloads produced identical hashes")
	}
}

func TestVerify_AcceptsCleanExtend(t *testing.T) {
	seed := Seed()
	c, _ := Canonicalize(samplePayload())
	row := Extend(seed, c)
	if err := Verify(seed, row); err != nil {
		t.Fatalf("Verify rejected legitimate Extend output: %v", err)
	}
}

func TestVerify_RejectsTamperedRowHash(t *testing.T) {
	seed := Seed()
	c, _ := Canonicalize(samplePayload())
	row := Extend(seed, c)
	row.RowHash[0] ^= 0xFF
	if err := Verify(seed, row); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("Verify did not return ErrCorrupt on tampered row_hash, got %v", err)
	}
}

func TestVerify_RejectsTamperedPayload(t *testing.T) {
	seed := Seed()
	c, _ := Canonicalize(samplePayload())
	row := Extend(seed, c)
	// flip one byte of the payload — recomputed hash will not match stored hash
	row.CanonicalPayload[0] ^= 0xFF
	if err := Verify(seed, row); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("Verify did not detect mutated payload, got %v", err)
	}
}

func TestVerify_RejectsTamperedPrevLinkage(t *testing.T) {
	seed := Seed()
	c, _ := Canonicalize(samplePayload())
	row := Extend(seed, c)
	tamperedPrev := seed
	tamperedPrev.RowHash = make([]byte, 32) // different prev_hash
	if err := Verify(tamperedPrev, row); !errors.Is(err, ErrCorrupt) {
		t.Fatalf("Verify did not detect prev-hash tampering, got %v", err)
	}
}

func TestVerifyChain_CleanChain(t *testing.T) {
	rows := []Row{Seed()}
	for i := 0; i < 3; i++ {
		c, _ := Canonicalize(samplePayload())
		next := Extend(rows[len(rows)-1], c)
		rows = append(rows, next)
	}
	idx, err := VerifyChain(rows)
	if err != nil {
		t.Fatalf("VerifyChain returned err on clean chain: %v", err)
	}
	if idx != -1 {
		t.Fatalf("VerifyChain returned idx %d on clean chain, want -1", idx)
	}
}

func TestVerifyChain_DetectsTamperedMiddle(t *testing.T) {
	rows := []Row{Seed()}
	for i := 0; i < 4; i++ {
		c, _ := Canonicalize(samplePayload())
		rows = append(rows, Extend(rows[len(rows)-1], c))
	}
	// tamper row 2 (the second non-seed row)
	rows[2].RowHash[5] ^= 0x01
	idx, err := VerifyChain(rows)
	if err == nil {
		t.Fatal("VerifyChain accepted tampered chain")
	}
	if idx != 2 {
		t.Errorf("VerifyChain firstBadIdx = %d, want 2", idx)
	}
}

func TestVerifyChain_EmptyIsClean(t *testing.T) {
	idx, err := VerifyChain(nil)
	if err != nil {
		t.Fatalf("empty chain returned err: %v", err)
	}
	if idx != -1 {
		t.Fatalf("empty chain returned idx %d, want -1", idx)
	}
}

func TestVerifyChain_SeedOnlyIsClean(t *testing.T) {
	idx, err := VerifyChain([]Row{Seed()})
	if err != nil {
		t.Fatalf("seed-only chain returned err: %v", err)
	}
	if idx != -1 {
		t.Fatalf("seed-only chain returned idx %d, want -1", idx)
	}
}

func TestVerifyChain_RejectsBogusFirstRow(t *testing.T) {
	bogus := Seed()
	bogus.RowHash = bytes.Repeat([]byte{0xAA}, 32)
	_, err := VerifyChain([]Row{bogus})
	if !errors.Is(err, ErrSeedMismatch) {
		t.Fatalf("VerifyChain on bogus first row returned %v, want ErrSeedMismatch", err)
	}
}

func TestCanonicalize_Deterministic(t *testing.T) {
	p := samplePayload()
	a, err := Canonicalize(p)
	if err != nil {
		t.Fatalf("Canonicalize: %v", err)
	}
	b, err := Canonicalize(p)
	if err != nil {
		t.Fatalf("Canonicalize (second): %v", err)
	}
	if !bytes.Equal(a, b) {
		t.Fatal("Canonicalize is not deterministic for identical inputs")
	}
}

func TestCanonicalize_OrderIndependentExtras(t *testing.T) {
	p1 := samplePayload()
	p1.Extras = map[string]any{"a": 1, "b": 2, "c": 3}
	p2 := p1
	p2.Extras = map[string]any{"c": 3, "b": 2, "a": 1}
	a, _ := Canonicalize(p1)
	b, _ := Canonicalize(p2)
	if !bytes.Equal(a, b) {
		t.Fatalf("Canonicalize is sensitive to map iteration order:\n  a=%s\n  b=%s", a, b)
	}
}

func TestCanonicalize_NoWhitespace(t *testing.T) {
	out, err := Canonicalize(samplePayload())
	if err != nil {
		t.Fatalf("Canonicalize: %v", err)
	}
	for _, b := range out {
		if b == ' ' || b == '\n' || b == '\t' {
			t.Fatalf("Canonicalize emitted whitespace byte 0x%02x", b)
		}
	}
}

// TestUsesConstantTimeCompare is a source-level guard: hashchain compares
// SHA256 hashes which are public (not secrets), but constant-time compare
// is cheap and prevents oracle attacks against any future variant where
// the verifier short-circuits on mismatch. Mirror the credentials package
// pattern.
func TestUsesConstantTimeCompare(t *testing.T) {
	_, thisFile, _, _ := runtime.Caller(0)
	dir := filepath.Dir(thisFile)
	candidates := []string{"hashchain.go", "types.go", "verify.go"}
	var ok bool
	for _, name := range candidates {
		body, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			continue
		}
		if strings.Contains(string(body), "crypto/subtle") &&
			strings.Contains(string(body), "ConstantTimeCompare") {
			ok = true
			break
		}
	}
	if !ok {
		t.Errorf("no impl file in %s imports crypto/subtle.ConstantTimeCompare", dir)
	}
}

// Wrap one test in safeCall to demonstrate panicking stubs are caught
// (gives a clean RED-phase report rather than a crash).
func TestStubsPanic_Sentinel(t *testing.T) {
	panicked, msg := safeCall(t, func() { Seed() })
	if !panicked {
		t.Skip("Seed() did not panic — implementation present (move past RED)")
	}
	if !strings.Contains(msg, "not implemented") {
		t.Fatalf("unexpected panic message: %s", msg)
	}
	t.Logf("RED-phase confirmation: %s", msg)
}
