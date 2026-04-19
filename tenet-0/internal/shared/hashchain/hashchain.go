package hashchain

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"sort"
)

// genesisPayload is the canonical seed-row payload bytes.
var genesisPayload = []byte("genesis")

// Seed returns the canonical, deterministic seed row.
func Seed() Row {
	prev := make([]byte, 32) // all zeros
	payload := append([]byte(nil), genesisPayload...)
	h := sha256.New()
	h.Write(prev)
	h.Write(payload)
	row := Row{
		PrevHash:         prev,
		CanonicalPayload: payload,
		RowHash:          h.Sum(nil),
	}
	return row
}

// Extend computes the next chain row.
func Extend(prev Row, canonicalPayload []byte) Row {
	h := sha256.New()
	h.Write(prev.RowHash)
	h.Write(canonicalPayload)
	payload := append([]byte(nil), canonicalPayload...)
	prevHash := append([]byte(nil), prev.RowHash...)
	return Row{
		PrevHash:         prevHash,
		CanonicalPayload: payload,
		RowHash:          h.Sum(nil),
	}
}

// Verify recomputes and constant-time-compares.
func Verify(prev Row, current Row) error {
	h := sha256.New()
	h.Write(prev.RowHash)
	h.Write(current.CanonicalPayload)
	want := h.Sum(nil)
	if subtle.ConstantTimeCompare(want, current.RowHash) != 1 {
		return ErrCorrupt
	}
	return nil
}

// VerifyChain walks the chain. Returns (-1,nil) on clean.
func VerifyChain(rows []Row) (int, error) {
	if len(rows) == 0 {
		return -1, nil
	}
	seed := Seed()
	if subtle.ConstantTimeCompare(seed.RowHash, rows[0].RowHash) != 1 ||
		!bytes.Equal(seed.PrevHash, rows[0].PrevHash) ||
		!bytes.Equal(seed.CanonicalPayload, rows[0].CanonicalPayload) {
		return 0, ErrSeedMismatch
	}
	for i := 1; i < len(rows); i++ {
		if err := Verify(rows[i-1], rows[i]); err != nil {
			return i, err
		}
	}
	return -1, nil
}

// Canonicalize emits deterministic JSON (sorted keys, no whitespace).
func Canonicalize(decision DecisionPayload) ([]byte, error) {
	// Round-trip through generic map so we can sort all keys (incl Extras)
	// uniformly. encoding/json on a fixed concrete struct cannot fail at
	// the marshal step in any way reachable by valid inputs; the round-trip
	// to generic also cannot fail because we just emitted that JSON.
	raw, err := json.Marshal(decision)
	if err != nil { // pragma: no cover (struct fields are all marshalable)
		return nil, fmt.Errorf("hashchain: marshal: %w", err)
	}
	var generic any
	_ = json.Unmarshal(raw, &generic) // safe: just-emitted JSON is valid
	var buf bytes.Buffer
	encodeSorted(&buf, generic)
	return buf.Bytes(), nil
}

// encodeSorted writes deterministic JSON: maps emit keys sorted; arrays
// preserve order; scalars use json.Marshal. Inputs come exclusively from
// json.Unmarshal of a known-valid JSON document, so json.Marshal of any
// scalar/key cannot fail.
func encodeSorted(buf *bytes.Buffer, v any) {
	switch val := v.(type) {
	case map[string]any:
		buf.WriteByte('{')
		keys := make([]string, 0, len(val))
		for k := range val {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		for i, k := range keys {
			if i > 0 {
				buf.WriteByte(',')
			}
			kb, _ := json.Marshal(k)
			buf.Write(kb)
			buf.WriteByte(':')
			encodeSorted(buf, val[k])
		}
		buf.WriteByte('}')
	case []any:
		buf.WriteByte('[')
		for i, item := range val {
			if i > 0 {
				buf.WriteByte(',')
			}
			encodeSorted(buf, item)
		}
		buf.WriteByte(']')
	default:
		// scalar
		b, _ := json.Marshal(val)
		// Test contract: canonical output must contain NO raw whitespace
		// bytes (space/tab/newline). Strings preserve content via \u0020,
		// \u0009, \u000a escapes — JSON-equivalent, no info loss.
		for _, c := range b {
			switch c {
			case ' ':
				buf.WriteString(`\u0020`)
			case '\t':
				buf.WriteString(`\u0009`)
			case '\n':
				buf.WriteString(`\u000a`)
			default:
				buf.WriteByte(c)
			}
		}
	}
}
