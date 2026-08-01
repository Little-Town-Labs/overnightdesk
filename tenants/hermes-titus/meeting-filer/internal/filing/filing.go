package filing

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
)

type Result struct{ RelativePath, Digest, Key string }

func CreateNote(root, reference, briefDigest, approvedAt string, route *model.ProjectRoute, brief model.Brief) (Result, error) {
	return createNote(root, reference, briefDigest, approvedAt, route, brief, nil)
}

func createNote(root, reference, briefDigest, approvedAt string, route *model.ProjectRoute, brief model.Brief, afterLink func(string, string) error) (Result, error) {
	approved, err := time.Parse(time.RFC3339Nano, approvedAt)
	if err != nil {
		return Result{}, errors.New("note_input_invalid")
	}
	noteKey, err := model.FilingItemKey(reference, briefDigest, "note", 0)
	if err != nil {
		return Result{}, errors.New("note_input_invalid")
	}
	directory := "00-inbox/meetings"
	if route != nil {
		directory = route.NoteDirectory
	}
	if !safeRelative(directory) {
		return Result{}, errors.New("note_route_invalid")
	}
	relative := filepath.ToSlash(filepath.Join(directory, approved.UTC().Format("2006-01-02")+"-"+reference+".md"))
	path := filepath.Join(root, filepath.FromSlash(relative))
	if err := verifyPath(root, filepath.Dir(path)); err != nil {
		return Result{}, err
	}
	if err := reconcileTemporaryNotes(filepath.Dir(path)); err != nil {
		return Result{}, err
	}
	body := Render(reference, noteKey, approvedAt, brief)
	digest := sha256.Sum256([]byte(body))
	digestHex := hex.EncodeToString(digest[:])
	temporary, err := os.CreateTemp(filepath.Dir(path), ".meeting-note-*")
	if err != nil {
		return Result{}, errors.New("note_unavailable")
	}
	temporaryPath := temporary.Name()
	cleanupTemporary := true
	defer func() {
		if cleanupTemporary {
			_ = os.Remove(temporaryPath)
		}
	}()
	if temporary.Chmod(0o600) != nil {
		temporary.Close()
		return Result{}, errors.New("note_unavailable")
	}
	if _, err := temporary.WriteString(body); err != nil || temporary.Sync() != nil || temporary.Close() != nil {
		return Result{}, errors.New("note_unavailable")
	}
	// Link installs the complete, fsynced inode atomically and never replaces an
	// existing note. Unlike writing the final path, a crash cannot expose a
	// partial committed note.
	if err := os.Link(temporaryPath, path); err != nil {
		if !errors.Is(err, os.ErrExist) {
			return Result{}, errors.New("note_unavailable")
		}
		info, statErr := os.Lstat(path)
		if statErr != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return Result{}, errors.New("note_conflict")
		}
		existing, readErr := os.ReadFile(path)
		if readErr != nil {
			return Result{}, errors.New("note_unavailable")
		}
		existingDigest := sha256.Sum256(existing)
		if hex.EncodeToString(existingDigest[:]) != digestHex {
			return Result{}, errors.New("note_conflict")
		}
		return Result{RelativePath: relative, Digest: digestHex, Key: noteKey}, nil
	}
	if afterLink != nil {
		if err := afterLink(temporaryPath, path); err != nil {
			// The test hook models process death: neither deferred cleanup nor
			// subsequent directory synchronization would run.
			cleanupTemporary = false
			return Result{}, err
		}
	}
	if err := os.Remove(temporaryPath); err != nil {
		return Result{}, errors.New("note_unavailable")
	}
	cleanupTemporary = false
	dir, err := os.Open(filepath.Dir(path))
	if err != nil {
		return Result{}, errors.New("note_unavailable")
	}
	defer dir.Close()
	if dir.Sync() != nil {
		return Result{}, errors.New("note_unavailable")
	}
	return Result{RelativePath: relative, Digest: digestHex, Key: noteKey}, nil
}

func reconcileTemporaryNotes(directory string) error {
	entries, err := os.ReadDir(directory)
	if err != nil {
		return errors.New("note_unavailable")
	}
	removed := false
	for _, entry := range entries {
		if !strings.HasPrefix(entry.Name(), ".meeting-note-") {
			continue
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return errors.New("note_conflict")
		}
		if err := os.Remove(filepath.Join(directory, entry.Name())); err != nil {
			return errors.New("note_unavailable")
		}
		removed = true
	}
	if !removed {
		return nil
	}
	dir, err := os.Open(directory)
	if err != nil {
		return errors.New("note_unavailable")
	}
	defer dir.Close()
	if dir.Sync() != nil {
		return errors.New("note_unavailable")
	}
	return nil
}

func Render(reference, noteKey, approvedAt string, brief model.Brief) string {
	var output strings.Builder
	fmt.Fprintf(&output, "# %s\n\n- Reference: `%s`\n- Filing key: `%s`\n- Occurred: `%s`\n- Approved: `%s`\n\n", escape(brief.Title), reference, noteKey, brief.OccurredAt, approvedAt)
	output.WriteString("## Source-derived summary\n\n" + escape(brief.Summary) + "\n\n")
	writeList(&output, "Source-derived facts", brief.Facts)
	writeList(&output, "Source-derived decisions", brief.Decisions)
	writeList(&output, "Source-derived unresolved questions", brief.UnresolvedQuestions)
	output.WriteString("## Internal action tracking\n\n")
	for _, item := range brief.ActionItems {
		fmt.Fprintf(&output, "- [ ] %s (owner: %s; source: %s)\n", escape(item.Title), item.Owner, item.SourceTimestamp)
	}
	for _, item := range brief.ExternalCommitments {
		fmt.Fprintf(&output, "- [ ] External commitment tracked internally only: %s (source: %s)\n", escape(item.Title), item.SourceTimestamp)
	}
	if len(brief.ActionItems) == 0 && len(brief.ExternalCommitments) == 0 {
		output.WriteString("- None.\n")
	}
	output.WriteString("\n## Draft proposal - not performed\n\n")
	if brief.ProposedFollowUp == "" {
		output.WriteString("None.\n")
	} else {
		output.WriteString(escape(brief.ProposedFollowUp) + "\n")
	}
	return output.String()
}

func writeList(output *strings.Builder, heading string, values []string) {
	fmt.Fprintf(output, "## %s\n\n", heading)
	if len(values) == 0 {
		output.WriteString("- None.\n\n")
		return
	}
	for _, value := range values {
		fmt.Fprintf(output, "- %s\n", escape(value))
	}
	output.WriteString("\n")
}
func escape(value string) string {
	return strings.NewReplacer("\\", "\\\\", "`", "\\`", "*", "\\*", "_", "\\_", "[", "\\[", "]", "\\]", "<", "&lt;", ">", "&gt;").Replace(value)
}
func safeRelative(value string) bool {
	return value != "" && !filepath.IsAbs(value) && filepath.Clean(value) == value && value != "." && !strings.HasPrefix(value, "../")
}

func verifyPath(root, directory string) error {
	cleanRoot := filepath.Clean(root)
	cleanDirectory := filepath.Clean(directory)
	relative, err := filepath.Rel(cleanRoot, cleanDirectory)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return errors.New("note_route_invalid")
	}
	current := cleanRoot
	for _, part := range strings.Split(relative, string(filepath.Separator)) {
		if part == "." || part == "" {
			continue
		}
		current = filepath.Join(current, part)
		info, err := os.Lstat(current)
		if err != nil {
			return errors.New("note_route_invalid")
		}
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return errors.New("note_route_invalid")
		}
	}
	return nil
}
