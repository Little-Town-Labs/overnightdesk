package store

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestDirtyMetadataContainsOnlyTrustedRoutingFields(t *testing.T) {
	raw, err := dirtyMetadata(DirtyEmail{
		RouteID: "titus", InboxID: "inbox_1", TargetAgent: "hermes-titus",
		ProviderMessageID: "message_1", ThreadID: "thread_1", InReplyTo: "parent_1",
		SenderAuthorized: true, Body: "must not be metadata", Sender: "sender@example.com",
	})
	if err != nil {
		t.Fatal(err)
	}
	var metadata map[string]any
	if err := json.Unmarshal(raw, &metadata); err != nil {
		t.Fatal(err)
	}
	for _, forbidden := range []string{"body", "sender", "subject"} {
		if _, ok := metadata[forbidden]; ok {
			t.Fatalf("untrusted %s copied into routing metadata", forbidden)
		}
	}
	if metadata["route_id"] != "titus" || metadata["sender_authorized"] != true {
		t.Fatalf("unexpected metadata: %#v", metadata)
	}
}

func TestSQLContractsAreParameterizedAndRouteIsolated(t *testing.T) {
	for _, token := range []string{"$1", "$2", "$3", "$4", "$5", "FOR UPDATE OF im SKIP LOCKED", "sender_authorized' = 'true'"} {
		if !strings.Contains(claimCleanSQL, token) {
			t.Fatalf("claim contract missing %q", token)
		}
	}
	for _, condition := range []string{"route_id", "inbox_id", "target_agent", "agent_zero_status = 'queued'", "agent_zero_status = 'processing'", "agent_zero_run_at < NOW() - make_interval(secs => $5::double precision)", "approval_status IN ('approved', 'auto_approved')"} {
		if !strings.Contains(claimCleanSQL, condition) {
			t.Fatalf("claim isolation missing %q", condition)
		}
	}
	for _, condition := range []string{"cs.source = 'agentmail'", "provider_message_id", "safe_content", "cs.sender", "cs.received_at"} {
		if !strings.Contains(claimCleanSQL, condition) {
			t.Fatalf("claim provenance validation missing %q", condition)
		}
	}
	if strings.Contains(landDirtySQL, "%s") || strings.Contains(claimCleanSQL, "%s") || strings.Contains(updateCleanSQL, "%s") {
		t.Fatal("SQL contract contains string interpolation")
	}
	if !strings.Contains(landDirtySQL, "ON CONFLICT (source, message_id) DO NOTHING") {
		t.Fatal("dirty insert is not idempotent")
	}
	for _, condition := range []string{"route_id", "inbox_id", "target_agent", "agent_zero_status = 'processing'"} {
		if !strings.Contains(updateCleanSQL, condition) {
			t.Fatalf("terminal update isolation missing %q", condition)
		}
	}
	if !strings.Contains(updateCleanSQL, "$5 = 'done' AND im.agent_zero_status = 'done'") {
		t.Fatal("completion transition is not restart-idempotent")
	}
}

func TestClaimRecoveryBoundFailsClosedBeforeDatabaseAccess(t *testing.T) {
	repository := &Postgres{}
	for _, value := range []int{0, 119, 4201} {
		if _, err := repository.ClaimClean(t.Context(), "route", "inbox", "target", 1, value); err == nil || !strings.Contains(err.Error(), "recovery bound") {
			t.Fatalf("bound %d accepted: %v", value, err)
		}
	}
}

func TestDirtyMetadataRejectsIncompleteRoute(t *testing.T) {
	if _, err := dirtyMetadata(DirtyEmail{RouteID: "titus"}); err == nil {
		t.Fatal("expected incomplete route to fail")
	}
}
