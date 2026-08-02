package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/orchestrator"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/securityteam"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

const analysisAttemptDeadline = 20 * time.Minute

var errAnalysisDeferred = errors.New("meeting analysis deferred")

func (processor Processor) advanceMeetingAnalysis(ctx context.Context, discovery *state.Document, key string, artifact state.Artifact, record state.BriefRecord, now time.Time, cycleID string) error {
	timestamp := now.UTC().Format(time.RFC3339Nano)
	if record.Analysis != nil {
		switch record.Analysis.Status {
		case "cleanup_pending", "cleanup_retryable":
			return processor.cleanupAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
		case "cleanup_blocked", "deleted":
			return nil
		}
	}

	if record.Analysis == nil || record.Analysis.Status == "dispatch_pending" {
		plan, updated, err := processor.prepareAnalysisPlan(ctx, artifact, record, now)
		if err != nil {
			if errors.Is(err, errAnalysisDeferred) {
				return nil
			}
			return err
		}
		record = updated
		if record.Analysis == nil {
			attempt := record.RetryCount + 1
			if attempt > 8 {
				record.ReviewStatus = "blocked"
				record.LastErrorCode = "orchestrator_attempts_exhausted"
				record.UpdatedAt = timestamp
				return processor.commitBriefRecord(key, record)
			}
			record.MeetingReference = meetingReference(key)
			record.SourceDigest = record.Custody.PlaintextSHA256
			record.AnalysisPromptVersion = orchestrator.PromptVersion
			record.ReviewStatus = "analysis_pending"
			record.Analysis = &state.AnalysisAttempt{
				Version: 1, Attempt: attempt, SessionID: plan.SessionID,
				CreateBodyDigest: plan.CreateBodyDigest, RunBodyDigest: plan.RunBodyDigest, ScreenedDigest: plan.ScreenedDigest,
				Status: "dispatch_pending", ChildSessionIDs: []string{}, StartedAt: timestamp, LastObservedAt: timestamp,
			}
			record.UpdatedAt = timestamp
			if err := processor.commitBriefRecord(key, record); err != nil {
				return err
			}
		} else if record.Analysis.SessionID != plan.SessionID || record.Analysis.CreateBodyDigest != plan.CreateBodyDigest || record.Analysis.RunBodyDigest != plan.RunBodyDigest || record.Analysis.ScreenedDigest != plan.ScreenedDigest {
			return errors.New("meeting_state_invalid")
		}
		if err := processor.Orchestrator.EnsureSession(ctx, plan); err != nil {
			code := orchestrator.SafeCode(err)
			record.Analysis.LastErrorCode = code
			record.Analysis.LastObservedAt = timestamp
			record.LastErrorCode = code
			record.UpdatedAt = timestamp
			if terminalAnalysisFailure(code) {
				record.Analysis.Status = "cleanup_pending"
				record.Analysis.CompletedAt = timestamp
				record.Analysis.OutcomeCode = code
				record.ReviewStatus = "cleanup_pending"
				if commitErr := processor.commitBriefRecord(key, record); commitErr != nil {
					return commitErr
				}
				return processor.cleanupAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
			}
			record.Analysis.Status = "dispatch_unknown"
			record.ReviewStatus = "analysis_pending"
			if commitErr := processor.commitBriefRecord(key, record); commitErr != nil {
				return commitErr
			}
			processor.analysisEvent(cycleID, artifact, record, "dispatch_unknown")
			return nil
		}
		record.Analysis.Status = "dispatch_unknown"
		record.Analysis.LastErrorCode = ""
		record.Analysis.LastObservedAt = timestamp
		record.UpdatedAt = timestamp
		if err := processor.commitBriefRecord(key, record); err != nil {
			return err
		}
		processor.analysisEvent(cycleID, artifact, record, "dispatch_unknown")
		runID, err := processor.Orchestrator.SubmitRun(ctx, plan)
		if err != nil {
			record.Analysis.LastErrorCode = orchestrator.SafeCode(err)
			record.LastErrorCode = record.Analysis.LastErrorCode
			record.UpdatedAt = timestamp
			return processor.commitBriefRecord(key, record)
		}
		record.Analysis.RunID = runID
		record.Analysis.Status = "luna_running"
		record.ReviewStatus = "luna_running"
		record.LastErrorCode = ""
		record.UpdatedAt = timestamp
		if err := processor.commitBriefRecord(key, record); err != nil {
			return err
		}
		processor.analysisEvent(cycleID, artifact, record, "luna_running")
	}
	return processor.reconcileAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
}

