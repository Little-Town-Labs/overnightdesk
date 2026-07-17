package state

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMessageAndDeliveryStatePersistAcrossReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if inserted, err := store.ReserveMessage(MessageRecord{MessageID: "m-1", ThreadID: "t-1", Classification: "authorized"}); err != nil || !inserted {
		t.Fatalf("reserve failed: %v", err)
	}
	if err := store.UpdateMessage("m-1", "landed"); err != nil {
		t.Fatal(err)
	}
	if inserted, err := store.CreateDelivery(DeliveryRecord{CleanID: "clean-1", ProviderMessageID: "m-1", State: "submitting"}); err != nil || !inserted {
		t.Fatalf("delivery create failed: %v", err)
	}
	if err := store.AttachRun("clean-1", "run-1", "running"); err != nil {
		t.Fatal(err)
	}
	reloaded, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if got, ok := reloaded.Message("m-1"); !ok || got.State != "landed" {
		t.Fatalf("message state not durable: %#v", got)
	}
	if got := reloaded.Deliveries(); len(got) != 1 || got[0].RunID != "run-1" {
		t.Fatalf("delivery state not durable: %#v", got)
	}
}

func TestVersionOneStateMigratesWithoutLegacyContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	legacy := `{"version":1,"messages":{"m":{"message_id":"m","thread_id":"t","sender":"secret@example.com","subject":"secret","reply_text":"secret body","classification":"trusted","state":"replied"}},"approvals":{},"metadata":{}}`
	if err := os.WriteFile(path, []byte(legacy), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Open(path); err != nil {
		t.Fatal(err)
	}
	raw, _ := os.ReadFile(path)
	for _, forbidden := range []string{"secret@example.com", "secret body", "reply_text", "approvals"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("legacy sensitive field survived migration: %s", forbidden)
		}
	}
}

func TestDeliveryRemovalIsDurable(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, _ := Open(path)
	_, _ = store.CreateDelivery(DeliveryRecord{CleanID: "clean-1", RunID: "run-1"})
	if err := store.RemoveDelivery("clean-1"); err != nil {
		t.Fatal(err)
	}
	reloaded, _ := Open(path)
	if len(reloaded.Deliveries()) != 0 {
		t.Fatal("removed delivery reappeared")
	}
}
