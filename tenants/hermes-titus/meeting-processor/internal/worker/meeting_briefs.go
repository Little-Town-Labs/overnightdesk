package worker

import (
	"context"
	"crypto/sha256"
	"encoding/base32"
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/custody"
	meetingemail "github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/email"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/filer"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

func (processor Processor) processMeetingBriefs(ctx context.Context, discovery *state.Document, now time.Time, cycleID string) error {
	if processor.LifecycleMu != nil {
		processor.LifecycleMu.Lock()
		defer processor.LifecycleMu.Unlock()
	}
	if processor.Briefs == nil || processor.Content == nil || processor.Scanner == nil || processor.Orchestrator == nil || processor.Mailer == nil || processor.Recorder == nil {
		return errors.New("meeting_config_invalid")
	}
	if err := MigrateLegacyOutputs(processor.Store, processor.Briefs, processor.HandoffPath, now); err != nil {
		return errors.New("meeting_migration_blocked")
	}
	*discovery = processor.Store.Document()
	if err := processor.sweepCustody(now); err != nil {
		return err
	}
	if meetingCleanupBlocked(processor.Briefs.Document()) {
		return errors.New("orchestrator_cleanup_failed")
	}
	if err := processor.processOneMeetingTranscript(ctx, discovery, now, cycleID); err != nil {
		return err
	}
	if err := processor.processOneRecording(ctx, *discovery, now, cycleID); err != nil {
		return err
	}
	if processor.Config.MeetingFilingEnabled {
		if processor.Filer == nil {
			return errors.New("filer_config_invalid")
		}
		if err := processor.fileOneApproved(ctx, now, cycleID); err != nil {
			return err
		}
	}
	return nil
}

func meetingCleanupBlocked(document state.BriefDocument) bool {
	for _, record := range document.Records {
		if record.ReviewStatus == "cleanup_blocked" || (record.Analysis != nil && record.Analysis.Status == "cleanup_blocked") {
			return true
		}
	}
	return false
}

func (processor Processor) sweepCustody(now time.Time) error {
	doc := processor.Briefs.Document()
	keys := sortedBriefKeys(doc)
	records := make([]custody.Record, 0, len(keys))
	recordKeys := make([]string, 0, len(keys))
	for _, key := range keys {
		if doc.Records[key].Custody != nil {
			records = append(records, *doc.Records[key].Custody)
			recordKeys = append(recordKeys, key)
		}
	}
	result := processor.Custody.Sweep(records)
	changed := false
	for index, key := range recordKeys {
		if result.Records[index] != records[index] {
			record := doc.Records[key]
			value := result.Records[index]
			record.Custody = &value
			record.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
			doc.Records[key] = record
			changed = true
		}
	}
	if changed {
		if err := processor.Briefs.Commit(doc); err != nil {
			return errors.New(state.ErrorCode(err))
		}
	}
	if result.Blocked {
		if result.Code == "" {
			result.Code = "custody_unavailable"
		}
		return errors.New(result.Code)
	}
	return nil
}

func (processor Processor) processOneMeetingTranscript(ctx context.Context, discovery *state.Document, now time.Time, cycleID string) error {
	briefs := processor.Briefs.Document()
	keys := make([]string, 0, len(discovery.Artifacts))
	for key, artifact := range discovery.Artifacts {
		if artifact.ArtifactType != "transcript" {
			continue
		}
		record, exists := briefs.Records[key]
		if record.ReviewStatus != "blocked" && record.ReviewStatus != "cleanup_blocked" &&
			(!exists || record.BriefDigest == "" || record.ReviewStatus == "email_pending" || record.ReviewStatus == "cleanup_pending" || record.ReviewStatus == "cleanup_retryable") {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		return nil
	}
	key := keys[0]
	artifact := discovery.Artifacts[key]
	record, exists := briefs.Records[key]
	timestamp := now.UTC().Format(time.RFC3339Nano)
	if !exists {
		record = state.BriefRecord{InternalReference: key, MigrationStatus: "not_applicable", CreatedAt: timestamp, UpdatedAt: timestamp}
	}
	if record.Analysis != nil && (record.Analysis.Status == "cleanup_pending" || record.Analysis.Status == "cleanup_retryable") {
		if err := processor.advanceMeetingAnalysis(ctx, discovery, key, artifact, record, now, cycleID); err != nil {
			return err
		}
		briefs = processor.Briefs.Document()
		record = briefs.Records[key]
	}
	if record.BriefDigest == "" {
		if err := processor.advanceMeetingAnalysis(ctx, discovery, key, artifact, record, now, cycleID); err != nil {
			return err
		}
		briefs = processor.Briefs.Document()
		record = briefs.Records[key]
		if record.BriefDigest == "" {
			return nil
		}
	}
	if record.ReviewStatus == "email_pending" {
		var brief analyzer.Brief
		if json.Unmarshal(record.Brief, &brief) != nil {
			return errors.New("meeting_state_invalid")
		}
		delivery, err := processor.Mailer.Send(ctx, record.MeetingReference, record.BriefDigest, analyzer.RenderMarkdown(record.MeetingReference, brief))
		if err != nil {
			markBriefFailure(&record, meetingemail.SafeCode(err), timestamp)
			record.ReviewStatus = "email_pending"
			briefs.Records[key] = record
			return processor.Briefs.Commit(briefs)
		}
		record.Email = &state.EmailDelivery{IdempotencyKey: delivery.IdempotencyKey, ProviderMessageIDDigest: delivery.ProviderMessageIDDigest, RecipientSet: delivery.RecipientSet, TemplateVersion: delivery.TemplateVersion, SentAt: delivery.SentAt, ReadbackVerifiedAt: delivery.ReadbackVerifiedAt}
		record.ReviewStatus = "pending_review"
		record.LastErrorCode = ""
		record.UpdatedAt = timestamp
		briefs.Records[key] = record
		if err := processor.Briefs.Commit(briefs); err != nil {
			return errors.New(state.ErrorCode(err))
		}
		processor.event(Event{Event: "meeting_email_sent", CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: "pending_review", CorrelationReference: record.MeetingReference})
	}
	return nil
}

func (processor Processor) transcriptPlaintext(ctx context.Context, artifact state.Artifact, record *state.BriefRecord, now time.Time) ([]byte, error) {
	if record.Custody != nil {
		return processor.Custody.Decrypt(artifact.InternalReference, *record.Custody)
	}
	organizerID := processor.organizerID(artifact.OrganizerSlot)
	raw, err := processor.Content.FetchTranscriptContent(ctx, organizerID, artifact.ProviderMeetingID, artifact.ProviderArtifactID)
	if err != nil {
		return nil, err
	}
	custodyRecord, err := processor.Custody.Encrypt(artifact.InternalReference, raw)
	if err != nil {
		for index := range raw {
			raw[index] = 0
		}
		return nil, err
	}
	record.Custody = &custodyRecord
	record.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
	doc := processor.Briefs.Document()
	doc.Records[artifact.InternalReference] = *record
	if err := processor.Briefs.Commit(doc); err != nil {
		_ = processor.Custody.Discard(custodyRecord)
		for index := range raw {
			raw[index] = 0
		}
		return nil, err
	}
	return raw, nil
}

func (processor Processor) processOneRecording(ctx context.Context, discovery state.Document, now time.Time, cycleID string) error {
	briefs := processor.Briefs.Document()
	keys := make([]string, 0)
	transcriptsByMeeting := make(map[string][]string)
	for key, artifact := range discovery.Artifacts {
		if artifact.ArtifactType == "recording" {
			keys = append(keys, key)
		} else if artifact.ArtifactType == "transcript" {
			indexKey := artifact.OrganizerSlot + "\x00" + artifact.ProviderMeetingID
			transcriptsByMeeting[indexKey] = append(transcriptsByMeeting[indexKey], key)
		}
	}
	sort.Strings(keys)
	for _, recordingKey := range keys {
		recordingArtifact := discovery.Artifacts[recordingKey]
		indexKey := recordingArtifact.OrganizerSlot + "\x00" + recordingArtifact.ProviderMeetingID
		candidates := transcriptsByMeeting[indexKey]
		sort.Strings(candidates)
		if len(candidates) > 1 {
			for _, transcriptKey := range candidates {
				record, ok := briefs.Records[transcriptKey]
				if !ok || record.ReviewStatus == "blocked" {
					continue
				}
				record.Recording = &state.RecordingVerification{Version: 1, Status: "blocked", RetryCount: 8, LastErrorCode: "recording_correlation_ambiguous"}
				record.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
				briefs.Records[transcriptKey] = record
				processor.event(Event{Event: "meeting_recording_verified", CycleID: cycleID, OrganizerSlot: recordingArtifact.OrganizerSlot, ArtifactType: "recording", State: "blocked", SafeErrorCode: "recording_correlation_ambiguous", RetryCount: 8, CorrelationReference: record.MeetingReference})
			}
			return processor.Briefs.Commit(briefs)
		}
		for _, transcriptKey := range candidates {
			record, ok := briefs.Records[transcriptKey]
			if !ok || record.ReviewStatus == "blocked" || (record.Recording != nil && (record.Recording.Status == "verified" || record.Recording.Status == "blocked")) {
				continue
			}
			verification, err := processor.Recorder.VerifyRecordingContent(ctx, processor.organizerID(recordingArtifact.OrganizerSlot), recordingArtifact.ProviderMeetingID, recordingArtifact.ProviderArtifactID, processor.Config.MeetingRecordingMaxBytes)
			if err != nil {
				current := state.RecordingVerification{Version: 1, Status: "retryable", RetryCount: 1, LastErrorCode: graph.SafeCode(err)}
				if record.Recording != nil {
					current.RetryCount = record.Recording.RetryCount + 1
				}
				if current.RetryCount > 8 {
					current.RetryCount, current.Status = 8, "blocked"
				}
				record.Recording = &current
			} else {
				record.Recording = &state.RecordingVerification{Version: 1, Status: "verified", SHA256: verification.SHA256, Bytes: verification.Bytes, ContentType: verification.ContentType, VerifiedAt: now.UTC().Format(time.RFC3339Nano)}
			}
			record.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
			briefs.Records[transcriptKey] = record
			if err := processor.Briefs.Commit(briefs); err != nil {
				return errors.New(state.ErrorCode(err))
			}
			processor.event(Event{Event: "meeting_recording_verified", CycleID: cycleID, OrganizerSlot: recordingArtifact.OrganizerSlot, ArtifactType: "recording", State: record.Recording.Status, SafeErrorCode: record.Recording.LastErrorCode, RetryCount: record.Recording.RetryCount, CorrelationReference: record.MeetingReference})
			return nil
		}
	}
	return nil
}

func (processor Processor) fileOneApproved(ctx context.Context, now time.Time, cycleID string) error {
	doc := processor.Briefs.Document()
	for _, key := range sortedBriefKeys(doc) {
		record := doc.Records[key]
		if record.ReviewStatus != "approved" && record.ReviewStatus != "filing_retryable" {
			continue
		}
		if record.Filing != nil {
			continue
		}
		var brief analyzer.Brief
		if json.Unmarshal(record.Brief, &brief) != nil || record.Decision == nil {
			return errors.New("meeting_state_invalid")
		}
		var route *filer.ProjectRoute
		if record.ProjectRoute != nil {
			route = &filer.ProjectRoute{CanonicalProject: record.ProjectRoute.CanonicalProject, NoteDirectory: record.ProjectRoute.NoteDirectory, KanbanBoard: record.ProjectRoute.KanbanBoard, ConfigDigest: record.ProjectRoute.ConfigDigest}
		}
		result, err := processor.Filer.File(ctx, filer.Request{SchemaVersion: "meeting-filing/v1", Reference: record.MeetingReference, ApprovedBy: record.Decision.Actor, ApprovedAt: record.Decision.AcceptedAt, BriefDigest: record.BriefDigest, Brief: brief, ProjectRoute: route})
		if err != nil {
			record.ReviewStatus = "filing_retryable"
			markBriefFailure(&record, "filer_unavailable", now.UTC().Format(time.RFC3339Nano))
			doc.Records[key] = record
			return processor.Briefs.Commit(doc)
		}
		triage := ""
		if result.TriageTaskKey != nil {
			triage = *result.TriageTaskKey
		}
		record.Filing = &state.FilingResult{RequestDigest: result.RequestDigest, NoteRelativePath: result.NoteRelativePath, NoteDigest: result.NoteDigest, NoteKey: result.NoteKey, Board: result.Board, TriageTaskKey: triage, ActionTaskKeys: append([]string(nil), result.ActionTaskKeys...), FiledAt: result.FiledAt}
		record.ReviewStatus = "filed"
		record.LastErrorCode = ""
		record.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
		doc.Records[key] = record
		if err := processor.Briefs.Commit(doc); err != nil {
			return errors.New(state.ErrorCode(err))
		}
		processor.event(Event{Event: "meeting_filed", CycleID: cycleID, State: "filed", CorrelationReference: record.MeetingReference})
		return nil
	}
	return nil
}

func (processor Processor) organizerID(slot string) string {
	for _, organizer := range processor.Config.Organizers {
		if organizer.Slot == slot {
			return organizer.UserID
		}
	}
	return ""
}

func meetingReference(internal string) string {
	digest := sha256.Sum256([]byte("meeting-brief-reference/v1\x00" + internal))
	return "MB-" + strings.TrimRight(base32.StdEncoding.EncodeToString(digest[:]), "=")[:12]
}

func markBriefFailure(record *state.BriefRecord, code, timestamp string) {
	record.RetryCount++
	if record.RetryCount > 8 {
		record.RetryCount = 8
		record.ReviewStatus = "blocked"
	}
	record.LastErrorCode = code
	record.UpdatedAt = timestamp
}

func meetingSafeCode(err error) string {
	code := custody.ErrorCode(err)
	if code != "custody_unavailable" {
		return code
	}
	return graph.SafeCode(err)
}

func sortedBriefKeys(doc state.BriefDocument) []string {
	keys := make([]string, 0, len(doc.Records))
	for key := range doc.Records {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}
