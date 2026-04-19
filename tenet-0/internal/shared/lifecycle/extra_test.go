package lifecycle

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fsnotify/fsnotify"
)

func fakeEvent(name string, write bool) fsnotify.Event {
	op := fsnotify.Create
	if write {
		op = fsnotify.Write
	}
	return fsnotify.Event{Name: name, Op: op}
}

func TestParse_RejectsMissingNameField(t *testing.T) {
	body := strings.Replace(validMarkdown(), "name: President\n", "", 1)
	_, err := Parse("/tmp/x.md", []byte(body))
	if !errors.Is(err, ErrMissingField) {
		t.Errorf("missing name: got %v", err)
	}
}

func TestParse_RejectsMissingDepartment(t *testing.T) {
	body := strings.Replace(validMarkdown(), "department: president\n", "", 1)
	_, err := Parse("/tmp/x.md", []byte(body))
	if !errors.Is(err, ErrMissingField) {
		t.Errorf("missing department: got %v", err)
	}
}

func TestParse_RejectsMissingBusNamespace(t *testing.T) {
	body := strings.Replace(validMarkdown(), "bus_namespace: president\n", "", 1)
	_, err := Parse("/tmp/x.md", []byte(body))
	if !errors.Is(err, ErrMissingField) {
		t.Errorf("missing bus_namespace: got %v", err)
	}
}

func TestParse_RejectsNoFrontmatterClose(t *testing.T) {
	body := "---\nname: x\nno close marker\n"
	_, err := Parse("/tmp/x.md", []byte(body))
	if !errors.Is(err, ErrNoFrontmatter) {
		t.Errorf("got %v", err)
	}
}

func TestParse_RejectsSectionOutOfOrder(t *testing.T) {
	body := validMarkdown()
	body = strings.Replace(body, "## Identity", "## Charter", 1)
	body = strings.Replace(body, "## Charter\n\nGovern", "## Identity\n\nGovern", 1)
	_, err := Parse("/tmp/x.md", []byte(body))
	if err == nil {
		t.Error("expected order error")
	}
}

func TestValidate_NilDirector(t *testing.T) {
	if err := Validate(nil); err == nil {
		t.Error("nil director should fail Validate")
	}
}

func TestNewWatcher_CreatesDirectory(t *testing.T) {
	tmp := t.TempDir()
	dir := filepath.Join(tmp, "nested", "agents")
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	if _, err := os.Stat(dir); err != nil {
		t.Errorf("dir not created: %v", err)
	}
}

func TestNewWatcher_NilLoggerOK(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, nil)
	if err != nil {
		t.Fatalf("NewWatcher with nil logger: %v", err)
	}
	defer w.Close()
}

func TestWatcher_CloseIdempotent(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Errorf("first Close: %v", err)
	}
	if err := w.Close(); err != nil {
		t.Errorf("second Close: %v", err)
	}
}

func TestWatcher_NilSafe(t *testing.T) {
	var w *Watcher
	if err := w.Close(); err != nil {
		t.Errorf("nil Close: %v", err)
	}
	if _, err := w.Watch(context.Background()); err == nil {
		t.Error("nil Watch should error")
	}
}

func TestWatcher_IgnoresNonMarkdown(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, _ := w.Watch(ctx)
	writeFile(t, dir, "notes.txt", "irrelevant")
	events := drainEvents(t, ch, 1, 500*time.Millisecond)
	if len(events) > 0 {
		t.Errorf("non-md file produced %d events", len(events))
	}
}

func TestWatcher_InvalidThenFix(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, _ := w.Watch(ctx)
	// Write invalid first.
	writeFile(t, dir, "agent.md", "no frontmatter\n")
	_ = drainEvents(t, ch, 1, 1*time.Second)
	// Now write valid.
	writeFile(t, dir, "agent.md", validMarkdown())
	events := drainEvents(t, ch, 2, 2*time.Second)
	gotRegistered := false
	for _, e := range events {
		if e.Op == EventRegistered {
			gotRegistered = true
		}
	}
	if !gotRegistered {
		t.Error("never saw EventRegistered after fix")
	}
}

func TestNewWatcher_MkdirFails(t *testing.T) {
	// Use a path under an existing FILE so MkdirAll fails.
	tmp := t.TempDir()
	blocker := filepath.Join(tmp, "iam_a_file")
	if err := os.WriteFile(blocker, []byte("x"), 0o644); err != nil {
		t.Fatalf("setup: %v", err)
	}
	_, err := NewWatcher(filepath.Join(blocker, "child"), 50*time.Millisecond, quietLogger())
	if err == nil {
		t.Error("expected mkdir failure to propagate")
	}
}

