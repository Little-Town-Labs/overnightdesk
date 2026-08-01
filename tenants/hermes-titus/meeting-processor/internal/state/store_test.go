package state

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func TestOpenInitializesPrivateVersionedState(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if store.Document().Version != CurrentVersion {
		t.Fatal("unexpected state version")
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("state mode = %o", info.Mode().Perm())
	}
}

func TestValidateRejectsSemanticallyInvalidState(t *testing.T) {
	tests := map[string]func(Document){
		"partial streams": func(doc Document) { delete(doc.Streams, "organizer_2:recording") },
		"stream key mismatch": func(doc Document) {
			stream := doc.Streams["organizer_1:transcript"]
			stream.ArtifactType = "recording"
			doc.Streams["organizer_1:transcript"] = stream
		},
		"stream fingerprint": func(doc Document) {
			stream := doc.Streams["organizer_1:transcript"]
			stream.OrganizerFingerprint = "not-a-digest"
			doc.Streams["organizer_1:transcript"] = stream
		},
		"stream continuation": func(doc Document) {
			stream := doc.Streams["organizer_1:transcript"]
			stream.DeltaLink = "https://evil.example/delta?deltaToken=x"
			doc.Streams["organizer_1:transcript"] = stream
		},
		"stream timestamp": func(doc Document) {
			stream := doc.Streams["organizer_1:transcript"]
			stream.LastSuccessAt = "yesterday"
			doc.Streams["organizer_1:transcript"] = stream
		},
		"negative count": func(doc Document) {
			stream := doc.Streams["organizer_1:transcript"]
			stream.ArtifactCount = -1
			doc.Streams["organizer_1:transcript"] = stream
		},
		"artifact key mismatch": func(doc Document) {
			artifact := doc.Artifacts[validArtifactReference]
			delete(doc.Artifacts, validArtifactReference)
			doc.Artifacts["different"] = artifact
		},
		"artifact stream mismatch": func(doc Document) {
			artifact := doc.Artifacts[validArtifactReference]
			artifact.OrganizerSlot = "organizer_2"
			doc.Artifacts[validArtifactReference] = artifact
		},
		"artifact provider id": func(doc Document) {
			artifact := doc.Artifacts[validArtifactReference]
			artifact.ProviderArtifactID = ""
			doc.Artifacts[validArtifactReference] = artifact
		},
		"artifact timestamp": func(doc Document) {
			artifact := doc.Artifacts[validArtifactReference]
			artifact.DiscoveredAt = "not-a-time"
			doc.Artifacts[validArtifactReference] = artifact
		},
		"artifact count mismatch": func(doc Document) {
			stream := doc.Streams["organizer_1:transcript"]
			stream.ArtifactCount = 2
			doc.Streams["organizer_1:transcript"] = stream
		},
		"metadata key":       func(doc Document) { doc.Metadata["arbitrary"] = "unsafe" },
		"metadata timestamp": func(doc Document) { doc.Metadata["updated_at"] = "not-a-time" },
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			doc := validStateDocument(t)
			mutate(doc)
			if err := validate(doc); err == nil || ErrorCode(err) != "state_invalid" {
				t.Fatalf("expected state_invalid, got %v", err)
			}
		})
	}
}

var validArtifactReference = testDigest(testfixture.OrganizerOne + "\x00transcript\x00artifact-1")

func validStateDocument(t *testing.T) Document {
	t.Helper()
	now := "2026-08-01T12:00:00Z"
	doc := newDocument()
	doc.Metadata = map[string]string{"created_at": now, "updated_at": now}
	organizers := []struct{ slot, id string }{{"organizer_1", testfixture.OrganizerOne}, {"organizer_2", testfixture.OrganizerTwo}}
	for _, organizer := range organizers {
		fingerprint := testDigest(organizer.id)
		for _, artifactType := range []string{"transcript", "recording"} {
			key := organizer.slot + ":" + artifactType
			doc.Streams[key] = Stream{
				OrganizerFingerprint: fingerprint, OrganizerSlot: organizer.slot, ArtifactType: artifactType,
				DeltaLink: continuationURL(organizer.id, artifactType), LastAttemptAt: now, LastSuccessAt: now,
				ArtifactCount: 0,
			}
		}
	}
	stream := doc.Streams["organizer_1:transcript"]
	stream.ArtifactCount = 1
	doc.Streams["organizer_1:transcript"] = stream
	doc.Artifacts[validArtifactReference] = Artifact{
		InternalReference: validArtifactReference, OrganizerFingerprint: testDigest(testfixture.OrganizerOne),
		OrganizerSlot: "organizer_1", ArtifactType: "transcript", ProviderArtifactID: "artifact-1",
		ProviderMeetingID: "meeting-1", ProviderCreatedAt: now, DiscoveredAt: now,
	}
	if err := validate(doc); err != nil {
		t.Fatalf("valid fixture rejected: %v", err)
	}
	return doc
}

