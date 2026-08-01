package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/config"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/securityteam"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/titus"
)

var ErrCycleFailed = errors.New("meeting discovery cycle failed")

type DeltaFetcher interface {
	FetchDelta(context.Context, string, graph.ArtifactType, string) (graph.Round, error)
}

type TranscriptContentFetcher interface {
	FetchTranscriptContent(context.Context, string, string, string) ([]byte, error)
}

type SecurityScanner interface {
	Scan(context.Context, []byte, string, string) (string, error)
}

type TitusAnalyzer interface {
	Analyze(context.Context, string, string, []string) (string, error)
}

type Processor struct {
	Config      config.Config
	Store       *state.Store
	Fetcher     DeltaFetcher
	Content     TranscriptContentFetcher
	Scanner     SecurityScanner
	Analyzer    TitusAnalyzer
	HealthPath  string
	HandoffPath string
	Events      io.Writer
	Now         func() time.Time
}

type CycleResult struct {
	CycleID          string
	NewCount         int
	KnownCount       int
	Streams          int
	ContentAttempted bool
	ContentProcessed bool
}

func (processor Processor) RunOnce(ctx context.Context) (CycleResult, error) {
	nowFunction := processor.Now
	if nowFunction == nil {
		nowFunction = time.Now
	}
	now := nowFunction().UTC()
	cycleID := fmt.Sprintf("cycle-%d", now.UnixNano())
	result := CycleResult{CycleID: cycleID}
	document := processor.Store.Document()
	healthStreams := make([]StreamHealth, 0, 4)
	processor.event(Event{Event: "cycle_start", CycleID: cycleID, State: "starting"})

	for _, organizer := range processor.Config.Organizers {
		for _, artifactType := range []graph.ArtifactType{graph.Transcript, graph.Recording} {
			streamKey := organizer.Slot + ":" + string(artifactType)
			existing := document.Streams[streamKey]
			startURL := existing.DeltaLink
			if startURL == "" {
				var err error
				startURL, err = graph.InitialDeltaURL(organizer.UserID, artifactType, now.Add(-time.Duration(processor.Config.InitialLookbackHours)*time.Hour))
				if err != nil {
					return result, processor.failCycle(cycleID, "state_invalid", nil, processor.Store.Document())
				}
			}
			processor.event(Event{Event: "stream_start", CycleID: cycleID, OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "starting", CursorPresent: existing.DeltaLink != ""})
			round, err := processor.Fetcher.FetchDelta(ctx, organizer.UserID, artifactType, startURL)
			if err != nil || round.DeltaLink == "" {
				code := graph.SafeCode(err)
				if err == nil {
					code = "provider_response_invalid"
				}
				failed := StreamHealth{OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "failed", CursorPresent: existing.DeltaLink != "", LastAttemptAt: now.Format(time.RFC3339Nano), TotalCount: existing.ArtifactCount, RetryCount: graph.RetryCount(err), SafeErrorCode: code}
				if failed.RetryCount > 0 {
					processor.event(Event{Event: "retry", CycleID: cycleID, OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "exhausted", SafeErrorCode: code, HTTPStatusClass: graph.HTTPStatusClass(err), RetryCount: failed.RetryCount, CursorPresent: existing.DeltaLink != ""})
				}
				processor.event(Event{Event: "stream_failed", CycleID: cycleID, OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "failed", SafeErrorCode: code, HTTPStatusClass: graph.HTTPStatusClass(err), RetryCount: failed.RetryCount, CursorPresent: existing.DeltaLink != ""})
				return result, processor.failCycle(cycleID, code, &failed, processor.Store.Document())
			}
			if round.RetryCount > 0 {
				processor.event(Event{Event: "retry", CycleID: cycleID, OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "recovered", HTTPStatusClass: "2xx", RetryCount: round.RetryCount, CursorPresent: existing.DeltaLink != ""})
			}

			fingerprint := digest(organizer.UserID)
			newCount, knownCount := 0, 0
			for _, artifact := range round.Artifacts {
				reference := digest(organizer.UserID + "\x00" + string(artifactType) + "\x00" + artifact.ID)
				if _, exists := document.Artifacts[reference]; exists {
					knownCount++
					continue
				}
				document.Artifacts[reference] = state.Artifact{
					InternalReference: reference, OrganizerFingerprint: fingerprint, OrganizerSlot: organizer.Slot,
					ArtifactType: string(artifactType), ProviderArtifactID: artifact.ID, ProviderMeetingID: artifact.MeetingID,
					ProviderCreatedAt: artifact.CreatedAt, DiscoveredAt: now.Format(time.RFC3339Nano),
					ContentStatus: contentStatusFor(artifactType),
				}
				newCount++
			}
			stream := state.Stream{
				OrganizerFingerprint: fingerprint, OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType),
				DeltaLink: round.DeltaLink, LastAttemptAt: now.Format(time.RFC3339Nano), LastSuccessAt: now.Format(time.RFC3339Nano),
				ArtifactCount: existing.ArtifactCount + newCount,
			}
			document.Streams[streamKey] = stream
			result.NewCount += newCount
			result.KnownCount += knownCount
			result.Streams++
			healthStreams = append(healthStreams, StreamHealth{OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "healthy", CursorPresent: true, LastAttemptAt: stream.LastAttemptAt, LastSuccessAt: stream.LastSuccessAt, NewCount: newCount, KnownCount: knownCount, TotalCount: stream.ArtifactCount, RetryCount: round.RetryCount})
			processor.event(Event{Event: "stream_complete", CycleID: cycleID, OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "healthy", HTTPStatusClass: "2xx", PageCount: round.PageCount, NewCount: newCount, KnownCount: knownCount, TotalCount: stream.ArtifactCount, RetryCount: round.RetryCount, CursorPresent: true})
		}
	}

	if document.Metadata["created_at"] == "" {
		document.Metadata["created_at"] = now.Format(time.RFC3339Nano)
	}
	document.Metadata["updated_at"] = now.Format(time.RFC3339Nano)
	if err := processor.Store.Commit(document); err != nil {
		return result, processor.failCycle(cycleID, state.ErrorCode(err), nil, processor.Store.Document())
	}
	if processor.Config.ContentEnabled {
		if processor.Content == nil || processor.Scanner == nil || processor.Analyzer == nil {
			return result, processor.failCycle(cycleID, "content_config_invalid", nil, document)
		}
		attempted, processed := processor.processOneTranscript(ctx, &document, now, cycleID)
		result.ContentAttempted = attempted
		result.ContentProcessed = processed
		if attempted {
			if err := processor.Store.Commit(document); err != nil {
				return result, processor.failCycle(cycleID, state.ErrorCode(err), nil, processor.Store.Document())
			}
		}
	}
	if err := WriteHandoff(processor.HandoffPath, document, now); err != nil {
		return result, processor.failCycle(cycleID, "handoff_unavailable", nil, document)
	}
	if err := WriteHealth(processor.HealthPath, Health{State: "healthy", Timestamp: now.Format(time.RFC3339Nano), TokenHealth: "healthy", Streams: healthStreams, Content: contentHealth(document, processor.Config.ContentEnabled)}); err != nil {
		return result, fmt.Errorf("%w: health_unavailable", ErrCycleFailed)
	}
	processor.event(Event{Event: "cycle_complete", CycleID: cycleID, State: "healthy", NewCount: result.NewCount, KnownCount: result.KnownCount, TotalCount: len(document.Artifacts)})
	return result, nil
}

