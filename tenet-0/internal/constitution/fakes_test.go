package constitution

import (
	"context"
	"sync"

	sharedconst "github.com/overnightdesk/tenet-0/internal/shared/constitution"
	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

// fakeBusgo is a busgoClient implementation for tests. Each method is
// controllable via a function field; nil falls back to a canned value.
type fakeBusgo struct {
	mu sync.Mutex

	LoadCalls           int
	CurrentVersionCalls int

	LoadFn           func(ctx context.Context) (*busgo.LoadedConstitution, error)
	CurrentVersionFn func(ctx context.Context) (int64, error)
}

func (f *fakeBusgo) Load(ctx context.Context) (*busgo.LoadedConstitution, error) {
	f.mu.Lock()
	f.LoadCalls++
	fn := f.LoadFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx)
	}
	return &busgo.LoadedConstitution{
		VersionID: 42,
		ProseText: "# prose",
		RulesYAML: "version: 2\nrules: []\n",
	}, nil
}

func (f *fakeBusgo) CurrentVersion(ctx context.Context) (int64, error) {
	f.mu.Lock()
	f.CurrentVersionCalls++
	fn := f.CurrentVersionFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx)
	}
	return 42, nil
}

// fakeFile is a fileLoader implementation for tests. Supply File + raw bytes
// directly so tests can control the SHA256 input deterministically.
type fakeFile struct {
	mu sync.Mutex

	LoadCalls int

	Parsed *sharedconst.File
	Raw    []byte
	Err    error
}

func (f *fakeFile) Load() (*sharedconst.File, []byte, error) {
	f.mu.Lock()
	f.LoadCalls++
	f.mu.Unlock()
	if f.Err != nil {
		return nil, nil, f.Err
	}
	return f.Parsed, f.Raw, nil
}

// fakeReader is a busReader implementation for tests.
type fakeReader struct {
	mu sync.Mutex

	ListCalls []string // captured category arg (empty string = no filter)

	ListFn func(ctx context.Context, category string) ([]AuthorizationEvent, error)
}

func (f *fakeReader) ListAuthorizations(ctx context.Context, category string) ([]AuthorizationEvent, error) {
	f.mu.Lock()
	f.ListCalls = append(f.ListCalls, category)
	fn := f.ListFn
	f.mu.Unlock()
	if fn != nil {
		return fn(ctx, category)
	}
	return nil, nil
}

// newTestHandler constructs a Handler wired to the supplied fakes, bypassing
// the real New() (which would open pgx pools and read files).
func newTestHandler(bus busgoClient, file fileLoader, reader busReader, prose proseFunc) *Handler {
	return &Handler{
		bus:    bus,
		file:   file,
		reader: reader,
		prose:  prose,
	}
}

// constProse returns a proseFunc that always returns s.
func constProse(s string) proseFunc {
	return func() (string, error) { return s, nil }
}

// errProse returns a proseFunc that always errors.
func errProse(err error) proseFunc {
	return func() (string, error) { return "", err }
}

// sampleMatrixFile returns a constitution.File populated with one rule per
// approval mode and a small memory_access_matrix. Raw YAML bytes are the
// literal below so rules_hash is deterministic.
var sampleRawYAML = []byte("version: 2\nrules: []\n")

func sampleFile() *sharedconst.File {
	return &sharedconst.File{
		Version: 2,
		Rules: []sharedconst.Rule{
			{
				ID:               "fin-payment-outbound-requires-approval",
				EventTypePattern: "fin.payment.outbound",
				RequiresApproval: "per_action",
			},
			{
				ID:               "fin-refund-processed-blanket",
				EventTypePattern: "fin.refund.processed",
				RequiresApproval: "blanket_category",
				ApprovalCategory: "routine.finance.small_refund",
			},
			{
				ID:               "secops-violation-always-allowed",
				EventTypePattern: "secops.violation.*",
				RequiresApproval: "none",
			},
		},
		MemoryAccessMatrix: map[string]sharedconst.MatrixEntry{
			"president": {Write: []string{"president"}, Read: []string{"president", "ops", "tech"}},
			"ops":       {Write: []string{"ops"}, Read: []string{"ops"}},
		},
		MemoryScrubber: &sharedconst.ScrubberConfig{
			Version: 1,
			Layers:  []sharedconst.ScrubberLayer{{Name: "unicode_normalize", Enabled: true}},
		},
	}
}
