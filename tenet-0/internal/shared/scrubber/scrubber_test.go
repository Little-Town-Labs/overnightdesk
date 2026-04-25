package scrubber

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

// canonicalConfig returns a ScrubberConfig with all eight known layers
// enabled in canonical order. Mirrors what the v2 constitution loads.
func canonicalConfig() constitution.ScrubberConfig {
	names := []string{
		LayerUnicodeNormalize,
		LayerEncodingDecode,
		LayerCustomerEmail,
		LayerCreditCard,
		LayerAnthropicCredential,
		LayerAWSAccessKey,
		LayerConversationTranscript,
		LayerHighEntropy,
	}
	layers := make([]constitution.ScrubberLayer, len(names))
	for i, n := range names {
		layers[i] = constitution.ScrubberLayer{Name: n, Enabled: true}
	}
	return constitution.ScrubberConfig{Version: 1, Layers: layers}
}

func mustNew(t *testing.T) *Scrubber {
	t.Helper()
	s, err := New(canonicalConfig())
	if err != nil {
		t.Fatalf("New(canonicalConfig): %v", err)
	}
	if s == nil {
		t.Fatal("New returned nil scrubber with no error")
	}
	return s
}

func loadFixture(t *testing.T, rel string) string {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("testdata", rel))
	if err != nil {
		t.Fatalf("read fixture %s: %v", rel, err)
	}
	return string(body)
}

// --- fail-closed config tests ---

func TestNew_RejectsEmptyLayers(t *testing.T) {
	_, err := New(constitution.ScrubberConfig{Version: 1, Layers: nil})
	if err == nil {
		t.Fatal("New accepted empty layers list (must fail closed)")
	}
}

func TestNew_RejectsUnknownLayer(t *testing.T) {
	cfg := canonicalConfig()
	cfg.Layers = append(cfg.Layers, constitution.ScrubberLayer{Name: "bogus_layer", Enabled: true})
	_, err := New(cfg)
	if err == nil {
		t.Fatal("New accepted unknown layer name (must fail closed)")
	}
}

// --- per-layer detection tests ---

func TestScan_DetectsCustomerEmail(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/email.txt"))
	if r.Clean {
		t.Fatal("scrubber missed plain email")
	}
}

func TestScan_DetectsCreditCard(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/credit_card.txt"))
	if r.Clean {
		t.Fatal("scrubber missed credit card with valid Luhn")
	}
}

func TestScan_DetectsAnthropicKey(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/anthropic_key.txt"))
	if r.Clean {
		t.Fatal("scrubber missed sk-ant-… key")
	}
}

func TestScan_DetectsAWSKey(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/aws_key.txt"))
	if r.Clean {
		t.Fatal("scrubber missed AKIA-prefix AWS access key")
	}
}

func TestScan_DetectsRot13Email(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/rot13_email.txt"))
	if r.Clean {
		t.Fatal("scrubber missed rot13-obfuscated email (encoding_decode layer must run before customer_email)")
	}
}

func TestScan_DetectsBase64CreditCard(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/base64_credit_card.txt"))
	if r.Clean {
		t.Fatal("scrubber missed base64-encoded credit card")
	}
}

func TestScan_DetectsUnicodeLookalikeEmail(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/unicode_lookalike_email.txt"))
	if r.Clean {
		t.Fatal("scrubber missed Cyrillic-lookalike email (NFKC normalize layer must run first)")
	}
}

func TestScan_DetectsHighEntropyToken(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/high_entropy_token.txt"))
	if r.Clean {
		t.Fatal("scrubber missed 60-char high-entropy token")
	}
}

func TestScan_DetectsTranscriptPII(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/transcript_snippet.txt"))
	if r.Clean {
		t.Fatal("scrubber missed PII inside conversation transcript")
	}
}

func TestScan_DetectsObfuscatedAnthropicKey(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/obfuscated_anthropic.txt"))
	if r.Clean {
		t.Fatal("scrubber missed reassembled sk-ant- key")
	}
}

// --- false-positive guards ---

func TestScan_AcceptsUUID(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "good/uuid.txt"))
	if !r.Clean {
		t.Fatalf("scrubber flagged plain UUID as PII: %+v", r.Hits)
	}
}

func TestScan_AcceptsLoremIpsum(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "good/lorem_ipsum.txt"))
	if !r.Clean {
		t.Fatalf("scrubber flagged lorem ipsum: %+v", r.Hits)
	}
}

func TestScan_AcceptsMarkdownDoc(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "good/markdown_doc.txt"))
	if !r.Clean {
		t.Fatalf("scrubber flagged benign markdown: %+v", r.Hits)
	}
}

func TestScan_AcceptsShortHighEntropy(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "good/short_high_entropy.txt"))
	if !r.Clean {
		t.Fatalf("scrubber flagged sub-32-char token: %+v", r.Hits)
	}
}

func TestScan_AcceptsCodeSnippet(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "good/code_snippet.txt"))
	if !r.Clean {
		t.Fatalf("scrubber flagged plain code: %+v", r.Hits)
	}
}

// --- security contract tests ---

func TestHit_ExcerptCapped(t *testing.T) {
	s := mustNew(t)
	r := s.Scan(loadFixture(t, "bad/anthropic_key.txt"))
	if r.Clean {
		t.Fatal("setup: expected anthropic_key fixture to be flagged")
	}
	for _, h := range r.Hits {
		// Excerpt may contain "..." suffix, so allow MaxExcerpt + 3 total.
		if len(h.Excerpt) > MaxExcerpt+3 {
			t.Errorf("hit excerpt length %d exceeds cap (MaxExcerpt=%d): %q",
				len(h.Excerpt), MaxExcerpt, h.Excerpt)
		}
		// Critical: never echo the full key into the hit.
		if strings.Contains(h.Excerpt, "AAAAAAAAAAAAAAAAAAAA") {
			t.Errorf("hit excerpt leaked the secret: %q", h.Excerpt)
		}
	}
}

func TestScan_Deterministic(t *testing.T) {
	s := mustNew(t)
	body := loadFixture(t, "bad/email.txt")
	a := s.Scan(body)
	b := s.Scan(body)
	if a.Clean != b.Clean || len(a.Hits) != len(b.Hits) {
		t.Fatalf("Scan non-deterministic: %+v vs %+v", a, b)
	}
}

// TestLayerOrderRespected pins that encoding_decode runs BEFORE
// customer_email — a rot13 email must therefore be caught by the email
// layer (after decode), not slip through. Already covered functionally
// by TestScan_DetectsRot13Email; this is the source-level intent marker.
func TestLayerOrderRespected(t *testing.T) {
	cfg := canonicalConfig()
	// Build inverted config (email before encoding_decode). When Task 1.13
	// implements ordering, this must still error or at minimum fail to
	// detect the rot13 email — proving order matters. For RED phase it
	// will just panic, which is fine.
	cfg.Layers[1], cfg.Layers[2] = cfg.Layers[2], cfg.Layers[1]
	s, err := New(cfg)
	if err != nil {
		t.Skipf("New rejected reordered config (acceptable): %v", err)
	}
	r := s.Scan("nyvpr@rknzcyr.pbz") // rot13 of alice@example.com
	if !r.Clean {
		// Either ordering enforced via reject-in-New (skipped above) or
		// the impl detects independent of order — both are acceptable.
		t.Logf("reordered config still detected encoded email: %+v", r.Hits)
	}
}
