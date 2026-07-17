package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"overnightdesk/titus-email-poller/internal/config"
	"overnightdesk/titus-email-poller/internal/policy"
	"overnightdesk/titus-email-poller/internal/state"
	"overnightdesk/titus-email-poller/internal/store"
	"overnightdesk/titus-email-poller/internal/transport"
)

type AgentMail interface {
	ListMessages(pageToken string, limit int) (transport.ListResponse, error)
	GetMessage(messageID string) (transport.Message, error)
	Reply(messageID, text, purpose string) (transport.SendResult, error)
}

type Hermes interface {
	SubmitRun(input, sessionID, sessionKey, idempotency string) (transport.HermesRun, error)
	GetRun(runID string) (transport.HermesRun, error)
}

type Worker struct {
	config     config.Config
	state      *state.Store
	repository store.Repository
	agentmail  AgentMail
	hermes     Hermes
	health     string
}

type Result struct {
	State         string `json:"state"`
	Landed        int    `json:"landed,omitempty"`
	Claimed       int    `json:"claimed,omitempty"`
	Preexisting   int    `json:"preexisting,omitempty"`
	ReplayPending bool   `json:"replay_pending,omitempty"`
	Sends         int    `json:"sends"`
}

func New(configuration config.Config, stateStore *state.Store, repository store.Repository, agentmail AgentMail, hermes Hermes, healthPath string) *Worker {
	return &Worker{config: configuration, state: stateStore, repository: repository, agentmail: agentmail, hermes: hermes, health: healthPath}
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
		inserted, err := worker.state.ReserveMessage(state.MessageRecord{
			MessageID: message.MessageID, ThreadID: message.ThreadID, Classification: "preexisting",
		})
		if err != nil {
			return Result{}, err
		}
		if inserted {
			count++
			if err := worker.state.UpdateMessage(message.MessageID, "preexisting"); err != nil {
				return Result{}, err
			}
		}
	}
	if err := worker.state.SetMetadata("initialized_at", timestamp()); err != nil {
		return Result{}, err
	}
	healthState := "initialized"
	if !worker.config.Enabled {
		healthState = "disabled"
	}
	if err := WriteHealth(worker.health, healthState, ""); err != nil {
		return Result{}, err
	}
	if replayMessageID != "" && !replayPending {
		return Result{}, errors.New("requested replay message was not found among inbound messages")
	}
	worker.emit("intake.initialize", "ok", map[string]any{"count": count, "attempt": 1})
	return Result{State: healthState, Preexisting: count, ReplayPending: replayPending}, nil
}

func (worker *Worker) RunOnce() (Result, error) {
	if !worker.config.Enabled {
		if err := worker.state.SetMetadata("enabled", "false"); err != nil {
			return Result{}, err
		}
		if err := WriteHealth(worker.health, "disabled", ""); err != nil {
			return Result{}, err
		}
		return Result{State: "disabled"}, nil
	}
	ctx := context.Background()
	if err := worker.state.SetMetadata("enabled", "true"); err != nil {
		return worker.failCycle(err)
	}
	sends, err := worker.recoverDeliveries(ctx)
	if err != nil {
		return worker.failCycle(err)
	}
	landed, err := worker.landMessages(ctx)
	if err != nil {
		return worker.failCycle(err)
	}
	claimed, err := worker.claimClean(ctx)
	if err != nil {
		return worker.failCycle(err)
	}
	if err := worker.state.SetMetadata("last_success_at", timestamp()); err != nil {
		return worker.failCycle(err)
	}
	if err := WriteHealth(worker.health, "healthy", ""); err != nil {
		return Result{}, err
	}
	worker.emit("intake.cycle", "ok", map[string]any{"landed": landed, "claimed": claimed, "sends": sends, "attempt": 1})
	return Result{State: "healthy", Landed: landed, Claimed: claimed, Sends: sends}, nil
}

func (worker *Worker) landMessages(ctx context.Context) (int, error) {
	messages, err := worker.listCandidateMessages(worker.config.MaxMessages, 100)
	if err != nil {
		return 0, err
	}
	landed := 0
	for _, summary := range messages {
		if !worker.shouldProcess(summary) {
			continue
		}
		message, err := worker.agentmail.GetMessage(summary.MessageID)
		if err != nil {
			return landed, err
		}
		if message.MessageID != summary.MessageID || message.InboxID != worker.config.InboxID {
			return landed, errors.New("AgentMail message inbox did not match configured route")
		}
		sender, senderValid := policy.NormalizeAddress(message.From)
		authorized := senderValid && contains(worker.config.AllowedSenders, sender) && !policy.IsAutomated(message.Headers)
		classification := "unauthorized"
		if authorized {
			classification = "authorized"
		} else if policy.IsAutomated(message.Headers) {
			classification = "automated"
		} else if !senderValid {
			classification = "invalid_sender"
		}
		inserted, err := worker.state.ReserveMessage(state.MessageRecord{
			MessageID: message.MessageID, ThreadID: message.ThreadID, Classification: classification,
		})
		if err != nil || !inserted {
			if err != nil {
				return landed, err
			}
			continue
		}
		receivedAt := time.Now().UTC()
		if parsed, err := time.Parse(time.RFC3339, message.Timestamp); err == nil {
			receivedAt = parsed
		}
		wasLanded, err := worker.repository.LandDirty(ctx, store.DirtyEmail{
			RouteID: worker.config.RouteID, InboxID: worker.config.InboxID, TargetAgent: worker.config.TargetAgent,
			ProviderMessageID: message.MessageID, ThreadID: message.ThreadID, InReplyTo: message.InReplyTo,
			Body: message.BodyExcerpt(50_000), Sender: sender, Subject: safeSubject(message.Subject, 500),
			ReceivedAt: receivedAt, SenderAuthorized: authorized,
		})
		if err != nil {
			return landed, err
		}
		if err := worker.state.UpdateMessage(message.MessageID, "landed"); err != nil {
			return landed, err
		}
		if wasLanded {
			landed++
		}
	}
	return landed, nil
}

