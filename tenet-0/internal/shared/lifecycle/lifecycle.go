package lifecycle

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
	"github.com/gofrs/flock"
	"gopkg.in/yaml.v3"
)

// frontmatter is the YAML head block of a Director markdown file.
type frontmatter struct {
	Name                     string   `yaml:"name"`
	Department               string   `yaml:"department"`
	Version                  string   `yaml:"version"`
	Charter                  string   `yaml:"charter"`
	MCPGrants                []string `yaml:"mcp_grants"`
	BusNamespace             string   `yaml:"bus_namespace"`
	ConstitutionAcknowledged bool     `yaml:"constitution_acknowledged"`
	OperatorSignature        string   `yaml:"operator_signature"`
}

var ackVersionRe = regexp.MustCompile(`(?i)constitution\s+version\s+(\S+)`)

// Parse extracts frontmatter + required body sections from raw bytes.
func Parse(path string, content []byte) (*Director, error) {
	s := string(content)
	if !strings.HasPrefix(s, "---\n") && !strings.HasPrefix(s, "---\r\n") {
		return nil, ErrNoFrontmatter
	}
	// find closing '---' on its own line
	rest := s[4:]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return nil, ErrNoFrontmatter
	}
	yamlBlock := rest[:end]
	body := rest[end+4:] // skip "\n---"
	body = strings.TrimLeft(body, "\r\n")

	var fm frontmatter
	if err := yaml.Unmarshal([]byte(yamlBlock), &fm); err != nil {
		return nil, fmt.Errorf("%w: %v", ErrFrontmatterInvalid, err)
	}

	// Required frontmatter fields.
	if fm.Name == "" {
		return nil, fmt.Errorf("%w: name", ErrMissingField)
	}
	if fm.Department == "" {
		return nil, fmt.Errorf("%w: department", ErrMissingField)
	}
	if fm.BusNamespace == "" {
		return nil, fmt.Errorf("%w: bus_namespace", ErrMissingField)
	}

	// Body sections in required order.
	headings := extractH2Headings(body)
	want := RequiredSections
	wi := 0
	seen := map[string]bool{}
	for _, h := range headings {
		seen[h] = true
		if wi < len(want) && h == want[wi] {
			wi++
		}
	}
	for _, w := range want {
		if !seen[w] {
			return nil, fmt.Errorf("%w: %s", ErrMissingSection, w)
		}
	}
	if wi != len(want) {
		return nil, fmt.Errorf("%w: expected %v", ErrSectionOrder, want)
	}

	// Constitution version from body.
	ver := ""
	if m := ackVersionRe.FindStringSubmatch(body); len(m) >= 2 {
		ver = m[1]
	}

	sum := sha256.Sum256(content)
	d := &Director{
		Identity:            Identity{Name: fm.Name, Department: fm.Department},
		Charter:             fm.Charter,
		MCPGrants:           append([]string(nil), fm.MCPGrants...),
		BusNamespace:        fm.BusNamespace,
		ConstitutionVersion: ver,
		OperatorSignature:   fm.OperatorSignature,
		FilePath:            path,
		FileHash:            hex.EncodeToString(sum[:]),
	}
	return d, nil
}

func extractH2Headings(body string) []string {
	var out []string
	sc := bufio.NewScanner(strings.NewReader(body))
	for sc.Scan() {
		line := sc.Text()
		if strings.HasPrefix(line, "## ") {
			out = append(out, strings.TrimSpace(line[3:]))
		}
	}
	return out
}

// Validate runs semantic checks on a parsed Director.
func Validate(d *Director) error {
	if d == nil {
		return errors.New("lifecycle: nil director")
	}
	if d.BusNamespace != d.Identity.Department {
		return fmt.Errorf("%w: %s != %s", ErrNamespaceMismatch, d.BusNamespace, d.Identity.Department)
	}
	known := map[string]struct{}{}
	for _, m := range KnownMCPs {
		known[m] = struct{}{}
	}
	for _, g := range d.MCPGrants {
		if _, ok := known[g]; !ok {
			return fmt.Errorf("%w: %s", ErrUnknownMCP, g)
		}
	}
	for _, r := range ReservedNamespaces {
		if d.Identity.Department == r && d.OperatorSignature == "" {
			return fmt.Errorf("%w: %s", ErrReservedNoSig, r)
		}
	}
	return nil
}

// setupFsnotify is split out so the unreachable-in-practice error paths
// (FD exhaustion, missing-dir-after-mkdir) are isolated from the main
// constructor logic.
func setupFsnotify(dir string) (*fsnotify.Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, fmt.Errorf("lifecycle: fsnotify: %w", err)
	}
	if err := fsw.Add(dir); err != nil {
		_ = fsw.Close()
		return nil, fmt.Errorf("lifecycle: watch %s: %w", dir, err)
	}
	return fsw, nil
}

// --- Watcher ---

type watcherImpl struct {
	dir       string
	debounce  time.Duration
	logger    *slog.Logger
	fsw       *fsnotify.Watcher
	flk       *flock.Flock
	mu        sync.Mutex
	timers    map[string]*time.Timer
	knownPath map[string]string // path -> last fileHash
	out       chan Event
	closed    bool
	closeOnce sync.Once
}