func (processor Processor) prepareAnalysisPlan(ctx context.Context, artifact state.Artifact, record state.BriefRecord, now time.Time) (orchestrator.Plan, state.BriefRecord, error) {
	raw, err := processor.transcriptPlaintext(ctx, artifact, &record, now)
	if err != nil {
		markBriefFailure(&record, meetingSafeCode(err), now.UTC().Format(time.RFC3339Nano))
		if commitErr := processor.commitBriefRecord(artifact.InternalReference, record); commitErr != nil {
			return orchestrator.Plan{}, record, commitErr
		}
		return orchestrator.Plan{}, record, errAnalysisDeferred
	}
	screened, scanErr := processor.Scanner.Scan(ctx, raw, artifact.InternalReference, artifact.OrganizerSlot)
	for index := range raw {
		raw[index] = 0
	}
	if scanErr != nil {
		markBriefFailure(&record, securityteam.SafeCode(scanErr), now.UTC().Format(time.RFC3339Nano))
		if commitErr := processor.commitBriefRecord(artifact.InternalReference, record); commitErr != nil {
			return orchestrator.Plan{}, record, commitErr
		}
		return orchestrator.Plan{}, record, errAnalysisDeferred
	}
	attempt := record.RetryCount + 1
	if record.Analysis != nil {
		attempt = record.Analysis.Attempt
	}
	plan, err := orchestrator.Prepare(orchestrator.Request{
		MeetingReference: meetingReference(artifact.InternalReference), SourceDigest: record.Custody.PlaintextSHA256,
		Attempt: attempt, OccurredAt: artifact.ProviderCreatedAt, ScreenedTranscript: screened,
	})
	if err != nil {
		markBriefFailure(&record, orchestrator.SafeCode(err), now.UTC().Format(time.RFC3339Nano))
		if commitErr := processor.commitBriefRecord(artifact.InternalReference, record); commitErr != nil {
			return orchestrator.Plan{}, record, commitErr
		}
		return orchestrator.Plan{}, record, errAnalysisDeferred
	}
	return plan, record, nil
}

