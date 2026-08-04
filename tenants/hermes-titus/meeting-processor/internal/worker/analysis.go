package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/securityteam"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/titus"
)

func (processor Processor) processOneMeetingAnalysis(ctx context.Context, discovery *state.Document, key string, artifact state.Artifact, record state.BriefRecord, now time.Time, cycleID string) error {
	if record.BriefDigest != "" {
		return nil
	}
	timestamp := now.UTC().Format(time.RFC3339Nano)

	// A record left by the retired session workflow is not resumed. The next
	// single-pass attempt starts from the retained custody object.
	if record.Analysis != nil && record.Analysis.Status == "dispatching" {
		return processor.blockOrRetryAnalysis(discovery, key, artifact, record, "titus_response_invalid", timestamp, cycleID, false)
	}
	if record.Analysis != nil && record.Analysis.Status != "analysis_pending" {
		record.Analysis = nil
	}
	record.ReviewStatus = "analysis_pending"
	record.UpdatedAt = timestamp

	raw, err := processor.transcriptPlaintext(ctx, artifact, &record, now)
	if err != nil {
		return processor.blockOrRetryAnalysis(discovery, key, artifact, record, meetingSafeCode(err), timestamp, cycleID, false)
	}
	screened, scanErr := processor.Scanner.Scan(ctx, raw, artifact.InternalReference, artifact.OrganizerSlot)
	for index := range raw {
		raw[index] = 0
	}
	if scanErr != nil {
		return processor.blockOrRetryAnalysis(discovery, key, artifact, record, securityteam.SafeCode(scanErr), timestamp, cycleID, securityteam.SafeCode(scanErr) == "securityteam_unavailable")
	}
	if record.Analysis == nil {
		record.Analysis = &state.AnalysisAttempt{
			Version: 1, Attempt: record.RetryCount + 1, Status: "analysis_pending", ScreenedDigest: digest(screened),
			ChildSessionIDs: []string{}, StartedAt: timestamp, LastObservedAt: timestamp,
		}
	} else {
		record.Analysis.ScreenedDigest = digest(screened)
		record.Analysis.LastObservedAt = timestamp
	}
	record.Analysis.Status = "dispatching"
	record.ReviewStatus = "analysis_pending"
	record.UpdatedAt = timestamp
	if err := processor.commitMeetingRecord(key, record); err != nil {
		return err
	}
	processor.analysisEvent(cycleID, artifact, record, "dispatching")

	protected := processor.protectedMeetingValues(artifact)
	output, analyzeErr := processor.Analyzer.Analyze(ctx, artifact.InternalReference, screened, protected)
	if analyzeErr != nil {
		code := titus.SafeCode(analyzeErr)
		// Analyze has crossed the Titus HTTP dispatch boundary. Transport errors,
		// lost bodies, and malformed responses cannot prove that Titus did not
		// complete the request, so replaying this stored attempt is unsafe.
		return processor.blockOrRetryAnalysis(discovery, key, artifact, record, code, timestamp, cycleID, false)
	}
	// T057 is intentionally a small Markdown MVP. Keep the legacy structured
	// parser as a compatibility path for existing fixtures/state, but accept only
	// the bounded Markdown contract for new Titus meeting-brief output.
	var briefBytes []byte
	var briefDigest string
	if validated, validateErr := analyzer.ParseAndValidate([]byte(output), protected); validateErr == nil {
		briefBytes = validated.Canonical
		briefDigest = validated.Digest
		record.ProjectRoute = nil
		if route := analyzer.MatchRoute(validated.Brief, processor.Routes); route != nil {
			record.ProjectRoute = &state.ProjectRoute{CanonicalProject: route.CanonicalProject, NoteDirectory: route.NoteDirectory, KanbanBoard: route.KanbanBoard, ConfigDigest: route.ConfigDigest}
		}
	} else {
		validatedMarkdown, markdownErr := titus.ValidateMeetingBriefMarkdown(output, protected)
		if markdownErr != nil {
			return processor.blockOrRetryAnalysis(discovery, key, artifact, record, "titus_output_rejected", timestamp, cycleID, false)
		}
		briefBytes = nil
		briefDigest = digest(validatedMarkdown)
		record.ProjectRoute = nil
		record.Brief = nil
		record.BriefMarkdown = validatedMarkdown
	}

	if len(briefBytes) != 0 {
		record.Brief = append([]byte(nil), briefBytes...)
		record.BriefMarkdown = ""
	}
	record.BriefDigest = briefDigest
	record.Analysis.Status = "completed"
	record.Analysis.CompletedAt = timestamp
	record.Analysis.LastObservedAt = timestamp
	record.Analysis.LastErrorCode = ""
	record.ReviewStatus = "email_pending"
	record.LastErrorCode = ""
	artifact.ContentStatus = "processed"
	artifact.ContentErrorCode = ""
	artifact.ContentProcessedAt = timestamp
	artifact.RawContentDigest = record.SourceDigest
	artifact.SafeContentDigest = record.Analysis.ScreenedDigest
	artifact.TitusOutput = state.LegacySentinel
	sentinelDigest := sha256.Sum256([]byte(state.LegacySentinel))
	artifact.TitusOutputDigest = hex.EncodeToString(sentinelDigest[:])
	artifact.LastContentAttemptAt = timestamp
	discovery.Artifacts[key] = artifact
	if err := processor.commitMeetingRecord(key, record); err != nil {
		return err
	}
	if err := processor.Store.Commit(*discovery); err != nil {
		return errors.New(state.ErrorCode(err))
	}
	processor.analysisEvent(cycleID, artifact, record, "completed")
	processor.event(Event{Event: "meeting_brief_created", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: "email_pending", CorrelationReference: record.MeetingReference})
	return nil
}

