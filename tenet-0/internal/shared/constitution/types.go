// Package constitution defines the in-memory representation of Tenet-0's
// machine-readable constitution-rules.yaml. The yaml structures here are the
// source of truth for what fields downstream consumers (bus rule evaluator,
// memory access matrix MCP, memory scrubber) expect to find.
//
// Backward compatibility: any field added in v2+ is optional from a parser
// standpoint — code that does not need the new section ignores it. The bus
// (Feature 49) and the President runtime (Feature 50) co-exist by reading
// only the sections they care about.
package constitution

// File is the top-level shape of constitution-rules.yaml.
type File struct {
	Version int     `yaml:"version"`
	Rules   []Rule  `yaml:"rules"`

	// MemoryAccessMatrix is the per-Director read/write grant table.
	// Added in version 2 (Feature 50). Optional for parsers that only care
	// about Rules. See spec FR-13.
	MemoryAccessMatrix map[string]MatrixEntry `yaml:"memory_access_matrix,omitempty"`

	// MemoryScrubber is the layered PII detection catalog applied to
	// every memory write. Added in version 2 (Feature 50). Optional.
	// See spec FR-15 and security strategy §5.
	MemoryScrubber *ScrubberConfig `yaml:"memory_scrubber,omitempty"`
}

// Rule is one constitutional event-rule. Existing v1 shape, unchanged.
type Rule struct {
	ID                string `yaml:"id"`
	Description       string `yaml:"description,omitempty"`
	EventTypePattern  string `yaml:"event_type_pattern"`
	RequiresApproval  string `yaml:"requires_approval"`
	ApprovalCategory  string `yaml:"approval_category,omitempty"`
}

// MatrixEntry lists which other namespaces a Director may read/write.
// "write" lists are typically just the Director's own namespace; "read"
// lists may be longer for President + SecOps roles.
type MatrixEntry struct {
	Write []string `yaml:"write"`
	Read  []string `yaml:"read"`
}

// ScrubberConfig is the seven-layer PII detection pipeline.
// Layers run in order; the first layer that matches rejects the write.
type ScrubberConfig struct {
	Version int             `yaml:"version"`
	Layers  []ScrubberLayer `yaml:"layers"`
}

// ScrubberLayer is one detection step in the pipeline. Each layer's
// shape is intentionally generic — the executor in
// internal/shared/scrubber/ interprets the named layer per its own rules.
type ScrubberLayer struct {
	Name    string                 `yaml:"name"`
	Enabled bool                   `yaml:"enabled"`
	// Layer-specific config; passed through opaquely. Examples:
	//   decoders: [base64, rot13, hex]               (encoding_decode layer)
	//   allowlist: ["billing@vendor.example"]        (customer_email layer)
	//   require_context_word: true                   (credit_card layer)
	//   speaker_labels: [Customer, Tenant, ...]      (conversation_transcript)
	//   threshold_bits_per_char: 4.5                 (high_entropy)
	//   min_length: 64                               (high_entropy)
	Extras map[string]interface{} `yaml:",inline"`
}
