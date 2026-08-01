package worker

import (
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

func TestMigrateLegacyOutputsPreservesDigestAndRemovesUniqueMarker(t *testing.T) {
	dir := t.TempDir()
	discovery, err := state.Open(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer discovery.Close()
	briefs, err := state.OpenBrief(filepath.Join(dir, "meeting-brief-state.json"))
	if err != nil {
		t.Fatal(err)
	}
	defer briefs.Close()

	processor := Processor{
		Config: workerConfig(), Store: discovery, Fetcher: &scriptedFetcher{},
		Content:    &fakeContentFetcher{body: []byte("WEBVTT\nprivate transcript phrase")},
		Scanner:    &fakeScanner{safe: "screened wrapper"},
		Analyzer:   &fakeAnalyzer{output: "UNIQUE-LEGACY-MARKER"},
		HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime,
	}
	processor.Config.ContentEnabled = true
	if _, err := processor.RunOnce(t.Context()); err != nil {
		t.Fatal(err)
	}
	legacyDigest := sha256.Sum256([]byte("UNIQUE-LEGACY-MARKER"))
	if err := MigrateLegacyOutputs(discovery, briefs, processor.HandoffPath, fixedWorkerTime()); err != nil {
		t.Fatal(err)
	}

	doc := discovery.Document()
	var migrated state.Artifact
	for _, artifact := range doc.Artifacts {
		if artifact.ArtifactType == "transcript" && artifact.ContentStatus == "processed" {
			migrated = artifact
		}
	}
	if migrated.TitusOutput != state.LegacySentinel {
		t.Fatalf("legacy output remains: %q", migrated.TitusOutput)
	}
	briefRecord := briefs.Document().Records[migrated.InternalReference]
	if briefRecord.LegacyAnalysisDigest != hex.EncodeToString(legacyDigest[:]) || briefRecord.MigrationStatus != "complete" {
		t.Fatalf("provenance lost: %#v", briefRecord)
	}
	for _, path := range []string{filepath.Join(dir, "state.json"), filepath.Join(dir, "meeting-brief-state.json"), processor.HandoffPath} {
		raw, _ := os.ReadFile(path)
		if strings.Contains(string(raw), "UNIQUE-LEGACY-MARKER") {
			t.Fatalf("legacy marker survived in %s", path)
		}
	}
	if err := MigrateLegacyOutputs(discovery, briefs, processor.HandoffPath, fixedWorkerTime().Add(time.Minute)); err != nil {
		t.Fatalf("migration replay failed: %v", err)
	}
}

func TestMigrateLegacyOutputsBlocksSentinelWithoutProvenance(t *testing.T) {
	dir := t.TempDir()
	discovery, _ := state.Open(filepath.Join(dir, "state.json"))
	defer discovery.Close()
	briefs, _ := state.OpenBrief(filepath.Join(dir, "meeting-brief-state.json"))
	defer briefs.Close()
	processor := Processor{
		Config: workerConfig(), Store: discovery, Fetcher: &scriptedFetcher{},
		Content: &fakeContentFetcher{body: []byte("WEBVTT\nprivate transcript phrase")}, Scanner: &fakeScanner{safe: "screened wrapper"},
		Analyzer: &fakeAnalyzer{output: state.LegacySentinel}, HealthPath: filepath.Join(dir, "health.json"), HandoffPath: filepath.Join(dir, "handoff.json"), Now: fixedWorkerTime,
	}
	processor.Config.ContentEnabled = true
	if _, err := processor.RunOnce(t.Context()); err != nil {
		t.Fatal(err)
	}
	if err := MigrateLegacyOutputs(discovery, briefs, processor.HandoffPath, fixedWorkerTime()); err != ErrMigrationBlocked {
		t.Fatalf("expected migration block, got %v", err)
	}
}
