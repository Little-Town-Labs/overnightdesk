package lifecycle

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

// validMarkdown returns a freshly-allocated, fully-conforming Director
// markdown file body. Tests mutate copies to exercise specific failure
// modes.
func validMarkdown() string {
	return `---
name: President
department: president
version: 1.0.0
charter: "Govern Tenet-0 by reviewing department activity, deciding pre-approval requests, routing escalations, and synthesizing daily digests grounded in cross-departmental memory."
mcp_grants:
  - tenet0-bus-mcp
  - tenet0-constitution-mcp
  - tenet0-governor-mcp
  - tenet0-pending-mcp
  - tenet0-audit-mcp
  - tenet0-director-memory-mcp
bus_namespace: president
constitution_acknowledged: true
operator_signature: "deadbeefcafebabedeadbeefcafebabe"
---

## Identity

I am the President Director. My department is president. I orchestrate
cross-departmental decisions and own the executive memory namespace.

## Charter

Govern Tenet-0 by reviewing department activity, deciding pre-approval
requests, routing escalations, and synthesizing daily digests grounded
in cross-departmental memory. Operate under constitution v2.

## MCP Grants

- tenet0-bus-mcp
- tenet0-constitution-mcp
- tenet0-governor-mcp
- tenet0-pending-mcp
- tenet0-audit-mcp
- tenet0-director-memory-mcp

## Memory Protocol

Use tenet0-director-memory-mcp via load_memory_index on cold start and
write_memory for new entries. Writes are append-only with supersede
semantics. Every write passes through the pre-write scrubber before
persisting.

## Constitutional Acknowledgment

I acknowledge constitution version 2 and the memory access matrix that
binds the President's read scope and write scope.
`
}

func TestParse_GoldenFile(t *testing.T) {
	d, err := Parse("/tmp/president.md", []byte(validMarkdown()))
	if err != nil {
		t.Fatalf("Parse golden: %v", err)
	}
	if d == nil {
		t.Fatal("Parse returned nil director")
	}
	if d.Identity.Name != "President" {
		t.Errorf("Identity.Name = %q, want President", d.Identity.Name)
	}
	if d.Identity.Department != "president" {
		t.Errorf("Identity.Department = %q, want president", d.Identity.Department)
	}
	if d.BusNamespace != "president" {
		t.Errorf("BusNamespace = %q, want president", d.BusNamespace)
	}
	if len(d.MCPGrants) != 6 {
		t.Errorf("MCPGrants len = %d, want 6", len(d.MCPGrants))
	}
	if d.FilePath != "/tmp/president.md" {
		t.Errorf("FilePath not preserved: %q", d.FilePath)
	}
	if d.FileHash == "" {
		t.Error("FileHash empty — should be SHA256 of raw bytes")
	}
}

func TestParse_RejectsMissingFrontmatter(t *testing.T) {
	body := "## Identity\n\nNo frontmatter here.\n"
	_, err := Parse("/tmp/x.md", []byte(body))
	if !errors.Is(err, ErrNoFrontmatter) {
		t.Fatalf("Parse without frontmatter returned %v, want ErrNoFrontmatter", err)
	}
}

func TestParse_RejectsMalformedYAML(t *testing.T) {
	body := "---\nname: [unterminated\n---\n## Identity\nbody\n"
	_, err := Parse("/tmp/x.md", []byte(body))
	if !errors.Is(err, ErrFrontmatterInvalid) {
		t.Fatalf("Parse with bad YAML returned %v, want ErrFrontmatterInvalid", err)
	}
}

func TestParse_RejectsMissingEachSection(t *testing.T) {
	for _, section := range RequiredSections {
		section := section
		t.Run("missing_"+strings.ReplaceAll(section, " ", "_"), func(t *testing.T) {
			body := validMarkdown()
			// Excise just the H2 heading line for this section.
			marker := "## " + section
			idx := strings.Index(body, marker)
			if idx < 0 {
				t.Fatalf("setup: section %q not present in golden", section)
			}
			// Replace the heading with a non-heading so the section is gone.
			mutated := body[:idx] + "REMOVED " + section + body[idx+len(marker):]
			_, err := Parse("/tmp/x.md", []byte(mutated))
			if !errors.Is(err, ErrMissingSection) {
				t.Fatalf("Parse without section %q returned %v, want ErrMissingSection",
					section, err)
			}
		})
	}
}

func TestValidate_AcceptsGolden(t *testing.T) {
	d, err := Parse("/tmp/president.md", []byte(validMarkdown()))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if err := Validate(d); err != nil {
		t.Fatalf("Validate rejected golden: %v", err)
	}
}

func TestValidate_RejectsNamespaceMismatch(t *testing.T) {
	d, err := Parse("/tmp/x.md", []byte(validMarkdown()))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	d.BusNamespace = "ops" // department is "president" — mismatch
	if err := Validate(d); !errors.Is(err, ErrNamespaceMismatch) {
		t.Fatalf("Validate returned %v, want ErrNamespaceMismatch", err)
	}
}

func TestValidate_RejectsUnknownMCP(t *testing.T) {
	d, err := Parse("/tmp/x.md", []byte(validMarkdown()))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	d.MCPGrants = append(d.MCPGrants, "evil-mcp")
	if err := Validate(d); !errors.Is(err, ErrUnknownMCP) {
		t.Fatalf("Validate returned %v, want ErrUnknownMCP", err)
	}
}

