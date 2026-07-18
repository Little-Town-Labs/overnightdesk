package worker

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"testing"
	"time"

	"overnightdesk/titus-email-poller/internal/config"
	"overnightdesk/titus-email-poller/internal/state"
	"overnightdesk/titus-email-poller/internal/store"
	"overnightdesk/titus-email-poller/internal/transport"
)

func testConfig(enabled bool) config.Config {
	return config.Config{
		Enabled: enabled, InboxID: "inbox-titus", InboxAddress: "titus-operations@agentmail.to",
		AllowedSenders: map[string]struct{}{"garyb@timelesstechs.com": {}, "austin@timelesstechs.com": {}},
		RouteID:        "titus", TargetAgent: "hermes-titus", MaxMessages: 20, MaxCleanClaims: 10,
		Interval: time.Minute,
	}
}

func message(id, sender, body string) transport.Message {
	return transport.Message{InboxID: "inbox-titus", MessageID: id, ThreadID: "thread-" + id,
		From: sender, To: []string{"titus-operations@agentmail.to"}, Subject: "Instructions",
		ExtractedText: body, Labels: []string{"received", "unread"}, Timestamp: "2026-07-17T12:00:00Z"}
}

type fakeAgentMail struct {
	messages   []transport.Message
	pages      map[string]transport.ListResponse
	replies    map[string]string
	listCalls  int
	replyCalls []string
}

func (fake *fakeAgentMail) ListMessages(page string, limit int) (transport.ListResponse, error) {
	fake.listCalls++
	if response, ok := fake.pages[page]; ok {
		return response, nil
	}
	messages := fake.messages
	if len(messages) > limit {
		messages = messages[:limit]
	}
	return transport.ListResponse{Messages: messages}, nil
}
func (fake *fakeAgentMail) GetMessage(id string) (transport.Message, error) {
	for _, item := range fake.messages {
		if item.MessageID == id {
			return item, nil
		}
	}
	return transport.Message{}, errors.New("not found")
}
func (fake *fakeAgentMail) Reply(id, text, purpose string) (transport.SendResult, error) {
	if fake.replies == nil {
		fake.replies = make(map[string]string)
	}
	fake.replies[id] = text
	fake.replyCalls = append(fake.replyCalls, id+":"+purpose)
	return transport.SendResult{MessageID: "reply-" + id}, nil
}

type fakeRepository struct {
	dirty      []store.DirtyEmail
	clean      []store.CleanEmail
	completed  []string
	completeOK []bool
	failed     []string
}

func (fake *fakeRepository) LandDirty(_ context.Context, email store.DirtyEmail) (bool, error) {
	fake.dirty = append(fake.dirty, email)
	return true, nil
}
func (fake *fakeRepository) ClaimClean(_ context.Context, route, inbox, target string, limit int) ([]store.CleanEmail, error) {
	result := fake.clean
	fake.clean = nil
	return result, nil
}
func (fake *fakeRepository) Complete(_ context.Context, id, route, inbox, target string) (bool, error) {
	fake.completed = append(fake.completed, id)
	if len(fake.completeOK) > 0 {
		ok := fake.completeOK[0]
		fake.completeOK = fake.completeOK[1:]
		return ok, nil
	}
	return true, nil
}
func (fake *fakeRepository) Fail(_ context.Context, id, route, inbox, target, code string) (bool, error) {
	fake.failed = append(fake.failed, id+":"+code)
	return true, nil
}

type fakeHermes struct {
	runs      map[string]transport.HermesRun
	submitted []string
}

func (fake *fakeHermes) SubmitRun(input, session, key, idempotency string) (transport.HermesRun, error) {
	fake.submitted = append(fake.submitted, input)
	run := transport.HermesRun{RunID: "run-1", Status: "queued"}
	if fake.runs == nil {
		fake.runs = make(map[string]transport.HermesRun)
	}
	fake.runs[run.RunID] = run
	return run, nil
}
func (fake *fakeHermes) GetRun(id string) (transport.HermesRun, error) { return fake.runs[id], nil }

