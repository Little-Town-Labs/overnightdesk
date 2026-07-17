package worker

import (
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"overnightdesk/titus-email-poller/internal/config"
	"overnightdesk/titus-email-poller/internal/policy"
	"overnightdesk/titus-email-poller/internal/state"
	"overnightdesk/titus-email-poller/internal/transport"
)

var trusted = map[string]struct{}{
	"garyb@timelesstechs.com":  {},
	"austin@timelesstechs.com": {},
}

func testConfig(enabled bool) config.Config {
	return config.Config{
		Enabled: enabled, InboxID: "titus-inbox", InboxAddress: "titus@example.agentmail.to",
		TrustedSenders: trusted, Approvers: trusted, SigningSecret: "ssssssssssssssssssssssssssssssss",
		Interval: time.Minute, MaxMessages: 20,
	}
}

func message(id, sender, subject, body string) transport.Message {
	return transport.Message{
		MessageID: id, ThreadID: "thread-" + id, From: sender,
		To: []string{"titus@example.agentmail.to"}, Subject: subject,
		ExtractedText: body, Labels: []string{"received", "unread"},
	}
}

type fakeAgentMail struct {
	messages      []transport.Message
	drafts        map[string]transport.Draft
	draftByClient map[string]string
	sent          []string
	listCalls     int
	nextID        int
	failSendID    string
	failedSend    bool
	replied       map[string]string
}

func newFakeAgentMail(messages ...transport.Message) *fakeAgentMail {
	return &fakeAgentMail{
		messages: messages, drafts: make(map[string]transport.Draft),
		draftByClient: make(map[string]string), replied: make(map[string]string), nextID: 1,
	}
}

func (fake *fakeAgentMail) ListMessages(page string, limit int) (transport.ListResponse, error) {
	fake.listCalls++
	items := fake.messages
	if len(items) > limit {
		items = items[:limit]
	}
	return transport.ListResponse{Messages: items}, nil
}

func (fake *fakeAgentMail) GetMessage(id string) (transport.Message, error) {
	for _, item := range fake.messages {
		if item.MessageID == id {
			return item, nil
		}
	}
	return transport.Message{}, errors.New("not found")
}

func (fake *fakeAgentMail) CreateDraft(request transport.CreateDraftRequest) (transport.Draft, error) {
	if id, ok := fake.draftByClient[request.ClientID]; ok {
		return fake.drafts[id], nil
	}
	id := "draft-" + string(rune('0'+fake.nextID))
	fake.nextID++
	recipients := request.To
	if request.InReplyTo != "" {
		source, _ := fake.GetMessage(request.InReplyTo)
		recipients = []string{source.From}
	}
	draft := transport.Draft{DraftID: id, ClientID: request.ClientID, To: recipients, Subject: request.Subject, Text: request.Text, HTML: request.HTML, InReplyTo: request.InReplyTo}
	fake.drafts[id], fake.draftByClient[request.ClientID] = draft, id
	return draft, nil
}

func (fake *fakeAgentMail) Reply(messageID, text string) (transport.SendResult, error) {
	id := "reply-" + messageID
	if _, exists := fake.replied[messageID]; !exists {
		fake.replied[messageID] = text
		fake.sent = append(fake.sent, id)
	}
	if id == fake.failSendID && !fake.failedSend {
		fake.failedSend = true
		return transport.SendResult{}, errors.New("ambiguous timeout")
	}
	return transport.SendResult{MessageID: "sent-" + id}, nil
}

func (fake *fakeAgentMail) GetDraft(id string) (transport.Draft, error) {
	draft, ok := fake.drafts[id]
	if !ok {
		return transport.Draft{}, errors.New("not found")
	}
	return draft, nil
}

func (fake *fakeAgentMail) SendDraft(id string) (transport.SendResult, error) {
	draft := fake.drafts[id]
	if draft.SendStatus != "sent" {
		draft.SendStatus = "sent"
		fake.drafts[id] = draft
		fake.sent = append(fake.sent, id)
	}
	if id == fake.failSendID && !fake.failedSend {
		fake.failedSend = true
		return transport.SendResult{}, errors.New("ambiguous timeout")
	}
	return transport.SendResult{MessageID: "sent-" + id}, nil
}

type fakeModel struct {
	reply string
	calls int
}

func (fake *fakeModel) GenerateReply(subject, text string) (string, error) {
	fake.calls++
	return fake.reply, nil
}

