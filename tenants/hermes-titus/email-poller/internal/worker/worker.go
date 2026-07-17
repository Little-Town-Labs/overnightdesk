package worker

import (
	"crypto/hmac"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"overnightdesk/titus-email-poller/internal/config"
	"overnightdesk/titus-email-poller/internal/policy"
	"overnightdesk/titus-email-poller/internal/state"
	"overnightdesk/titus-email-poller/internal/transport"
)

const fallbackReply = "Thank you. I received your email and will follow up shortly.\n\nBest,\nTitus"

type AgentMail interface {
	ListMessages(pageToken string, limit int) (transport.ListResponse, error)
	GetMessage(messageID string) (transport.Message, error)
	Reply(messageID, text string) (transport.SendResult, error)
	CreateDraft(request transport.CreateDraftRequest) (transport.Draft, error)
	GetDraft(draftID string) (transport.Draft, error)
	SendDraft(draftID string) (transport.SendResult, error)
}

type Model interface {
	GenerateReply(subject, text string) (string, error)
}

type Worker struct {
	config    config.Config
	store     *state.Store
	agentmail AgentMail
	model     Model
	health    string
}

type Result struct {
	State         string `json:"state"`
	Processed     int    `json:"processed,omitempty"`
	Preexisting   int    `json:"preexisting,omitempty"`
	ReplayPending bool   `json:"replay_pending,omitempty"`
	Sends         int    `json:"sends"`
}

func New(configuration config.Config, store *state.Store, agentmail AgentMail, model Model, healthPath string) *Worker {
	return &Worker{config: configuration, store: store, agentmail: agentmail, model: model, health: healthPath}
}

func (worker *Worker) Initialize(replayMessageID string) (Result, error) {
	messages, err := worker.listMessages(1000, 100)
	if err != nil {
		return Result{}, err
	}
	count := 0
	replayPending := false
	for _, message := range messages {
		if !worker.isInbound(message) {
			continue
		}
		if replayMessageID != "" && message.MessageID == replayMessageID {
			replayPending = true
			continue
		}
		record := worker.messageRecord(message, "preexisting")
		inserted, err := worker.store.ReserveMessage(record)
		if err != nil {
			return Result{}, err
		}
		if inserted {
			count++
			_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.State = "preexisting" })
		}
	}
	_ = worker.store.SetMetadata("initialized_at", timestamp())
	healthState := "initialized"
	if !worker.config.Enabled {
		healthState = "disabled"
	}
	if err := WriteHealth(worker.health, healthState, ""); err != nil {
		return Result{}, err
	}
	emit("poller.initialize", "ok", map[string]any{"count": count})
	if replayMessageID != "" && !replayPending {
		return Result{}, errors.New("requested replay message was not found among inbound messages")
	}
	return Result{State: healthState, Preexisting: count, ReplayPending: replayPending, Sends: 0}, nil
}

func (worker *Worker) RunOnce() (Result, error) {
	if !worker.config.Enabled {
		_ = worker.store.SetMetadata("enabled", "false")
		if err := WriteHealth(worker.health, "disabled", ""); err != nil {
			return Result{}, err
		}
		return Result{State: "disabled", Sends: 0}, nil
	}
	_ = worker.store.SetMetadata("enabled", "true")
	messages, err := worker.listMessages(200, 10)
	if err != nil {
		return worker.failCycle(err)
	}
	processed := 0
	sends := 0
	for _, summary := range messages {
		if processed >= worker.config.MaxMessages || !worker.shouldProcess(summary) {
			continue
		}
		message, err := worker.agentmail.GetMessage(summary.MessageID)
		if err != nil {
			return worker.failCycle(err)
		}
		didProcess, messageSends, err := worker.processMessage(message)
		if err != nil {
			return worker.failCycle(err)
		}
		if didProcess {
			processed++
		}
		sends += messageSends
	}
	_ = worker.store.SetMetadata("last_success_at", timestamp())
	if err := WriteHealth(worker.health, "healthy", ""); err != nil {
		return Result{}, err
	}
	emit("poller.cycle", "ok", map[string]any{"count": processed})
	return Result{State: "healthy", Processed: processed, Sends: sends}, nil
}

