package hashchain

import (
	"bytes"
	"testing"

	"github.com/google/uuid"
)

// Exercise canonical encoding through arrays + nested maps + scalars to
// drive encodeSorted's array branch and Extras-as-map branch.
func TestCanonicalize_NestedShapes(t *testing.T) {
	root := uuid.New()
	p := DecisionPayload{
		OutcomeEventID:       uuid.New(),
		OutcomeEventType:     "test",
		CausalityRootEventID: &root,
		DecisionMode:         "rule",
		Rationale:            "x",
		ActorDirector:        "ops",
		Extras: map[string]any{
			"nested": map[string]any{
				"b": []any{1, 2, 3},
				"a": "v",
			},
			"flag":  true,
			"score": 1.25,
			"null":  nil,
		},
	}
	out, err := Canonicalize(p)
	if err != nil {
		t.Fatalf("Canonicalize: %v", err)
	}
	// Sort property: keys in deterministic order — re-encode and compare.
	out2, _ := Canonicalize(p)
	if !bytes.Equal(out, out2) {
		t.Fatalf("not deterministic over nested map+array")
	}
}

// Hit the unmarshal failure path indirectly — by passing a payload that
// marshals fine. To trigger json.Marshal failure we need an unmarshalable
// type; DecisionPayload is concrete so we instead drive the success path
// of every branch (covered by NestedShapes).
func TestExtend_PayloadIsCopied(t *testing.T) {
	seed := Seed()
	c, _ := Canonicalize(samplePayload())
	row := Extend(seed, c)
	// Mutate the source slice; row.CanonicalPayload must not change.
	original := append([]byte(nil), row.CanonicalPayload...)
	c[0] ^= 0xFF
	if !bytes.Equal(row.CanonicalPayload, original) {
		t.Error("Extend did not copy canonicalPayload — mutating source affected row")
	}
}