func newWorker(t *testing.T, enabled bool, messages ...transport.Message) (*Worker, *fakeAgentMail, *fakeRepository, *fakeHermes, *state.Store) {
	t.Helper()
	stateStore, err := state.Open(filepath.Join(t.TempDir(), "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	agentmail := &fakeAgentMail{messages: messages, replies: make(map[string]string)}
	repository := &fakeRepository{}
	hermes := &fakeHermes{runs: make(map[string]transport.HermesRun)}
	worker := New(testConfig(enabled), stateStore, repository, agentmail, hermes, filepath.Join(t.TempDir(), "health.json"))
	return worker, agentmail, repository, hermes, stateStore
}

func TestAuthorizedEmailLandsDirtyAndNeverCallsHermesDirectly(t *testing.T) {
	worker, _, repository, hermes, _ := newWorker(t, true, message("m-1", "Gary <garyb@timelesstechs.com>", "raw instructions"))
	result, err := worker.RunOnce()
	if err != nil {
		t.Fatal(err)
	}
	if result.Landed != 1 || len(repository.dirty) != 1 || len(hermes.submitted) != 0 {
		t.Fatalf("wrong intake behavior: %#v dirty=%#v submitted=%#v", result, repository.dirty, hermes.submitted)
	}
	if repository.dirty[0].Body != "raw instructions" || !repository.dirty[0].SenderAuthorized {
		t.Fatalf("dirty email malformed: %#v", repository.dirty[0])
	}
	if _, err := worker.RunOnce(); err != nil || len(repository.dirty) != 1 {
		t.Fatal("duplicate poll produced another dirty write")
	}
}

func TestLandingPaginatesPastAlreadyCheckpointedMessages(t *testing.T) {
	old := make([]transport.Message, 0, 20)
	worker, agentmail, repository, _, stateStore := newWorker(t, true)
	for index := range 20 {
		item := message(fmt.Sprintf("old-%02d", index), "garyb@timelesstechs.com", "old")
		old = append(old, item)
		_, _ = stateStore.ReserveMessage(state.MessageRecord{MessageID: item.MessageID})
		_ = stateStore.UpdateMessage(item.MessageID, "landed")
	}
	newMessage := message("new-21", "garyb@timelesstechs.com", "new work")
	agentmail.messages = append(append([]transport.Message{}, old...), newMessage)
	agentmail.pages = map[string]transport.ListResponse{
		"":       {Messages: old, NextPageToken: "page-2"},
		"page-2": {Messages: []transport.Message{newMessage}},
	}

	result, err := worker.RunOnce()
	if err != nil || result.Landed != 1 || len(repository.dirty) != 1 || agentmail.listCalls != 2 {
		t.Fatalf("backlog message starved: result=%#v err=%v calls=%d dirty=%#v", result, err, agentmail.listCalls, repository.dirty)
	}
}

func TestInboxMismatchFailsBeforeDatabaseOrHermes(t *testing.T) {
	source := message("m-wrong", "garyb@timelesstechs.com", "instructions")
	source.InboxID = "other-inbox"
	worker, _, repository, hermes, _ := newWorker(t, true, source)
	if _, err := worker.RunOnce(); err == nil {
		t.Fatal("inbox mismatch was accepted")
	}
	if len(repository.dirty) != 0 || len(hermes.submitted) != 0 {
		t.Fatal("inbox mismatch reached a downstream boundary")
	}
}

func TestSpoofedAndAutomatedSendersLandButCannotBeClaimedByRoute(t *testing.T) {
	spoof := message("m-2", `"garyb@timelesstechs.com" <attacker@example.net>`, "spoof")
	automated := message("m-3", "garyb@timelesstechs.com", "automatic")
	automated.Headers = map[string]string{"Auto-Submitted": "auto-replied"}
	worker, _, repository, _, _ := newWorker(t, true, spoof, automated)
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	if len(repository.dirty) != 2 || repository.dirty[0].SenderAuthorized || repository.dirty[1].SenderAuthorized {
		t.Fatalf("unsafe sender was authorized: %#v", repository.dirty)
	}
}

func TestOnlyCleanClaimIsSubmittedToHermes(t *testing.T) {
	worker, _, repository, hermes, _ := newWorker(t, true)
	repository.clean = []store.CleanEmail{{ID: "clean-1", ProviderMessageID: "m-1", ThreadID: "thread-1", SafeContent: "clean instructions"}}
	result, err := worker.RunOnce()
	if err != nil {
		t.Fatal(err)
	}
	if result.Claimed != 1 || len(hermes.submitted) != 1 || hermes.submitted[0] != "clean instructions" {
		t.Fatalf("clean input was not dispatched: %#v %#v", result, hermes.submitted)
	}
}

func TestInvalidCleanContentFailsWithoutHermesSubmission(t *testing.T) {
	worker, _, repository, hermes, _ := newWorker(t, true)
	repository.clean = []store.CleanEmail{{ID: "clean-empty", ProviderMessageID: "m-1", SafeContent: " \n\t "}}
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	if len(hermes.submitted) != 0 || len(repository.failed) != 1 || repository.failed[0] != "clean-empty:invalid_clean_content" {
		t.Fatalf("invalid clean content escaped: submitted=%#v failed=%#v", hermes.submitted, repository.failed)
	}
}

func TestCompletedHermesRunRepliesInThreadAndCompletesRow(t *testing.T) {
	worker, agentmail, repository, hermes, stateStore := newWorker(t, true)
	_, _ = stateStore.CreateDelivery(state.DeliveryRecord{CleanID: "clean-1", ProviderMessageID: "m-1", RunID: "run-1", State: "running"})
	hermes.runs["run-1"] = transport.HermesRun{RunID: "run-1", Status: "completed", Output: "Completed the instructions."}
	result, err := worker.RunOnce()
	if err != nil {
		t.Fatal(err)
	}
	if result.Sends != 1 || agentmail.replies["m-1"] != "Completed the instructions." || len(repository.completed) != 1 {
		t.Fatalf("completion was not delivered: %#v replies=%#v completed=%#v", result, agentmail.replies, repository.completed)
	}
	if len(stateStore.Deliveries()) != 0 {
		t.Fatal("completed delivery remained in recovery state")
	}
}

func TestCompletionReconcilesAfterDatabaseAcknowledgementLoss(t *testing.T) {
	worker, agentmail, repository, hermes, stateStore := newWorker(t, true)
	repository.completeOK = []bool{false, true}
	_, _ = stateStore.CreateDelivery(state.DeliveryRecord{CleanID: "clean-1", ProviderMessageID: "m-1", RunID: "run-1", State: "running"})
	hermes.runs["run-1"] = transport.HermesRun{RunID: "run-1", Status: "completed", Output: "Done."}
	if _, err := worker.RunOnce(); err == nil {
		t.Fatal("lost completion acknowledgement did not fail the cycle")
	}
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	if len(repository.completed) != 2 || len(stateStore.Deliveries()) != 0 ||
		len(agentmail.replyCalls) != 2 || agentmail.replyCalls[0] != agentmail.replyCalls[1] {
		t.Fatalf("completion did not reconcile idempotently: completed=%#v replies=%#v", repository.completed, agentmail.replyCalls)
	}
}

func TestApprovalWaitDoesNotSendEmailOrApprove(t *testing.T) {
	worker, agentmail, _, hermes, stateStore := newWorker(t, true)
	_, _ = stateStore.CreateDelivery(state.DeliveryRecord{CleanID: "clean-1", ProviderMessageID: "m-1", RunID: "run-1", State: "running"})
	hermes.runs["run-1"] = transport.HermesRun{RunID: "run-1", Status: "waiting_for_approval"}
	result, err := worker.RunOnce()
	if err != nil || result.Sends != 0 || len(agentmail.replies) != 1 || stateStore.Deliveries()[0].State != "waiting_for_approval" || !stateStore.Deliveries()[0].ApprovalNotified {
		t.Fatalf("approval wait escaped its channel: %#v %v", result, err)
	}
	if _, err := worker.RunOnce(); err != nil || len(agentmail.replyCalls) != 1 {
		t.Fatal("approval notification was not idempotent")
	}
	hermes.runs["run-1"] = transport.HermesRun{RunID: "run-1", Status: "completed", Output: "Approved completion."}
	if _, err := worker.RunOnce(); err != nil || len(agentmail.replyCalls) != 2 || agentmail.replyCalls[0] == agentmail.replyCalls[1] {
		t.Fatal("approval notice and final reply did not use distinct idempotency purposes")
	}
}

func TestAmbiguousPreSubmissionStateFailsClosedWithoutHermesRetry(t *testing.T) {
	worker, _, repository, hermes, stateStore := newWorker(t, true)
	_, _ = stateStore.CreateDelivery(state.DeliveryRecord{
		CleanID: "clean-ambiguous", ProviderMessageID: "m-1", State: "submitting",
	})
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	if len(hermes.submitted) != 0 || len(repository.failed) != 1 || repository.failed[0] != "clean-ambiguous:ambiguous_run_submission" {
		t.Fatalf("ambiguous run was retried or not quarantined: submitted=%#v failed=%#v", hermes.submitted, repository.failed)
	}
}

func TestDisabledWorkerPerformsNoNetworkOrDatabaseWork(t *testing.T) {
	worker, agentmail, repository, hermes, _ := newWorker(t, false, message("m-1", "garyb@timelesstechs.com", "body"))
	result, err := worker.RunOnce()
	if err != nil || result.State != "disabled" || agentmail.listCalls != 0 || len(repository.dirty) != 0 || len(hermes.submitted) != 0 {
		t.Fatalf("disabled worker performed work: %#v %v", result, err)
	}
}

func TestInitializeCheckpointsHistoryWithoutDatabaseOrHermes(t *testing.T) {
	worker, _, repository, hermes, stateStore := newWorker(t, false, message("old", "garyb@timelesstechs.com", "old body"))
	result, err := worker.Initialize("")
	if err != nil || result.Preexisting != 1 || len(repository.dirty) != 0 || len(hermes.submitted) != 0 {
		t.Fatalf("unsafe initialize: %#v %v", result, err)
	}
	if record, ok := stateStore.Message("old"); !ok || record.State != "preexisting" {
		t.Fatalf("history not checkpointed: %#v", record)
	}
}

func TestHealthDisabledFreshAndStale(t *testing.T) {
	path := filepath.Join(t.TempDir(), "health.json")
	if err := WriteHealth(path, "disabled", ""); err != nil {
		t.Fatal(err)
	}
	if ok, _ := Health(path, time.Now().Add(24*time.Hour), time.Minute); !ok {
		t.Fatal("disabled health was stale")
	}
	if err := WriteHealth(path, "healthy", ""); err != nil {
		t.Fatal(err)
	}
	if ok, _ := Health(path, time.Now().Add(5*time.Minute), time.Minute); ok {
		t.Fatal("stale enabled health accepted")
	}
}
