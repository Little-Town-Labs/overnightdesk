// Package scrubber implements the seven-layer pre-write PII / secret
// detection pipeline applied to every president.director_memory.body
// (spec FR-15, plan §Memory Subsystem, research.md §PII Scrubber Catalog).
//
// Layers (executed in declared order; first match REJECTS the write):
//
//  1. unicode_normalize       — NFKC normalization (defeats lookalikes)
//  2. encoding_decode         — rot13 / base64 / hex unwrap
//  3. customer_email          — RFC5322-simplified email regex
//  4. credit_card             — 13–19 digit run with valid Luhn checksum
//  5. anthropic_credential    — sk-ant-… key shape
//  6. aws_access_key          — AKIA[0-9A-Z]{16}
//  7. high_entropy            — 32+ char run with Shannon entropy > 4.5 bpc,
//                               excluding well-formed UUIDs / known hashes
//
// Hits NEVER carry the raw match — the Excerpt field is capped at 16
// chars + "..." so audit logs and bus events cannot themselves leak the
// PII they refer to (security strategy §5).
//
// This file is a RED-phase stub (Task 1.12); Task 1.13 fills bodies.
package scrubber

import (
	"errors"

	"github.com/overnightdesk/tenet-0/internal/shared/constitution"
)

// MaxExcerpt caps the number of raw characters from the matched span
// that may appear in a Hit. Excerpts longer than this are truncated and
// suffixed with "...". Never raise this; the value is part of the
// security contract.
const MaxExcerpt = 16

// Known layer names. New("…") errors on any layer name not in this set
// (fail-closed against typos / unknown layers in constitution-rules.yaml).
const (
	LayerUnicodeNormalize       = "unicode_normalize"
	LayerEncodingDecode         = "encoding_decode"
	LayerCustomerEmail          = "customer_email"
	LayerCreditCard             = "credit_card"
	LayerAnthropicCredential    = "anthropic_credential"
	LayerAWSAccessKey           = "aws_access_key"
	LayerConversationTranscript = "conversation_transcript"
	LayerHighEntropy            = "high_entropy"
)

// ErrEmptyConfig is returned by New when the config has zero layers.
var ErrEmptyConfig = errors.New("scrubber: config has no layers (fail-closed)")

// ErrUnknownLayer is returned by New when the config references a layer
// name not in the supported set.
var ErrUnknownLayer = errors.New("scrubber: config references unknown layer")

// Hit is one detection finding. The Excerpt is intentionally short and
// must NEVER include the full matched secret.
type Hit struct {
	Layer     int    // 1-indexed position in the configured pipeline
	LayerName string // e.g. "credit_card"
	Reason    string // brief, audit-safe description
	Excerpt   string // ≤ MaxExcerpt chars + "..."
}

// Result is the outcome of one Scan call.
type Result struct {
	Clean bool
	Hits  []Hit
}

// Scrubber runs the configured detection pipeline against arbitrary text.
// It is safe for concurrent use after construction; New finalizes the
// pipeline and the resulting *Scrubber is read-only.
type Scrubber struct {
	impl *scrubberImpl
}

// MustScan is the panic-on-nil convenience used by init/test paths.
func (s *Scrubber) MustScan(input string) Result {
	if s == nil {
		panic("scrubber: MustScan called on nil *Scrubber")
	}
	return s.Scan(input)
}

// Implementations of New and Scan live in scrubber.go (Task 1.13).
var _ = constitution.ScrubberConfig{}
