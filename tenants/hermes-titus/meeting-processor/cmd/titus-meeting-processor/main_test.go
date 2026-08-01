package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/worker"
)

func TestExecuteRejectsMissingUnknownAndTrailingArguments(t *testing.T) {
	for _, args := range [][]string{{}, {"unknown"}, {"health", "trailing"}, {"run-once", "--unknown"}} {
		if err := execute(args, &bytes.Buffer{}, &bytes.Buffer{}); err == nil {
			t.Fatalf("expected rejection for %v", args)
		}
	}
}

func TestHealthCommandPrintsExactlyOneSafeLine(t *testing.T) {
	path := filepath.Join(t.TempDir(), "health.json")
	now := time.Now().UTC()
	if err := worker.WriteHealth(path, worker.Health{State: "healthy", Timestamp: now.Format(time.RFC3339Nano), TokenHealth: "healthy", Streams: []worker.StreamHealth{}}); err != nil {
		t.Fatal(err)
	}
	var output bytes.Buffer
	if err := execute([]string{"health", "--health", path, "--max-age", "10m"}, &output, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	if output.String() != "titus_meeting_processor=healthy\n" {
		t.Fatalf("output = %q", output.String())
	}
}

func TestInitVolumeCreatesPrivateOwnedDirectory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "data")
	uid := strconv.Itoa(os.Getuid())
	gid := strconv.Itoa(os.Getgid())
	if err := execute([]string{"init-volume", "--path", path, "--uid", uid, "--gid", gid}, &bytes.Buffer{}, &bytes.Buffer{}); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o700 {
		t.Fatalf("volume mode = %o", info.Mode().Perm())
	}
}

func TestSafeCLIErrorNeverEchoesInput(t *testing.T) {
	secret := "sensitive-runtime-value"
	if got := safeCLIError(&unsafeTestError{value: secret}); got != "internal_error" || strings.Contains(got, secret) {
		t.Fatalf("unsafe CLI error: %q", got)
	}
}

type unsafeTestError struct{ value string }

func (err *unsafeTestError) Error() string { return err.value }