func newWorker(t *testing.T, enabled bool, messages ...transport.Message) (*Worker, *fakeAgentMail, *fakeModel, *state.Store) {
	t.Helper()
	directory := t.TempDir()
	store, err := state.Open(filepath.Join(directory, "state.json"))
	if err != nil {
		t.Fatal(err)
	}
	agentmail := newFakeAgentMail(messages...)
	model := &fakeModel{reply: "Thanks for your email. I will follow up shortly.\n\nTitus"}
	worker := New(testConfig(enabled), store, agentmail, model, filepath.Join(directory, "health.json"))
	return worker, agentmail, model, store
}

func TestTrustedMessageRepliesExactlyOnce(t *testing.T) {
	source := message("trusted-1", "Gary <garyb@timelesstechs.com>", "Hello", "Please reply")
	worker, agentmail, model, store := newWorker(t, true, source)
	result, err := worker.RunOnce()
	if err != nil {
		t.Fatal(err)
	}
	if result.Sends != 1 {
		t.Fatalf("trusted reply send count = %d, want 1", result.Sends)
	}
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	record, _ := store.Message("trusted-1")
	if record.State != "replied" || len(agentmail.sent) != 1 || model.calls != 1 {
		t.Fatalf("trusted reply was not idempotent: %#v sent=%v calls=%d", record, agentmail.sent, model.calls)
	}
}

func TestDisplayNameSpoofQueuesApproval(t *testing.T) {
	source := message("spoof-1", `"garyb@timelesstechs.com" <attacker@example.net>`, "Question", "Please reply")
	worker, agentmail, _, store := newWorker(t, true, source)
	_, _ = worker.RunOnce()
	approval, ok := store.Approval(policy.QueueID("spoof-1"))
	if !ok || approval.Recipient != "attacker@example.net" || approval.State != "pending" {
		t.Fatalf("spoof was not queued: %#v", approval)
	}
	if len(agentmail.sent) != 1 {
		t.Fatalf("expected approval notice only, sent=%v", agentmail.sent)
	}
	notice := agentmail.drafts[agentmail.sent[0]]
	if len(notice.To) != 2 {
		t.Fatalf("approval notice did not target both operators: %#v", notice.To)
	}
}

func TestApprovalSendsUnchangedDraftAndRejectIsTerminal(t *testing.T) {
	source := message("external-1", "pat@example.net", "Question", "Please reply")
	worker, agentmail, _, store := newWorker(t, true, source)
	_, _ = worker.RunOnce()
	queue := policy.QueueID("external-1")
	token, _ := policy.ApprovalToken(queue, testConfig(true).SigningSecret)
	command := message("approve-1", "garyb@timelesstechs.com", "Re: approval", "APPROVE "+queue+" "+token)
	agentmail.messages = append(agentmail.messages, command)
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	approval, _ := store.Approval(queue)
	if approval.State != "approved" || agentmail.drafts[approval.DraftID].Text != approval.DraftText {
		t.Fatalf("approval failed: %#v", approval)
	}
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	if count(agentmail.sent, approval.DraftID) != 1 {
		t.Fatal("approved draft was sent more than once")
	}
}

func TestApprovalRecoversFromAmbiguousSendWithoutDuplicate(t *testing.T) {
	source := message("external-ambiguous", "pat@example.net", "Question", "Please reply")
	worker, agentmail, _, store := newWorker(t, true, source)
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	queue := policy.QueueID(source.MessageID)
	approval, _ := store.Approval(queue)
	agentmail.failSendID = approval.DraftID
	token, _ := policy.ApprovalToken(queue, testConfig(true).SigningSecret)
	agentmail.messages = append(agentmail.messages, message(
		"approve-ambiguous", "austin@timelesstechs.com", "Approval", "APPROVE "+queue+" "+token,
	))
	if _, err := worker.RunOnce(); err == nil {
		t.Fatal("expected the first send result to be ambiguous")
	}
	if _, err := worker.RunOnce(); err != nil {
		t.Fatal(err)
	}
	approval, _ = store.Approval(queue)
	if approval.State != "approved" || count(agentmail.sent, approval.DraftID) != 1 {
		t.Fatalf("ambiguous send was not reconciled exactly once: %#v sent=%v", approval, agentmail.sent)
	}
}