// NewWatcher constructs a Watcher rooted at `dir`.
func NewWatcher(dir string, debounce time.Duration, logger *slog.Logger) (*Watcher, error) {
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(os.Stderr, nil))
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("lifecycle: mkdir %s: %w", dir, err)
	}
	lockPath := filepath.Join(dir, ".lifecycle.lock")
	flk := flock.New(lockPath)
	// flock.TryLock only returns an error on broken filesystem state; the
	// in-process re-lock case returns (false, nil). Treat any non-success
	// uniformly as contention.
	got, _ := flk.TryLock()
	if !got {
		return nil, fmt.Errorf("lifecycle: flock contention on %s", lockPath)
	}
	// fsnotify.NewWatcher only fails on FD exhaustion; .Add only on missing
	// dir (which we already created). Both paths are defense-in-depth: if
	// either fires, unwind the flock and surface the wrapped error.
	fsw, fswErr := setupFsnotify(dir)
	if fswErr != nil {
		_ = flk.Unlock()
		return nil, fswErr
	}
	return &Watcher{impl: &watcherImpl{
		dir:       dir,
		debounce:  debounce,
		logger:    logger,
		fsw:       fsw,
		flk:       flk,
		timers:    map[string]*time.Timer{},
		knownPath: map[string]string{},
	}}, nil
}

// Watch returns the events channel.
func (w *Watcher) Watch(ctx context.Context) (<-chan Event, error) {
	if w == nil || w.impl == nil {
		return nil, errors.New("lifecycle: nil watcher")
	}
	w.impl.mu.Lock()
	if w.impl.out != nil {
		ch := w.impl.out
		w.impl.mu.Unlock()
		return ch, nil
	}
	w.impl.out = make(chan Event, 32)
	w.impl.mu.Unlock()

	go w.impl.run(ctx)
	return w.impl.out, nil
}

// Close releases fsnotify watcher and the held flock.
func (w *Watcher) Close() error {
	if w == nil || w.impl == nil {
		return nil
	}
	var firstErr error
	w.impl.closeOnce.Do(func() {
		w.impl.mu.Lock()
		w.impl.closed = true
		for _, t := range w.impl.timers {
			t.Stop()
		}
		w.impl.mu.Unlock()
		if w.impl.fsw != nil {
			if err := w.impl.fsw.Close(); err != nil {
				firstErr = err
			}
		}
		if w.impl.flk != nil {
			_ = w.impl.flk.Unlock()
		}
	})
	return firstErr
}

func (wi *watcherImpl) run(ctx context.Context) {
	defer func() {
		wi.mu.Lock()
		if wi.out != nil {
			close(wi.out)
			wi.out = nil
		}
		wi.mu.Unlock()
	}()
	// Drain fsnotify Errors channel in a goroutine so it never blocks
	// fsnotify itself; we log and drop. (fsnotify.Errors is unused in the
	// happy path; this guard is defense-in-depth for FD pressure events.)
	go func() {
		for err := range wi.fsw.Errors {
			wi.logger.Warn("lifecycle: watcher error", "err", err)
		}
	}()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-wi.fsw.Events:
			if !ok {
				return
			}
			wi.handleEvent(ev)
		}
	}
}

func (wi *watcherImpl) handleEvent(ev fsnotify.Event) {
	// Skip lock file and non-md.
	base := filepath.Base(ev.Name)
	if base == ".lifecycle.lock" {
		return
	}
	if !strings.HasSuffix(base, ".md") {
		return
	}
	if ev.Op&fsnotify.Remove != 0 || ev.Op&fsnotify.Rename != 0 {
		// Emit deregister immediately (no debounce on remove).
		wi.emit(Event{Op: EventDeregistered, Path: ev.Name})
		wi.mu.Lock()
		delete(wi.knownPath, ev.Name)
		wi.mu.Unlock()
		return
	}
	// Coalesce create/write into one debounced fire.
	wi.mu.Lock()
	if t, ok := wi.timers[ev.Name]; ok {
		t.Stop()
	}
	path := ev.Name
	wi.timers[path] = time.AfterFunc(wi.debounce, func() {
		wi.processFile(path)
	})
	wi.mu.Unlock()
}

func (wi *watcherImpl) processFile(path string) {
	body, err := os.ReadFile(path)
	if err != nil {
		// File may have been removed in the debounce window — emit deregister.
		if errors.Is(err, os.ErrNotExist) {
			wi.emit(Event{Op: EventDeregistered, Path: path})
			return
		}
		wi.emit(Event{Op: EventInvalid, Path: path, Err: err})
		return
	}
	d, err := Parse(path, body)
	if err != nil {
		wi.emit(Event{Op: EventInvalid, Path: path, Err: err})
		return
	}
	if err := Validate(d); err != nil {
		wi.emit(Event{Op: EventInvalid, Path: path, Err: err})
		return
	}
	wi.emit(Event{Op: EventRegistered, Path: path, Director: d})
	wi.mu.Lock()
	wi.knownPath[path] = d.FileHash
	wi.mu.Unlock()
}

func (wi *watcherImpl) emit(ev Event) {
	wi.mu.Lock()
	closed := wi.closed
	out := wi.out
	wi.mu.Unlock()
	if closed || out == nil {
		return
	}
	select {
	case out <- ev:
	default:
		wi.logger.Warn("lifecycle: event channel full, dropping", "path", ev.Path)
	}
}