func (processor Processor) reconcileAnalysis(ctx context.Context, discovery *state.Document, key string, artifact state.Artifact, record state.BriefRecord, now time.Time, cycleID string) error {
	if record.Analysis == nil {
		return errors.New("meeting_state_invalid")
	}
	timestamp := now.UTC().Format(time.RFC3339Nano)
	inspection, err := processor.Orchestrator.Inspect(ctx, record.Analysis.SessionID, orchestrator.InspectionBinding{
		QA:             analyzer.QABinding{MeetingReference: record.MeetingReference, Attempt: record.Analysis.Attempt, SourceDigest: record.SourceDigest},
		ScreenedDigest: record.Analysis.ScreenedDigest,
	}, processor.protectedMeetingValues(artifact))
	if err != nil {
		code := orchestrator.SafeCode(err)
		if terminalAnalysisFailure(code) {
			record.Analysis.Status = "cleanup_pending"
			record.Analysis.CompletedAt = timestamp
			record.Analysis.LastErrorCode = code
			record.Analysis.OutcomeCode = code
			record.ReviewStatus = "cleanup_pending"
			record.LastErrorCode = code
			record.UpdatedAt = timestamp
			if commitErr := processor.commitBriefRecord(key, record); commitErr != nil {
				return commitErr
			}
			return processor.cleanupAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
		}
		record.Analysis.LastErrorCode = code
		record.Analysis.LastObservedAt = timestamp
		record.LastErrorCode = code
		record.UpdatedAt = timestamp
		expired, deadlineErr := analysisDeadlineReached(*record.Analysis, now)
		if deadlineErr != nil {
			return deadlineErr
		}
		if expired {
			record.Analysis.Status = "cleanup_pending"
			record.Analysis.LastErrorCode = "orchestrator_attempt_unknown"
			record.ReviewStatus = "cleanup_pending"
			record.LastErrorCode = record.Analysis.LastErrorCode
			if commitErr := processor.commitBriefRecord(key, record); commitErr != nil {
				return commitErr
			}
			return processor.cleanupAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
		}
		return processor.commitBriefRecord(key, record)
	}
	record.Analysis.ChildSessionIDs = append([]string(nil), inspection.ChildSessionIDs...)
	record.Analysis.ChildRouteVerified = inspection.ChildRouteVerified
	record.Analysis.ChildDraftDigest = inspection.ChildDraftDigest
	record.Analysis.DelegationCount = inspection.DelegationCount
	record.Analysis.LastObservedAt = timestamp
	record.Analysis.LastErrorCode = ""
	record.LastErrorCode = ""

	if inspection.Status == "pending" {
		expired, deadlineErr := analysisDeadlineReached(*record.Analysis, now)
		if deadlineErr != nil {
			return deadlineErr
		}
		if expired {
			record.Analysis.Status = "cleanup_pending"
			record.Analysis.LastErrorCode = "orchestrator_attempt_unknown"
			record.ReviewStatus = "cleanup_pending"
			record.LastErrorCode = record.Analysis.LastErrorCode
		} else if inspection.DelegationCount == 2 {
			record.Analysis.Status = "qa_remediation"
			record.ReviewStatus = "qa_remediation"
		} else if inspection.DelegationCount == 1 {
			record.Analysis.Status = "sol_qa_pending"
			record.ReviewStatus = "sol_qa_pending"
		}
		record.UpdatedAt = timestamp
		if err := processor.commitBriefRecord(key, record); err != nil {
			return err
		}
		processor.analysisEvent(cycleID, artifact, record, record.Analysis.Status)
		if record.Analysis.Status == "cleanup_pending" {
			return processor.cleanupAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
		}
		return nil
	}

	record.Analysis.CompletedAt = timestamp
	record.Analysis.QAReviewCount = inspection.QA.QAReviews
	record.Analysis.Status = "cleanup_pending"
	record.ReviewStatus = "cleanup_pending"
	if inspection.Status == analyzer.QAPass && inspection.QA.Validated != nil {
		validated := inspection.QA.Validated
		record.Brief = append([]byte(nil), validated.Canonical...)
		record.BriefDigest = validated.Digest
		if route := analyzer.MatchRoute(validated.Brief, processor.Routes); route != nil {
			record.ProjectRoute = &state.ProjectRoute{CanonicalProject: route.CanonicalProject, NoteDirectory: route.NoteDirectory, KanbanBoard: route.KanbanBoard, ConfigDigest: route.ConfigDigest}
		}
	} else {
		record.Analysis.OutcomeCode = inspection.QA.SafeReasonCode
		record.Analysis.LastErrorCode = inspection.QA.SafeReasonCode
		record.LastErrorCode = inspection.QA.SafeReasonCode
	}
	record.UpdatedAt = timestamp
	if err := processor.commitBriefRecord(key, record); err != nil {
		return err
	}
	return processor.cleanupAnalysis(ctx, discovery, key, artifact, record, now, cycleID)
}

func analysisDeadlineReached(attempt state.AnalysisAttempt, now time.Time) (bool, error) {
	started, err := time.Parse(time.RFC3339Nano, attempt.StartedAt)
	if err != nil {
		return false, errors.New("meeting_state_invalid")
	}
	return now.Sub(started) >= analysisAttemptDeadline, nil
}