func TestChangedDraftFailsClosed(t *testing.T) {
	source := message("external-2", "pat@example.net", "Question", "Please reply")
	worker, agentmail, _, store := newWorker(t, true, source)
	_, _ = worker.RunOnce()
	queue := policy.QueueID("external-2")
	approval, _ := store.Approval(queue)
	draft := agentmail.drafts[approval.DraftID]
	draft.Text = "changed"
	agentmail.drafts[approval.DraftID] = draft
	token, _ := policy.ApprovalToken(queue, testConfig(true).SigningSecret)
	agentmail.messages = append(agentmail.messages, message("approve-2", "austin@timelesstechs.com", "Approval", "APPROVE "+queue+" "+token))
	_, _ = worker.RunOnce()
	approval, _ = store.Approval(queue)
	if approval.State != "failed" || count(agentmail.sent, approval.DraftID) != 0 {
		t.Fatalf("changed draft did not fail closed: %#v", approval)
	}
}

func TestDisabledAndInitializeHaveNoOutboundActivity(t *testing.T) {
	source := message("old-1", "garyb@timelesstechs.com", "Old", "Old body")
	worker, agentmail, model, store := newWorker(t, false, source)
	result, err := worker.RunOnce()
	if err != nil || result.State != "disabled" || agentmail.listCalls != 0 {
		t.Fatalf("disabled worker touched network: %#v %v", result, err)
	}
	result, err = worker.Initialize("")
	if err != nil || result.Preexisting != 1 || result.Sends != 0 || len(agentmail.sent) != 0 || model.calls != 0 {
		t.Fatalf("unsafe initialization: %#v %v", result, err)
	}
	record, _ := store.Message("old-1")
	if record.State != "preexisting" {
		t.Fatalf("old message not marked: %#v", record)
	}
}

func TestInitializeLeavesOnlyExplicitReplayPending(t *testing.T) {
	old := message("old-1", "garyb@timelesstechs.com", "Old", "Old body")
	replay := message("replay-1", "garyb@timelesstechs.com", "Instructions", "New body")
	worker, agentmail, model, store := newWorker(t, false, old, replay)
	result, err := worker.Initialize(replay.MessageID)
	if err != nil || result.Preexisting != 1 || !result.ReplayPending || result.Sends != 0 {
		t.Fatalf("unsafe replay initialization: %#v %v", result, err)
	}
	if _, exists := store.Message(old.MessageID); !exists {
		t.Fatal("older inbound message was not checkpointed")
	}
	if _, exists := store.Message(replay.MessageID); exists {
		t.Fatal("explicit replay message was checkpointed")
	}
	if len(agentmail.sent) != 0 || model.calls != 0 {
		t.Fatal("initialization performed outbound activity")
	}
}

func TestInitializeRejectsMissingReplayMessage(t *testing.T) {
	worker, _, _, _ := newWorker(t, false, message("old-1", "garyb@timelesstechs.com", "Old", "Body"))
	if _, err := worker.Initialize("missing"); err == nil {
		t.Fatal("missing replay message was accepted")
	}
}

func TestAutomatedMessageSuppressed(t *testing.T) {
	source := message("auto-1", "garyb@timelesstechs.com", "Auto", "Automated")
	source.Headers = map[string]string{"Auto-Submitted": "auto-replied"}
	worker, agentmail, model, store := newWorker(t, true, source)
	_, _ = worker.RunOnce()
	record, _ := store.Message("auto-1")
	if record.State != "suppressed" || len(agentmail.sent) != 0 || model.calls != 0 {
		t.Fatalf("automatic message not suppressed: %#v", record)
	}
}

func TestAutomatedMessageCannotCarryApprovalCommand(t *testing.T) {
	queue := "TITUS-ABCDEF123456"
	token, _ := policy.ApprovalToken(queue, testConfig(true).SigningSecret)
	source := message("auto-command", "garyb@timelesstechs.com", "Auto", "APPROVE "+queue+" "+token)
	source.Headers = map[string]string{"Auto-Submitted": "auto-replied"}
	worker, _, _, store := newWorker(t, true, source)
	_, _ = worker.RunOnce()
	record, _ := store.Message("auto-command")
	if record.Classification != "automated" || record.State != "suppressed" {
		t.Fatalf("automated command was not suppressed: %#v", record)
	}
}

func TestApprovalSubjectIsHeaderSafe(t *testing.T) {
	source := message("subject-injection", "pat@example.net", "Question\r\nBcc: bad@example.net", "Body")
	worker, agentmail, _, _ := newWorker(t, true, source)
	_, _ = worker.RunOnce()
	notice := agentmail.drafts[agentmail.sent[0]]
	if strings.ContainsAny(notice.Subject, "\r\n") {
		t.Fatalf("unsafe subject created: %q", notice.Subject)
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

func count(values []string, target string) int {
	total := 0
	for _, value := range values {
		if value == target {
			total++
		}
	}
	return total
}