func (worker *Worker) processMessage(message transport.Message) (bool, int, error) {
	sender, senderOK := policy.NormalizeAddress(message.From)
	if !senderOK || policy.IsAutomated(message.Headers) {
		classification := "invalid_sender"
		if senderOK {
			classification = "automated"
		}
		processed, err := worker.suppress(message, classification)
		return processed, 0, err
	}
	command, commandOK := policy.ParseApprovalCommand(message.BodyExcerpt(6000))
	if commandOK && contains(worker.config.Approvers, sender) {
		return worker.processApproval(message, sender, command)
	}
	classification := "external"
	if contains(worker.config.TrustedSenders, sender) {
		classification = "trusted"
	}
	existing, exists := worker.store.Message(message.MessageID)
	if exists && existing.State != "processing" {
		return false, 0, nil
	}
	if !exists {
		if _, err := worker.store.ReserveMessage(worker.messageRecord(message, classification)); err != nil {
			return false, 0, err
		}
	}
	if classification == "trusted" {
		sends, err := worker.processTrusted(message)
		return true, sends, err
	}
	sends, err := worker.processExternal(message, sender)
	return true, sends, err
}

func (worker *Worker) processTrusted(message transport.Message) (int, error) {
	record, _ := worker.store.Message(message.MessageID)
	reply := record.ReplyText
	if reply == "" {
		reply = worker.generateReply(message)
		_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.ReplyText = reply })
	}
	result, err := worker.agentmail.Reply(message.MessageID, reply)
	if err != nil {
		return 0, err
	}
	_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.State, value.RemoteID = "replied", result.MessageID })
	emit("message.reply", "sent", map[string]any{"message_id_hash": policy.QueueID(message.MessageID), "classification": "trusted"})
	return 1, nil
}

func (worker *Worker) processExternal(message transport.Message, sender string) (int, error) {
	queueID := policy.QueueID(message.MessageID)
	approval, exists := worker.store.Approval(queueID)
	if exists && terminalApproval(approval.State) {
		return 0, nil
	}
	token, err := policy.ApprovalToken(queueID, worker.config.SigningSecret)
	if err != nil {
		return 0, err
	}
	if !exists {
		reply := worker.generateReply(message)
		approval = newApproval(message, sender, queueID, token, reply)
		if _, err := worker.store.CreateApproval(approval); err != nil {
			return 0, err
		}
	}
	if approval.DraftID == "" {
		approval, err = worker.createReplyDraft(message, approval)
		if err != nil {
			return 0, err
		}
	}
	if approval.NotificationDraftID == "" {
		approval, err = worker.createNoticeDraft(message, approval, token)
		if err != nil {
			return 0, err
		}
	}
	if _, err := worker.agentmail.SendDraft(approval.NotificationDraftID); err != nil {
		return 0, err
	}
	_ = worker.store.UpdateApproval(queueID, func(value *state.ApprovalRecord) { value.State = "pending" })
	_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.State, value.RemoteID = "pending_approval", approval.DraftID })
	emit("message.queue", "pending", map[string]any{"queue_id": queueID, "classification": "external"})
	return 1, nil
}

func (worker *Worker) createReplyDraft(message transport.Message, approval state.ApprovalRecord) (state.ApprovalRecord, error) {
	draft, err := worker.agentmail.CreateDraft(transport.CreateDraftRequest{
		To: []string{approval.Recipient}, Subject: approval.DraftSubject,
		Text: approval.DraftText, ClientID: approval.DraftClientID,
	})
	if err != nil {
		return approval, err
	}
	if err := verifyPlainDraft(draft, approval.Recipient, approval.DraftSubject, approval.DraftText); err != nil {
		return approval, err
	}
	approval.DraftID = draft.DraftID
	err = worker.store.UpdateApproval(approval.QueueID, func(value *state.ApprovalRecord) { value.DraftID = draft.DraftID })
	return approval, err
}

func (worker *Worker) createNoticeDraft(message transport.Message, approval state.ApprovalRecord, token string) (state.ApprovalRecord, error) {
	recipients := keys(worker.config.Approvers)
	draft, err := worker.agentmail.CreateDraft(transport.CreateDraftRequest{
		To: recipients, Subject: fmt.Sprintf("[Titus approval %s] Reply requested: %s", approval.QueueID, safeSubject(message.Subject, 120)),
		Text: approvalNotice(approval, token, message.Subject), ClientID: approval.NotificationClientID,
	})
	if err != nil {
		return approval, err
	}
	if !sameRecipients(draft.To, worker.config.Approvers) {
		return approval, errDraftMismatch
	}
	approval.NotificationDraftID = draft.DraftID
	err = worker.store.UpdateApproval(approval.QueueID, func(value *state.ApprovalRecord) { value.NotificationDraftID = draft.DraftID })
	return approval, err
}

