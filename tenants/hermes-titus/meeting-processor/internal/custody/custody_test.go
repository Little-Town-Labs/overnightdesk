package custody

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testRing(t *testing.T) KeyRing {
	t.Helper()
	encoded := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	ring, err := ParseKeyRing(`{"key-2026-08":"`+encoded+`"}`, "key-2026-08")
	if err != nil {
		t.Fatal(err)
	}
	return ring
}

func testReference() string {
	sum := sha256.Sum256([]byte("meeting-reference"))
	return hex.EncodeToString(sum[:])
}

func TestParseKeyRingRejectsMissingMalformedAndShortKeys(t *testing.T) {
	valid := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{1}, 32))
	for _, fixture := range []struct{ raw, active, code string }{
		{`{}`, "key", "custody_keyring_invalid"},
		{`{"bad/id":"` + valid + `"}`, "bad/id", "custody_keyring_invalid"},
		{`{"key":"` + base64.StdEncoding.EncodeToString([]byte("short")) + `"}`, "key", "custody_keyring_invalid"},
		{`{"key":"` + valid + `"}`, "missing", "custody_key_missing"},
	} {
		if _, err := ParseKeyRing(fixture.raw, fixture.active); ErrorCode(err) != fixture.code {
			t.Fatalf("expected %s, got %v", fixture.code, err)
		}
	}
}

func TestEncryptUsesPrivateAtomicUniqueAuthenticatedObjects(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "custody")
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	manager := Manager{Dir: dir, Ring: testRing(t), Now: func() time.Time { return now }}
	first, err := manager.Encrypt(testReference(), []byte("WEBVTT\nprivate marker"))
	if err != nil {
		t.Fatal(err)
	}
	second, err := manager.Encrypt(testReference(), []byte("WEBVTT\nprivate marker"))
	if err != nil {
		t.Fatal(err)
	}
	if first.ObjectName == second.ObjectName || first.CiphertextSHA256 == second.CiphertextSHA256 {
		t.Fatal("nonce/object reuse made ciphertext deterministic")
	}
	if first.ExpiresAt != now.Add(168*time.Hour).Format(time.RFC3339Nano) {
		t.Fatalf("wrong expiry: %s", first.ExpiresAt)
	}
	path := filepath.Join(dir, first.ObjectName)
	info, _ := os.Stat(path)
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("mode = %o", info.Mode().Perm())
	}
	raw, _ := os.ReadFile(path)
	if bytes.Contains(raw, []byte("private marker")) {
		t.Fatal("plaintext leaked to ciphertext")
	}
	plain, err := manager.Decrypt(testReference(), first)
	if err != nil || string(plain) != "WEBVTT\nprivate marker" {
		t.Fatalf("decrypt = %q, %v", plain, err)
	}
	wrong := strings.Repeat("f", 64)
	if _, err := manager.Decrypt(wrong, first); ErrorCode(err) != "custody_tampered" {
		t.Fatalf("AAD reference was not authenticated: %v", err)
	}
	raw[len(raw)-1] ^= 0xff
	if err := os.WriteFile(path, raw, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := manager.Decrypt(testReference(), first); ErrorCode(err) != "custody_tampered" {
		t.Fatalf("tamper was not rejected: %v", err)
	}
	matches, _ := filepath.Glob(filepath.Join(dir, ".custody-*"))
	if len(matches) != 0 {
		t.Fatalf("temporary files remain: %v", matches)
	}
}

func TestSweepDeletesAtExactExpiryAndFailsClosedForMissingKey(t *testing.T) {
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	manager := Manager{Dir: filepath.Join(t.TempDir(), "custody"), Ring: testRing(t), Now: func() time.Time { return now }}
	record, err := manager.Encrypt(testReference(), []byte("WEBVTT\nprivate"))
	if err != nil {
		t.Fatal(err)
	}
	manager.Now = func() time.Time { return now.Add(Retention - time.Nanosecond) }
	before := manager.Sweep([]Record{record})
	if before.Blocked || before.Records[0].Status != "retained" {
		t.Fatalf("deleted early: %#v", before)
	}
	manager.Now = func() time.Time { return now.Add(Retention) }
	after := manager.Sweep([]Record{record})
	if after.Blocked || after.Records[0].Status != "deleted" || after.Records[0].DeletedAt == "" {
		t.Fatalf("not deleted at expiry: %#v", after)
	}
	if _, err := os.Stat(filepath.Join(manager.Dir, record.ObjectName)); !os.IsNotExist(err) {
		t.Fatalf("ciphertext remains: %v", err)
	}

	missing := Manager{Dir: filepath.Join(t.TempDir(), "missing"), Ring: KeyRing{Active: "new-key", keys: map[string][]byte{"new-key": bytes.Repeat([]byte{9}, 32)}}, Now: func() time.Time { return now.Add(time.Hour) }}
	record, err = (Manager{Dir: missing.Dir, Ring: testRing(t), Now: func() time.Time { return now }}).Encrypt(testReference(), []byte("WEBVTT\nprivate"))
	if err != nil {
		t.Fatal(err)
	}
	blocked := missing.Sweep([]Record{record})
	if !blocked.Blocked || blocked.Code != "custody_referenced_key_missing" || blocked.Records[0].Status != "blocked" {
		t.Fatalf("missing referenced key was not fail-closed: %#v", blocked)
	}
	retentionOnly := Manager{Dir: missing.Dir, Now: func() time.Time { return now.Add(90 * time.Minute) }}
	preserved := retentionOnly.Sweep(blocked.Records)
	if preserved.Blocked || preserved.Records[0].Status != "blocked" || preserved.Records[0].LastErrorCode != "custody_key_missing" {
		t.Fatalf("retention-only sweep rewrote missing-key state: %#v", preserved)
	}
	missing.Ring = testRing(t)
	missing.Now = func() time.Time { return now.Add(2 * time.Hour) }
	restored := missing.Sweep(blocked.Records)
	if restored.Blocked || restored.Records[0].Status != "retained" || restored.Records[0].LastErrorCode != "" {
		t.Fatalf("restored referenced key did not unblock custody: %#v", restored)
	}
	missing.Now = func() time.Time { return now.Add(Retention) }
	expired := missing.Sweep([]Record{record})
	if expired.Blocked || expired.Records[0].Status != "deleted" {
		t.Fatalf("expired ciphertext required a key: %#v", expired)
	}
}

func TestSweepReconcilesOrphanCiphertext(t *testing.T) {
	now := time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC)
	manager := Manager{Dir: filepath.Join(t.TempDir(), "custody"), Ring: testRing(t), Now: func() time.Time { return now }}
	orphan, err := manager.Encrypt(testReference(), []byte("WEBVTT\norphan"))
	if err != nil {
		t.Fatal(err)
	}
	result := manager.Sweep(nil)
	if result.Blocked || result.OrphansDeleted != 1 {
		t.Fatalf("orphan not reconciled: %#v", result)
	}
	if _, err := os.Stat(filepath.Join(manager.Dir, orphan.ObjectName)); !os.IsNotExist(err) {
		t.Fatalf("orphan remains: %v", err)
	}
}