func TestValidate_RejectsReservedWithoutSignature(t *testing.T) {
	d, err := Parse("/tmp/x.md", []byte(validMarkdown()))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	d.OperatorSignature = ""
	if err := Validate(d); !errors.Is(err, ErrReservedNoSig) {
		t.Fatalf("Validate (reserved, no sig) returned %v, want ErrReservedNoSig", err)
	}
}

func TestValidate_AcceptsNonReservedWithoutSignature(t *testing.T) {
	body := strings.ReplaceAll(validMarkdown(), "department: president", "department: ops")
	body = strings.ReplaceAll(body, "bus_namespace: president", "bus_namespace: ops")
	body = strings.ReplaceAll(body, `operator_signature: "deadbeefcafebabedeadbeefcafebabe"`+"\n", "")
	d, err := Parse("/tmp/ops.md", []byte(body))
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if err := Validate(d); err != nil {
		t.Errorf("Validate (non-reserved, no sig) errored: %v", err)
	}
}

// --- Watcher tests ---

func quietLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func writeFile(t *testing.T, dir, name, body string) string {
	t.Helper()
	p := filepath.Join(dir, name)
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatalf("write %s: %v", p, err)
	}
	return p
}

// drainEvents reads up to `max` events from ch with a per-event timeout.
func drainEvents(t *testing.T, ch <-chan Event, max int, timeout time.Duration) []Event {
	t.Helper()
	out := []Event{}
	for i := 0; i < max; i++ {
		select {
		case e, ok := <-ch:
			if !ok {
				return out
			}
			out = append(out, e)
		case <-time.After(timeout):
			return out
		}
	}
	return out
}

func TestWatcher_FiresOnCreate(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 100*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := w.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	writeFile(t, dir, "president.md", validMarkdown())
	events := drainEvents(t, ch, 1, 2*time.Second)
	if len(events) == 0 {
		t.Fatal("no events received after create")
	}
	if events[0].Op != EventRegistered {
		t.Errorf("first event Op = %v, want EventRegistered", events[0].Op)
	}
}

func TestWatcher_FiresOnRemove(t *testing.T) {
	dir := t.TempDir()
	path := writeFile(t, dir, "president.md", validMarkdown())
	w, err := NewWatcher(dir, 100*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := w.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	// drain initial register if emitted on startup scan
	_ = drainEvents(t, ch, 1, 500*time.Millisecond)
	if err := os.Remove(path); err != nil {
		t.Fatalf("remove: %v", err)
	}
	events := drainEvents(t, ch, 1, 2*time.Second)
	if len(events) == 0 {
		t.Fatal("no events after remove")
	}
	if events[len(events)-1].Op != EventDeregistered {
		t.Errorf("last event Op = %v, want EventDeregistered", events[len(events)-1].Op)
	}
}

func TestWatcher_FiresOnInvalid(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 100*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := w.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	writeFile(t, dir, "broken.md", "no frontmatter here\n")
	events := drainEvents(t, ch, 1, 2*time.Second)
	if len(events) == 0 {
		t.Fatal("no events after invalid file write")
	}
	if events[0].Op != EventInvalid {
		t.Errorf("Op = %v, want EventInvalid", events[0].Op)
	}
	if events[0].Err == nil {
		t.Error("EventInvalid without Err populated")
	}
}

func TestWatcher_DebounceCoalesces(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 200*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := w.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	// 5 rapid writes inside the debounce window.
	for i := 0; i < 5; i++ {
		writeFile(t, dir, "president.md", validMarkdown())
		time.Sleep(10 * time.Millisecond)
	}
	events := drainEvents(t, ch, 10, 1*time.Second)
	if len(events) > 2 {
		t.Errorf("debounce failed to coalesce: got %d events, want 1-2", len(events))
	}
}

func TestWatcher_ExitsOnContextCancel(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 100*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	ch, err := w.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}
	cancel()
	select {
	case _, ok := <-ch:
		if ok {
			// drained at least one residual event; that's fine, but channel
			// must close eventually
			select {
			case _, ok2 := <-ch:
				if ok2 {
					t.Error("channel still open after context cancel and residual drain")
				}
			case <-time.After(2 * time.Second):
				t.Error("channel not closed after context cancel")
			}
		}
	case <-time.After(2 * time.Second):
		t.Error("Watch channel did not unblock after context cancel")
	}
}

func TestWatcher_FlockContention(t *testing.T) {
	dir := t.TempDir()
	w1, err := NewWatcher(dir, 100*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher #1: %v", err)
	}
	defer w1.Close()
	_, err = NewWatcher(dir, 100*time.Millisecond, quietLogger())
	if err == nil {
		t.Error("second NewWatcher on same dir should fail (advisory flock contention)")
	}
}

func TestWatcher_ConcurrentEventsRaceFree(t *testing.T) {
	if testing.Short() {
		t.Skip("skip concurrent watcher test in -short")
	}
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, err := w.Watch(ctx)
	if err != nil {
		t.Fatalf("Watch: %v", err)
	}

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			path := filepath.Join(dir, "agent_"+string(rune('a'+i))+".md")
			for j := 0; j < 5; j++ {
				_ = os.WriteFile(path, []byte(validMarkdown()), 0o644)
				time.Sleep(20 * time.Millisecond)
			}
		}(i)
	}
	wg.Wait()
	_ = drainEvents(t, ch, 50, 1*time.Second)
}
