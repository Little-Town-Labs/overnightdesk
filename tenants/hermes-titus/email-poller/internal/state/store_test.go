package state

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestReserveAndTerminalStatePersistAcrossReload(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	record := MessageRecord{MessageID: "m-1", ThreadID: "t-1", Sender: "garyb@timelesstechs.com", Subject: "Hello", Classification: "trusted", ClientID: "client-1"}
	if inserted, err := store.ReserveMessage(record); err != nil || !inserted {
		t.Fatalf("reserve failed: %v", err)
	}
	if inserted, _ := store.ReserveMessage(record); inserted {
		t.Fatal("duplicate message reserved")
	}
	if err := store.UpdateMessage("m-1", func(value *MessageRecord) { value.State = "replied" }); err != nil {
		t.Fatal(err)
	}
	reloaded, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	if got, ok := reloaded.Message("m-1"); !ok || got.State != "replied" {
		t.Fatalf("state not durable: %#v", got)
	}
}

func TestFirstApprovalDecisionWins(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	_, _ = store.ReserveMessage(MessageRecord{MessageID: "m-2", ThreadID: "t", Sender: "outside@example.net", Classification: "external", ClientID: "c"})
	created, err := store.CreateApproval(ApprovalRecord{QueueID: "TITUS-ABCDEF123456", SourceMessageID: "m-2", State: "pending"})
	if err != nil || !created {
		t.Fatalf("approval create failed: %v", err)
	}
	if ok, _ := store.ClaimDecision("TITUS-ABCDEF123456", "approve", "garyb@timelesstechs.com", "cmd-1"); !ok {
		t.Fatal("first decision was not claimed")
	}
	if ok, _ := store.ClaimDecision("TITUS-ABCDEF123456", "reject", "austin@timelesstechs.com", "cmd-2"); ok {
		t.Fatal("second decision was accepted")
	}
}

func TestStateNeverPersistsSourceBodyOrPlaintextToken(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state.json")
	store, _ := Open(path)
	_, _ = store.ReserveMessage(MessageRecord{MessageID: "m", ThreadID: "t", Classification: "preexisting", ClientID: "c"})
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		t.Fatal(err)
	}
	text := strings.ToLower(string(raw))
	for _, forbidden := range []string{"source_body", "source_text", "plaintext_token"} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("forbidden state field persisted: %s", forbidden)
		}
	}
}