func (worker *Worker) claimClean(ctx context.Context) (int, error) {
	emails, err := worker.repository.ClaimClean(ctx, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, worker.config.MaxCleanClaims)
	if err != nil {
		return 0, err
	}
	for _, email := range emails {
		if strings.TrimSpace(email.SafeContent) == "" || len([]rune(email.SafeContent)) > 50_000 {
			failed, failErr := worker.repository.Fail(ctx, email.ID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, "invalid_clean_content")
			if failErr != nil || !failed {
				if failErr == nil {
					failErr = errors.New("invalid clean content lost route ownership")
				}
				return 0, failErr
			}
			continue
		}
		created, err := worker.state.CreateDelivery(state.DeliveryRecord{
			CleanID: email.ID, ProviderMessageID: email.ProviderMessageID, ThreadID: email.ThreadID,
			State: "submitting",
		})
		if err != nil || !created {
			if err == nil {
				err = errors.New("clean delivery already exists")
			}
			_, _ = worker.repository.Fail(ctx, email.ID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, "state_persist_failed")
			return 0, err
		}
		session := sessionID(worker.config.RouteID, email.ThreadID, email.ProviderMessageID)
		run, err := worker.hermes.SubmitRun(email.SafeContent, session, session, "clean:"+email.ID)
		if err != nil {
			_, _ = worker.repository.Fail(ctx, email.ID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, transport.ErrorCode(err))
			_ = worker.state.RemoveDelivery(email.ID)
			return 0, err
		}
		if err := worker.state.AttachRun(email.ID, run.RunID, run.Status); err != nil {
			return 0, err
		}
		worker.emit("hermes.run", "submitted", map[string]any{"clean_id_hash": digestID(email.ID), "run_id_hash": digestID(run.RunID), "attempt": 1})
	}
	return len(emails), nil
}

func (worker *Worker) recoverDeliveries(ctx context.Context) (int, error) {
	sends := 0
	for _, delivery := range worker.state.Deliveries() {
		if delivery.RunID == "" {
			failed, err := worker.repository.Fail(ctx, delivery.CleanID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, "ambiguous_run_submission")
			if err != nil || !failed {
				if err == nil {
					err = errors.New("ambiguous delivery lost route ownership")
				}
				return sends, err
			}
			if err := worker.state.RemoveDelivery(delivery.CleanID); err != nil {
				return sends, err
			}
			continue
		}
		run, err := worker.hermes.GetRun(delivery.RunID)
		if err != nil {
			return sends, err
		}
		switch run.Status {
		case "queued", "running", "stopping":
			if err := worker.state.UpdateDelivery(delivery.CleanID, run.Status); err != nil {
				return sends, err
			}
		case "waiting_for_approval":
			if !delivery.ApprovalNotified {
				notice := approvalNotice(worker.config.TargetAgent, run.RunID)
				if _, err := worker.agentmail.Reply(delivery.ProviderMessageID, notice, "approval-"+run.RunID); err != nil {
					return sends, err
				}
				if err := worker.state.MarkApprovalNotified(delivery.CleanID); err != nil {
					return sends, err
				}
			}
			if err := worker.state.UpdateDelivery(delivery.CleanID, run.Status); err != nil {
				return sends, err
			}
		case "completed":
			reply, ok := policy.ValidateReply(run.Output)
			if !ok {
				failed, err := worker.repository.Fail(ctx, delivery.CleanID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, "invalid_hermes_output")
				if err != nil || !failed {
					if err == nil {
						err = errors.New("invalid output delivery lost route ownership")
					}
					return sends, err
				}
				if err := worker.state.RemoveDelivery(delivery.CleanID); err != nil {
					return sends, err
				}
				continue
			}
			if _, err := worker.agentmail.Reply(delivery.ProviderMessageID, reply, "final-"+delivery.CleanID); err != nil {
				return sends, err
			}
			if err := worker.state.UpdateDelivery(delivery.CleanID, "replied"); err != nil {
				return sends, err
			}
			completed, err := worker.repository.Complete(ctx, delivery.CleanID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent)
			if err != nil || !completed {
				if err == nil {
					err = errors.New("clean email completion lost route ownership")
				}
				return sends, err
			}
			if err := worker.state.RemoveDelivery(delivery.CleanID); err != nil {
				return sends, err
			}
			sends++
			worker.emit("email.reply", "sent", map[string]any{"clean_id_hash": digestID(delivery.CleanID), "attempt": 1})
		case "failed", "cancelled":
			code := "hermes_" + run.Status
			failed, err := worker.repository.Fail(ctx, delivery.CleanID, worker.config.RouteID, worker.config.InboxID, worker.config.TargetAgent, code)
			if err != nil || !failed {
				if err == nil {
					err = errors.New("failed delivery lost route ownership")
				}
				return sends, err
			}
			if err := worker.state.RemoveDelivery(delivery.CleanID); err != nil {
				return sends, err
			}
		default:
			return sends, errors.New("unknown Hermes run status")
		}
	}
	return sends, nil
}