func (processor Processor) commitMeetingRecord(key string, record state.BriefRecord) error {
	doc := processor.Briefs.Document()
	doc.Records[key] = record
	return processor.Briefs.Commit(doc)
}

func (processor Processor) blockOrRetryAnalysis(discovery *state.Document, key string, artifact state.Artifact, record state.BriefRecord, code, timestamp, cycleID string, retryable bool) error {
	record.RetryCount++
	record.LastErrorCode = code
	record.UpdatedAt = timestamp
	if record.Analysis != nil {
		record.Analysis.LastErrorCode = code
		record.Analysis.LastObservedAt = timestamp
	}
	if !retryable || record.RetryCount >= 8 {
		record.RetryCount = minRetryCount(record.RetryCount)
		record.ReviewStatus = "blocked"
		if record.Analysis != nil {
			record.Analysis.Status = "blocked"
			record.Analysis.CompletedAt = timestamp
			record.Analysis.OutcomeCode = code
		}
		artifact.ContentStatus = "blocked"
		artifact.ContentErrorCode = code
		artifact.ContentRetryCount = record.RetryCount
		artifact.LastContentAttemptAt = timestamp
		discovery.Artifacts[key] = artifact
	}
	doc := processor.Briefs.Document()
	doc.Records[key] = record
	if err := processor.Briefs.Commit(doc); err != nil {
		return err
	}
	if !retryable || record.ReviewStatus == "blocked" {
		if err := processor.Store.Commit(*discovery); err != nil {
			return errors.New(state.ErrorCode(err))
		}
	}
	processor.analysisEvent(cycleID, artifact, record, record.ReviewStatus)
	return nil
}

func minRetryCount(value int) int {
	if value > 8 {
		return 8
	}
	return value
}

func (processor Processor) analysisEvent(cycleID string, artifact state.Artifact, record state.BriefRecord, analysisState string) {
	processor.event(Event{Event: "meeting_analysis_state", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: analysisState, SafeErrorCode: record.LastErrorCode, CorrelationReference: record.MeetingReference})
}

func (processor Processor) protectedMeetingValues(artifact state.Artifact) []string {
	values := []string{processor.Config.TenantID, processor.Config.ClientID, artifact.ProviderMeetingID, artifact.ProviderArtifactID, processor.Config.MeetingGaryEmail, processor.Config.MeetingAustinEmail, processor.Config.MeetingAgentMailInboxID}
	for _, organizer := range processor.Config.Organizers {
		values = append(values, organizer.UserID)
	}
	return values
}