func (worker *Worker) processApproval(message transport.Message, sender string, command policy.ApprovalCommand) (bool, int, error) {
	existingMessage, exists := worker.store.Message(message.MessageID)
	if exists && existingMessage.State != "processing" {
		return false, 0, nil
	}
	if !exists {
		_, _ = worker.store.ReserveMessage(worker.messageRecord(message, "approval_command"))
	}
	approval, found := worker.store.Approval(command.QueueID)
	if !found || !worker.validApprovalToken(command, approval) || !worker.claimOrResume(command, approval, sender, message.MessageID) {
		_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) {
			value.State, value.LastErrorCode = "command_processed", "invalid_command"
		})
		return true, 0, nil
	}
	if command.Decision == "reject" {
		_ = worker.store.UpdateApproval(command.QueueID, func(value *state.ApprovalRecord) { value.State = "rejected" })
		_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.State = "command_processed" })
		return true, 0, nil
	}
	approval, _ = worker.store.Approval(command.QueueID)
	result, err := worker.sendApprovedDraft(approval)
	if errors.Is(err, errDraftMismatch) {
		_ = worker.store.UpdateApproval(command.QueueID, func(value *state.ApprovalRecord) { value.State = "failed" })
		_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) {
			value.State, value.LastErrorCode = "command_processed", "draft_mismatch"
		})
		return true, 0, nil
	}
	if err != nil {
		return true, 0, err
	}
	_ = worker.store.UpdateApproval(command.QueueID, func(value *state.ApprovalRecord) { value.State, value.SentMessageID = "approved", result.MessageID })
	_ = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.State = "command_processed" })
	return true, 1, nil
}

func (worker *Worker) sendApprovedDraft(approval state.ApprovalRecord) (transport.SendResult, error) {
	if approval.State == "approving" {
		draft, err := worker.agentmail.GetDraft(approval.DraftID)
		if err != nil {
			return transport.SendResult{}, err
		}
		if verifyPlainDraft(draft, approval.Recipient, approval.DraftSubject, approval.DraftText) != nil ||
			!hmac.Equal([]byte(approval.DraftDigest), []byte(policy.DraftDigest(
				approval.Recipient, approval.InReplyTo, approval.DraftSubject, draft.Text,
			))) {
			return transport.SendResult{}, errDraftMismatch
		}
		_ = worker.store.UpdateApproval(approval.QueueID, func(value *state.ApprovalRecord) { value.State = "sending" })
	}
	return worker.agentmail.SendDraft(approval.DraftID)
}

func (worker *Worker) validApprovalToken(command policy.ApprovalCommand, approval state.ApprovalRecord) bool {
	expected, err := policy.ApprovalToken(command.QueueID, worker.config.SigningSecret)
	return err == nil && hmac.Equal([]byte(expected), []byte(command.Token)) &&
		hmac.Equal([]byte(approval.TokenDigest), []byte(policy.TokenDigest(command.Token)))
}

func (worker *Worker) claimOrResume(command policy.ApprovalCommand, approval state.ApprovalRecord, sender, messageID string) bool {
	claimed, _ := worker.store.ClaimDecision(command.QueueID, command.Decision, sender, messageID)
	if claimed {
		return true
	}
	resumable := approval.State == "rejecting"
	if command.Decision == "approve" {
		resumable = approval.State == "approving" || approval.State == "sending"
	}
	return resumable && approval.DecidedBy == sender && approval.DecisionMessageID == messageID
}

func (worker *Worker) suppress(message transport.Message, classification string) (bool, error) {
	if _, exists := worker.store.Message(message.MessageID); exists {
		return false, nil
	}
	inserted, err := worker.store.ReserveMessage(worker.messageRecord(message, classification))
	if err != nil || !inserted {
		return inserted, err
	}
	err = worker.store.UpdateMessage(message.MessageID, func(value *state.MessageRecord) { value.State = "suppressed" })
	return true, err
}

func (worker *Worker) generateReply(message transport.Message) string {
	value, err := worker.model.GenerateReply(safeSubject(message.Subject, 300), message.BodyExcerpt(6000))
	if err == nil {
		if validated, ok := policy.ValidateReply(value); ok {
			return validated
		}
	}
	return fallbackReply
}

func (worker *Worker) listMessages(maximum, maxPages int) ([]transport.Message, error) {
	result := make([]transport.Message, 0, maximum)
	pageToken := ""
	for page := 0; page < maxPages && len(result) < maximum; page++ {
		response, err := worker.agentmail.ListMessages(pageToken, min(20, maximum-len(result)))
		if err != nil {
			return nil, err
		}
		result = append(result, response.Messages...)
		pageToken = response.NextPageToken
		if pageToken == "" {
			break
		}
	}
	return result, nil
}