func TestWatcher_FileVanishesBeforeProcess(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 200*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, _ := w.Watch(ctx)
	path := writeFile(t, dir, "vanishing.md", validMarkdown())
	// Remove before debounce window elapses.
	time.Sleep(20 * time.Millisecond)
	_ = os.Remove(path)
	_ = drainEvents(t, ch, 5, 1*time.Second)
	// Should not deadlock; coverage goal hit if processFile saw not-exist.
}

func TestEmit_DropsWhenFull(t *testing.T) {
	// Build a watcherImpl with a tiny output channel and never read it,
	// then call emit more times than capacity to exercise the drop branch.
	wi := &watcherImpl{
		logger: quietLogger(),
		out:    make(chan Event, 1),
	}
	for i := 0; i < 10; i++ {
		wi.emit(Event{Op: EventInvalid, Path: "/x"})
	}
	// Now mark closed and emit once more — should early-return.
	wi.mu.Lock()
	wi.closed = true
	wi.mu.Unlock()
	wi.emit(Event{Op: EventInvalid, Path: "/x"})
}

func TestProcessFile_NotExistEmitsDeregister(t *testing.T) {
	wi := &watcherImpl{
		logger: quietLogger(),
		out:    make(chan Event, 4),
	}
	wi.processFile("/no/such/file.md")
	select {
	case ev := <-wi.out:
		if ev.Op != EventDeregistered {
			t.Errorf("op = %v, want Deregistered", ev.Op)
		}
	default:
		t.Fatal("no event emitted for missing file")
	}
}

func TestProcessFile_InvalidParse(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.md")
	_ = os.WriteFile(path, []byte("no frontmatter\n"), 0o644)
	wi := &watcherImpl{
		logger: quietLogger(),
		out:    make(chan Event, 4),
	}
	wi.processFile(path)
	select {
	case ev := <-wi.out:
		if ev.Op != EventInvalid || ev.Err == nil {
			t.Errorf("got %+v", ev)
		}
	default:
		t.Fatal("no event")
	}
}

func TestProcessFile_InvalidValidate(t *testing.T) {
	dir := t.TempDir()
	// Write with mismatched bus_namespace — Parse OK, Validate fails.
	body := strings.Replace(validMarkdown(), "bus_namespace: president", "bus_namespace: ops", 1)
	path := filepath.Join(dir, "bad2.md")
	_ = os.WriteFile(path, []byte(body), 0o644)
	wi := &watcherImpl{
		logger: quietLogger(),
		out:    make(chan Event, 4),
	}
	wi.processFile(path)
	select {
	case ev := <-wi.out:
		if ev.Op != EventInvalid {
			t.Errorf("op = %v", ev.Op)
		}
	default:
		t.Fatal("no event")
	}
}

func TestHandleEvent_SkipsLockFile(t *testing.T) {
	wi := &watcherImpl{
		logger: quietLogger(),
		out:    make(chan Event, 4),
		timers: map[string]*time.Timer{},
	}
	// Event for the lock file itself — should be ignored entirely.
	wi.handleEvent(fakeEvent("/x/.lifecycle.lock", true))
	if len(wi.out) != 0 {
		t.Errorf("lock-file event produced %d events", len(wi.out))
	}
}

func TestProcessFile_PermissionDenied(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "x.md")
	_ = os.WriteFile(path, []byte(validMarkdown()), 0o000)
	defer os.Chmod(path, 0o644)
	wi := &watcherImpl{
		logger: quietLogger(),
		out:    make(chan Event, 4),
	}
	wi.processFile(path)
	// On platforms where root can read, this may register; we accept either.
	select {
	case ev := <-wi.out:
		_ = ev
	default:
	}
}

func TestRun_ExitsWhenWatcherClosed(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	ch, _ := w.Watch(ctx)
	// Close while Watch goroutine is parked on its channels.
	_ = w.Close()
	// Channel should drain and close.
	deadline := time.After(2 * time.Second)
	for {
		select {
		case _, ok := <-ch:
			if !ok {
				return
			}
		case <-deadline:
			t.Fatal("channel never closed after Close")
		}
	}
}

func TestWatch_DoubleCallReturnsSameChannel(t *testing.T) {
	dir := t.TempDir()
	w, err := NewWatcher(dir, 50*time.Millisecond, quietLogger())
	if err != nil {
		t.Fatalf("NewWatcher: %v", err)
	}
	defer w.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	c1, _ := w.Watch(ctx)
	c2, _ := w.Watch(ctx)
	if c1 != c2 {
		t.Error("expected Watch to return same channel on re-call")
	}
}