func (worker *Worker) listMessages(maximum, maxPages int) ([]transport.Message, error) {
	result := make([]transport.Message, 0, maximum)
	pageToken := ""
	seenTokens := make(map[string]struct{})
	for page := 0; page < maxPages && len(result) < maximum; page++ {
		response, err := worker.agentmail.ListMessages(pageToken, min(20, maximum-len(result)))
		if err != nil {
			return nil, err
		}
		remaining := maximum - len(result)
		if len(response.Messages) > remaining {
			response.Messages = response.Messages[:remaining]
		}
		result = append(result, response.Messages...)
		pageToken = response.NextPageToken
		if pageToken == "" {
			break
		}
		if _, duplicate := seenTokens[pageToken]; duplicate {
			return nil, errors.New("AgentMail pagination token repeated")
		}
		seenTokens[pageToken] = struct{}{}
	}
	return result, nil
}

func (worker *Worker) listCandidateMessages(maximum, maxPages int) ([]transport.Message, error) {
	result := make([]transport.Message, 0, maximum)
	pageToken := ""
	seenTokens := make(map[string]struct{})
	for page := 0; page < maxPages && len(result) < maximum; page++ {
		response, err := worker.agentmail.ListMessages(pageToken, 20)
		if err != nil {
			return nil, err
		}
		for _, message := range response.Messages {
			if worker.shouldProcess(message) {
				result = append(result, message)
				if len(result) == maximum {
					break
				}
			}
		}
		pageToken = response.NextPageToken
		if pageToken == "" {
			break
		}
		if _, duplicate := seenTokens[pageToken]; duplicate {
			return nil, errors.New("AgentMail pagination token repeated")
		}
		seenTokens[pageToken] = struct{}{}
	}
	return result, nil
}

func (worker *Worker) shouldProcess(message transport.Message) bool {
	if !worker.isInbound(message) || message.MessageID == "" {
		return false
	}
	record, exists := worker.state.Message(message.MessageID)
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

func (worker *Worker) failCycle(err error) (Result, error) {
	errorCode := transport.ErrorCode(err)
	_ = WriteHealth(worker.health, "error", errorCode)
	worker.emit("intake.cycle", "error", map[string]any{"error_code": errorCode, "attempt": 1})
	return Result{}, err
}

func sessionID(routeID, threadID, messageID string) string {
	if threadID == "" {
		threadID = messageID
	}
	digest := sha256.Sum256([]byte(routeID + "\x00" + threadID))
	return "email-" + routeID + "-" + hex.EncodeToString(digest[:16])
}

func digestID(value string) string {
	digest := sha256.Sum256([]byte(value))
	return hex.EncodeToString(digest[:8])
}

func contains(values map[string]struct{}, value string) bool {
	_, ok := values[value]
	return ok
}

func safeSubject(value string, limit int) string {
	value = strings.TrimSpace(strings.NewReplacer("\r", " ", "\n", " ").Replace(value))
	return policy.BoundText(value, limit)
}

func approvalNotice(targetAgent, runID string) string {
	return fmt.Sprintf("This task is waiting for approval. No action has been approved by email.\n\nIn %s's existing Matrix or Telegram channel, ask the agent to run:\n/opt/data/bin/hermes-email-run-approval %s once\n\nApprove that fixed helper through the channel's normal approval prompt. Replying to this email does not grant approval.", targetAgent, runID)
}

func (worker *Worker) emit(event, status string, fields map[string]any) {
	payload := map[string]any{
		"timestamp": timestamp(), "event": event, "status": status,
		"route_id": worker.config.RouteID, "target_agent": worker.config.TargetAgent,
	}
	for _, key := range []string{"clean_id_hash", "run_id_hash", "error_code", "count", "landed", "claimed", "sends", "attempt"} {
		if value, ok := fields[key]; ok {
			payload[key] = value
		}
	}
	raw, _ := json.Marshal(payload)
	_, _ = fmt.Fprintln(os.Stdout, string(raw))
}

func timestamp() string { return time.Now().UTC().Format(time.RFC3339Nano) }
