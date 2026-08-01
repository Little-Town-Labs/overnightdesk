package kanban

import (
	"context"
	"reflect"
	"strings"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
)

type call struct {
	binary string
	args   []string
}
type fakeRunner struct{ calls []call }

func (fake *fakeRunner) Run(_ context.Context, binary string, args ...string) ([]byte, error) {
	fake.calls = append(fake.calls, call{binary, append([]string(nil), args...)})
	return []byte(`{"task_id":"t_123"}`), nil
}

func TestCreateUsesDocumentedNoShellArgvAndExactIdempotency(t *testing.T) {
	runner := &fakeRunner{}
	adapter := Adapter{Binary: "/opt/hermes/.venv/bin/hermes", AllowedBoards: map[string]struct{}{"meeting-triage": {}}, Runner: runner}
	key := strings.Repeat("a", 64)
	if _, err := adapter.Create(context.Background(), "meeting-triage", "title; rm -rf /", "body $(unsafe)", key); err != nil {
		t.Fatal(err)
	}
	want := []string{"kanban", "--board", "meeting-triage", "create", "title; rm -rf /", "--body", "body $(unsafe)", "--triage", "--idempotency-key", key, "--json"}
	if len(runner.calls) != 1 || runner.calls[0].binary != "/opt/hermes/.venv/bin/hermes" || !reflect.DeepEqual(runner.calls[0].args, want) {
		t.Fatalf("calls=%#v", runner.calls)
	}
}

func TestCreateTasksRoutesUnknownAndCreatesEveryInternalItemOnce(t *testing.T) {
	runner := &fakeRunner{}
	adapter := Adapter{Binary: "/opt/hermes/.venv/bin/hermes", AllowedBoards: map[string]struct{}{"meeting-triage": {}}, Runner: runner}
	brief := model.Brief{ActionItems: []model.ActionItem{{Title: "Internal action", Owner: "gary", SourceTimestamp: "01:02"}}, ExternalCommitments: []model.Commitment{{Title: "Client response", SourceTimestamp: "02:03"}}}
	result, err := CreateTasks(context.Background(), adapter, "MB-ABCDEFGHIJKL", strings.Repeat("b", 64), brief, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(runner.calls) != 3 || result.TriageKey == nil || len(result.ActionKeys) != 2 {
		t.Fatalf("calls=%d result=%#v", len(runner.calls), result)
	}
	if runner.calls[0].args[2] != "meeting-triage" {
		t.Fatal("wrong board")
	}
	for _, invocation := range runner.calls {
		joined := strings.Join(invocation.args, " ")
		if !strings.Contains(joined, "--triage") || !strings.Contains(joined, "--idempotency-key") {
			t.Fatalf("unsafe invocation: %s", joined)
		}
	}
}

func TestItemKeyIsVersionedKindAndIndexSpecific(t *testing.T) {
	first, _ := ItemKey("MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "action", 0)
	second, _ := ItemKey("MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "action", 1)
	commitment, _ := ItemKey("MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "commitment", 0)
	if first == second || first == commitment || len(first) != 64 {
		t.Fatalf("keys=%s %s %s", first, second, commitment)
	}
}

func TestItemKeyIncludesCommittedNoteKind(t *testing.T) {
	note, err := ItemKey("MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "note", 0)
	triage, _ := ItemKey("MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "triage", 0)
	if err != nil || len(note) != 64 || note == triage {
		t.Fatalf("note=%s triage=%s err=%v", note, triage, err)
	}
}