func continuationURL(organizerID, artifactType string) string {
	function := "getAllTranscripts"
	if artifactType == "recording" {
		function = "getAllRecordings"
	}
	return fmt.Sprintf("https://graph.microsoft.com/v1.0/users/%s/onlineMeetings/%s(meetingOrganizerUserId='%s')/delta?deltaToken=done", organizerID, function, organizerID)
}

func testDigest(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func TestOpenRejectsConcurrentProcessLock(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	first, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	if _, err := Open(path); err == nil || ErrorCode(err) != "state_lock_busy" {
		t.Fatalf("expected state_lock_busy, got %v", err)
	}
}

func TestOpenRejectsMalformedOrUnsupportedState(t *testing.T) {
	for _, body := range []string{`not-json`, `{"version":2,"streams":{},"artifacts":{},"metadata":{}}`, `{"version":1,"streams":null,"artifacts":{},"metadata":{}}`} {
		path := filepath.Join(t.TempDir(), "state.json")
		if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := Open(path); err == nil || ErrorCode(err) != "state_invalid" {
			t.Fatalf("expected state_invalid for %s, got %v", body, err)
		}
	}
}

func TestOpenRejectsStateFileAboveEncodedLimit(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(path, []byte("{}"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Truncate(path, MaxStateFileBytes+1); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err == nil || ErrorCode(err) != "state_invalid" {
		t.Fatalf("expected oversized state rejection, got %v", err)
	}
}

func TestCommitIsAtomicAndPreservesPriorStateOnValidationFailure(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	doc := validStateDocument(t)
	if err := store.Commit(doc); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	bad := doc
	bad.Version = 99
	if err := store.Commit(bad); err == nil {
		t.Fatal("expected invalid commit")
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("failed commit changed prior state")
	}
	var decoded Document
	if err := json.Unmarshal(after, &decoded); err != nil || decoded.Metadata["updated_at"] != "2026-08-01T12:00:00Z" {
		t.Fatal("committed state was not readable")
	}
	matches, _ := filepath.Glob(path + ".tmp-*")
	if len(matches) != 0 {
		t.Fatalf("temporary state files remain: %v", matches)
	}
}

func TestCommitRejectsFourStreamAggregateBoundAndPreservesPriorState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	baseline := validStateDocument(t)
	if err := store.Commit(baseline); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	candidate := fourStreamArtifactDocument(t)
	store.maxArtifacts = 3
	if err := store.Commit(candidate); err == nil || ErrorCode(err) != "state_invalid" {
		t.Fatalf("expected bounded state rejection, got %v", err)
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("aggregate bound rejection changed prior state")
	}
	store.maxArtifacts = MaxStateArtifacts
	store.maxStringBytes = 1
	if err := store.Commit(candidate); err == nil || ErrorCode(err) != "state_invalid" {
		t.Fatalf("expected aggregate byte rejection, got %v", err)
	}
	after, _ = os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("aggregate byte rejection changed prior state")
	}
}

func TestPersistRejectsEncodedFileBoundAndPreservesPriorState(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "state.json")
	store, _ := Open(path)
	defer store.Close()
	baseline := validStateDocument(t)
	if err := store.Commit(baseline); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(path)
	store.maxFileBytes = 64
	if err := store.Commit(baseline); err == nil || ErrorCode(err) != "state_invalid" {
		t.Fatalf("expected encoded file bound rejection, got %v", err)
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Fatal("encoded bound rejection changed prior state")
	}
}

func fourStreamArtifactDocument(t *testing.T) Document {
	t.Helper()
	doc := validStateDocument(t)
	addValidArtifact(doc, "organizer_1", testfixture.OrganizerOne, "recording", "2")
	addValidArtifact(doc, "organizer_2", testfixture.OrganizerTwo, "transcript", "3")
	addValidArtifact(doc, "organizer_2", testfixture.OrganizerTwo, "recording", "4")
	if err := validate(doc); err != nil {
		t.Fatalf("four-stream fixture rejected: %v", err)
	}
	return doc
}

func addValidArtifact(doc Document, slot, organizerID, artifactType, suffix string) {
	providerID := "artifact-" + suffix
	reference := testDigest(organizerID + "\x00" + artifactType + "\x00" + providerID)
	doc.Artifacts[reference] = Artifact{
		InternalReference: reference, OrganizerFingerprint: testDigest(organizerID), OrganizerSlot: slot,
		ArtifactType: artifactType, ProviderArtifactID: providerID, ProviderMeetingID: "meeting-" + suffix,
		ProviderCreatedAt: "2026-08-01T12:00:00Z", DiscoveredAt: "2026-08-01T12:00:00Z",
	}
	key := slot + ":" + artifactType
	stream := doc.Streams[key]
	stream.ArtifactCount++
	doc.Streams[key] = stream
}