func (processor Processor) cleanupAnalysis(ctx context.Context, discovery *state.Document, key string, artifact state.Artifact, record state.BriefRecord, now time.Time, cycleID string) error {
	if record.Analysis == nil {
		return errors.New("meeting_state_invalid")
	}
	timestamp := now.UTC().Format(time.RFC3339Nano)
	if err := processor.Orchestrator.Cleanup(ctx, record.Analysis.SessionID, record.Analysis.ChildSessionIDs); err != nil {
		record.Analysis.CleanupRetryCount++
		record.Analysis.Status = "cleanup_retryable"
		record.Analysis.LastErrorCode = orchestrator.SafeCode(err)
		record.ReviewStatus = "cleanup_retryable"
		record.LastErrorCode = record.Analysis.LastErrorCode
		if record.Analysis.CleanupRetryCount >= 8 {
			record.Analysis.Status = "cleanup_blocked"
			record.ReviewStatus = "cleanup_blocked"
		}
		record.UpdatedAt = timestamp
		if err := processor.commitBriefRecord(key, record); err != nil {
			return err
		}
		processor.event(Event{Event: "meeting_session_cleanup", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: record.Analysis.Status, SafeErrorCode: record.LastErrorCode, RetryCount: record.Analysis.CleanupRetryCount, CorrelationReference: record.MeetingReference})
		if record.Analysis.Status == "cleanup_blocked" {
			return errors.New("orchestrator_cleanup_failed")
		}
		return nil
	}
	record.Analysis.Status = "deleted"
	record.Analysis.DeletedAt = timestamp
	record.Analysis.LastErrorCode = ""
	record.LastErrorCode = ""
	record.UpdatedAt = timestamp
	if record.Analysis.CompletedAt == "" {
		record.RetryCount++
		if record.RetryCount >= 8 {
			record.RetryCount = 8
			record.ReviewStatus = "blocked"
			record.LastErrorCode = "orchestrator_attempts_exhausted"
		} else {
			record.Analysis = nil
			record.ReviewStatus = "analysis_pending"
		}
		if err := processor.commitBriefRecord(key, record); err != nil {
			return err
		}
		processor.event(Event{Event: "meeting_session_cleanup", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: "deleted", CorrelationReference: record.MeetingReference})
		return nil
	}
	if record.BriefDigest == "" {
		record.ReviewStatus = "blocked"
		if record.Analysis.OutcomeCode == "" {
			record.Analysis.OutcomeCode = "meeting_qa_blocked"
		}
		record.Analysis.LastErrorCode = record.Analysis.OutcomeCode
		record.LastErrorCode = record.Analysis.OutcomeCode
		artifact.ContentStatus = "blocked"
		artifact.ContentErrorCode = "meeting_qa_blocked"
		artifact.ContentRetryCount = 8
	} else {
		record.ReviewStatus = "email_pending"
		artifact.ContentStatus = "processed"
		artifact.TitusOutput = state.LegacySentinel
		digestValue := sha256.Sum256([]byte(state.LegacySentinel))
		artifact.TitusOutputDigest = hex.EncodeToString(digestValue[:])
		artifact.RawContentDigest = record.SourceDigest
		artifact.SafeContentDigest = record.Analysis.ScreenedDigest
		artifact.ContentProcessedAt = timestamp
		artifact.ContentErrorCode = ""
	}
	artifact.LastContentAttemptAt = timestamp
	if err := processor.commitBriefRecord(key, record); err != nil {
		return err
	}
	discovery.Artifacts[key] = artifact
	if err := processor.Store.Commit(*discovery); err != nil {
		return errors.New(state.ErrorCode(err))
	}
	processor.event(Event{Event: "meeting_session_cleanup", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: "deleted", CorrelationReference: record.MeetingReference})
	processor.event(Event{Event: "meeting_brief_created", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: record.ReviewStatus, SafeErrorCode: record.LastErrorCode, CorrelationReference: record.MeetingReference})
	return nil
}

func (processor Processor) analysisEvent(cycleID string, artifact state.Artifact, record state.BriefRecord, analysisState string) {
	processor.event(Event{Event: "meeting_analysis_state", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: analysisState, SafeErrorCode: record.LastErrorCode, CorrelationReference: record.MeetingReference})
}

func (processor Processor) commitBriefRecord(key string, record state.BriefRecord) error {
	doc := processor.Briefs.Document()
	doc.Records[key] = record
	if err := processor.Briefs.Commit(doc); err != nil {
		return errors.New(state.ErrorCode(err))
	}
	return nil
}

func (processor Processor) protectedMeetingValues(artifact state.Artifact) []string {
	values := []string{processor.Config.TenantID, processor.Config.ClientID, artifact.ProviderMeetingID, artifact.ProviderArtifactID, processor.Config.MeetingGaryEmail, processor.Config.MeetingAustinEmail, processor.Config.MeetingAgentMailInboxID}
	for _, organizer := range processor.Config.Organizers {
		values = append(values, organizer.UserID)
	}
	return values
}

func terminalAnalysisFailure(code string) bool {
	switch code {
	case "qa_output_rejected", "orchestrator_tool_audit_failed", "orchestrator_child_mismatch", "orchestrator_session_conflict", "orchestrator_session_limit":
		return true
	default:
		return false
	}
}