func contentStatusFor(kind graph.ArtifactType) string {
	if kind == graph.Transcript {
		return "pending"
	}
	return "not_applicable"
}

func (processor Processor) processOneTranscript(ctx context.Context, document *state.Document, now time.Time, cycleID string) (bool, bool) {
	keys := make([]string, 0, len(document.Artifacts))
	for key, artifact := range document.Artifacts {
		if artifact.ArtifactType == "transcript" && (artifact.ContentStatus == "pending" || artifact.ContentStatus == "retryable_error") {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	if len(keys) == 0 {
		return false, false
	}
	key := keys[0]
	artifact := document.Artifacts[key]
	organizerID := ""
	for _, organizer := range processor.Config.Organizers {
		if organizer.Slot == artifact.OrganizerSlot {
			organizerID = organizer.UserID
		}
	}
	attemptAt := now.Format(time.RFC3339Nano)
	raw, err := processor.Content.FetchTranscriptContent(ctx, organizerID, artifact.ProviderMeetingID, artifact.ProviderArtifactID)
	if err != nil {
		markContentFailure(&artifact, graph.SafeCode(err), attemptAt, retryableContentCode(graph.SafeCode(err)))
		document.Artifacts[key] = artifact
		processor.contentEvent(cycleID, artifact)
		return true, false
	}
	rawDigest := sha256.Sum256(raw)
	safe, err := processor.Scanner.Scan(ctx, raw, artifact.InternalReference, artifact.OrganizerSlot)
	artifact.RawContentDigest = hex.EncodeToString(rawDigest[:])
	if err != nil {
		code := securityteam.SafeCode(err)
		markContentFailure(&artifact, code, attemptAt, code == "securityteam_unavailable")
		document.Artifacts[key] = artifact
		processor.contentEvent(cycleID, artifact)
		return true, false
	}
	safeDigest := sha256.Sum256([]byte(safe))
	artifact.SafeContentDigest = hex.EncodeToString(safeDigest[:])
	protected := []string{processor.Config.TenantID, processor.Config.ClientID, artifact.ProviderMeetingID, artifact.ProviderArtifactID}
	for _, organizer := range processor.Config.Organizers {
		protected = append(protected, organizer.UserID)
	}
	output, err := processor.Analyzer.Analyze(ctx, artifact.InternalReference, safe, protected)
	if err != nil {
		code := titus.SafeCode(err)
		markContentFailure(&artifact, code, attemptAt, code == "titus_unavailable" || code == "titus_response_invalid")
		document.Artifacts[key] = artifact
		processor.contentEvent(cycleID, artifact)
		return true, false
	}
	outputDigest := sha256.Sum256([]byte(output))
	artifact.ContentStatus = "processed"
	artifact.TitusOutput = output
	artifact.TitusOutputDigest = hex.EncodeToString(outputDigest[:])
	artifact.LastContentAttemptAt = attemptAt
	artifact.ContentProcessedAt = attemptAt
	artifact.ContentErrorCode = ""
	document.Artifacts[key] = artifact
	processor.contentEvent(cycleID, artifact)
	return true, true
}

func markContentFailure(artifact *state.Artifact, code, attemptAt string, retryable bool) {
	artifact.ContentRetryCount++
	artifact.LastContentAttemptAt = attemptAt
	artifact.ContentProcessedAt = ""
	artifact.TitusOutput = ""
	artifact.TitusOutputDigest = ""
	artifact.ContentErrorCode = code
	if retryable {
		artifact.ContentStatus = "retryable_error"
	} else {
		artifact.ContentStatus = "blocked"
	}
}

func retryableContentCode(code string) bool {
	return code == "provider_unavailable" || code == "throttled" || code == "token_unavailable"
}

func (processor Processor) contentEvent(cycleID string, artifact state.Artifact) {
	eventName := "content_" + artifact.ContentStatus
	processor.event(Event{Event: eventName, CycleID: cycleID, OrganizerSlot: artifact.OrganizerSlot, ArtifactType: "transcript", State: artifact.ContentStatus, SafeErrorCode: artifact.ContentErrorCode, RetryCount: artifact.ContentRetryCount})
}

func (processor Processor) failCycle(cycleID, code string, failed *StreamHealth, document state.Document) error {
	now := processor.Now
	if now == nil {
		now = time.Now
	}
	_ = WriteHealth(processor.HealthPath, Health{State: "degraded", Timestamp: now().UTC().Format(time.RFC3339Nano), TokenHealth: tokenHealthFor(code), Streams: processor.degradedStreams(document, code, failed), Content: contentHealth(document, processor.Config.ContentEnabled)})
	retries := 0
	if failed != nil {
		retries = failed.RetryCount
	}
	processor.event(Event{Event: "cycle_failed", CycleID: cycleID, State: "degraded", SafeErrorCode: code, RetryCount: retries, TotalCount: len(document.Artifacts)})
	return fmt.Errorf("%w: %s", ErrCycleFailed, code)
}

func (processor Processor) degradedStreams(document state.Document, code string, failed *StreamHealth) []StreamHealth {
	streams := make([]StreamHealth, 0, 4)
	for _, organizer := range processor.Config.Organizers {
		for _, artifactType := range []graph.ArtifactType{graph.Transcript, graph.Recording} {
			persisted := document.Streams[organizer.Slot+":"+string(artifactType)]
			summary := StreamHealth{
				OrganizerSlot: organizer.Slot, ArtifactType: string(artifactType), State: "degraded",
				CursorPresent: persisted.DeltaLink != "", LastAttemptAt: persisted.LastAttemptAt,
				LastSuccessAt: persisted.LastSuccessAt, TotalCount: persisted.ArtifactCount,
			}
			if failed == nil {
				summary.SafeErrorCode = code
			} else if failed.OrganizerSlot == organizer.Slot && failed.ArtifactType == string(artifactType) {
				summary.LastAttemptAt = failed.LastAttemptAt
				summary.RetryCount = failed.RetryCount
				summary.SafeErrorCode = failed.SafeErrorCode
			}
			streams = append(streams, summary)
		}
	}
	return streams
}

func (processor Processor) event(event Event) {
	if processor.Events != nil {
		_ = WriteEvent(processor.Events, event)
	}
}

func digest(value string) string {
	hash := sha256.Sum256([]byte(value))
	return hex.EncodeToString(hash[:])
}

func tokenHealthFor(code string) string {
	if code == "token_unavailable" || code == "token_rejected" {
		return "failed"
	}
	return "healthy"
}