func (worker *Worker) shouldProcess(message transport.Message) bool {
	if !worker.isInbound(message) || message.MessageID == "" {
		return false
	}
	record, exists := worker.store.Message(message.MessageID)
	return !exists || record.State == "processing"
}

func (worker *Worker) isInbound(message transport.Message) bool {
	for _, label := range message.Labels {
		switch strings.ToLower(label) {
		case "sent", "draft", "spam", "trash":
			return false
		}
	}
	sender, _ := policy.NormalizeAddress(message.From)
	return sender != worker.config.InboxAddress
}

func (worker *Worker) messageRecord(message transport.Message, classification string) state.MessageRecord {
	sender, _ := policy.NormalizeAddress(message.From)
	return state.MessageRecord{
		MessageID: message.MessageID, ThreadID: message.ThreadID, Sender: sender,
		Subject: safeSubject(message.Subject, 300), Classification: classification,
		ClientID: policy.ClientID(classification, message.MessageID),
	}
}

func (worker *Worker) failCycle(err error) (Result, error) {
	errorCode := transport.ErrorCode(err)
	if errors.Is(err, errDraftMismatch) {
		errorCode = "draft_mismatch"
	}
	_ = WriteHealth(worker.health, "error", errorCode)
	emit("poller.cycle", "error", map[string]any{"error_code": errorCode})
	return Result{}, err
}

func newApproval(message transport.Message, sender, queueID, token, reply string) state.ApprovalRecord {
	subject := replySubject(message.Subject)
	return state.ApprovalRecord{
		QueueID: queueID, SourceMessageID: message.MessageID,
		DraftClientID:        policy.ClientID("approval-draft", message.MessageID),
		NotificationClientID: policy.ClientID("approval-notice", message.MessageID),
		Recipient:            sender, InReplyTo: message.MessageID, DraftSubject: subject, DraftText: reply,
		DraftDigest: policy.DraftDigest(sender, message.MessageID, subject, reply),
		TokenDigest: policy.TokenDigest(token), State: "preparing",
	}
}

func verifyPlainDraft(draft transport.Draft, recipient, subject, text string) error {
	if len(draft.To) != 1 || draft.InReplyTo != "" || draft.Subject != subject || draft.Text != text {
		return errDraftMismatch
	}
	actual, ok := policy.NormalizeAddress(draft.To[0])
	if !ok || actual != recipient {
		return errDraftMismatch
	}
	return nil
}

func replySubject(subject string) string {
	subject = safeSubject(subject, 180)
	if strings.HasPrefix(strings.ToLower(subject), "re:") {
		return subject
	}
	return "Re: " + subject
}

func approvalNotice(approval state.ApprovalRecord, token, subject string) string {
	return fmt.Sprintf("Titus queued a reply for approval.\n\nFrom: %s\nSubject: %s\nQueue: %s\n\nProposed reply:\n---\n%s\n---\n\nReply with exactly one of these as the first non-empty line:\nAPPROVE %s %s\nREJECT %s %s", approval.Recipient, safeSubject(subject, 200), approval.QueueID, approval.DraftText, approval.QueueID, token, approval.QueueID, token)
}

func terminalApproval(value string) bool {
	return value == "pending" || value == "approved" || value == "rejected" || value == "failed"
}

func keys(values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func contains(values map[string]struct{}, value string) bool {
	_, ok := values[value]
	return ok
}

func sameRecipients(actual []string, expected map[string]struct{}) bool {
	if len(actual) != len(expected) {
		return false
	}
	found := make(map[string]struct{}, len(actual))
	for _, value := range actual {
		normalized, ok := policy.NormalizeAddress(value)
		if !ok {
			return false
		}
		found[normalized] = struct{}{}
	}
	return policy.EqualAddressSets(found, expected)
}

func safeSubject(value string, limit int) string {
	value = strings.TrimSpace(strings.NewReplacer("\r", " ", "\n", " ").Replace(value))
	return bounded(value, limit)
}

func bounded(value string, limit int) string {
	if len(value) > limit {
		return value[:limit]
	}
	return value
}

func emit(event, status string, fields map[string]any) {
	payload := map[string]any{"timestamp": timestamp(), "event": event, "status": status}
	for _, key := range []string{"message_id_hash", "queue_id", "classification", "error_code", "count"} {
		if value, ok := fields[key]; ok {
			payload[key] = value
		}
	}
	raw, _ := json.Marshal(payload)
	_, _ = fmt.Fprintln(os.Stdout, string(raw))
}

func timestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
