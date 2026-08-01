package worker

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/config"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

var ErrCycleFailed = errors.New("meeting discovery cycle failed")

type DeltaFetcher interface {
	FetchDelta(context.Context, string, graph.ArtifactType, string) (graph.Round, error)
}

type Processor struct {
	Config      config.Config
	Store       *state.Store
	Fetcher     DeltaFetcher
	HealthPath  string
	HandoffPath string
	Events      io.Writer
	Now         func() time.Time
}

type CycleResult struct {
	CycleID    string
	NewCount   int
	KnownCount int
	Streams    int
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
	if err := WriteHandoff(processor.HandoffPath, document, now); err != nil {
		return result, processor.failCycle(cycleID, "handoff_unavailable", nil, document)
	}
	if err := WriteHealth(processor.HealthPath, Health{State: "healthy", Timestamp: now.Format(time.RFC3339Nano), TokenHealth: "healthy", Streams: healthStreams}); err != nil {
		return result, fmt.Errorf("%w: health_unavailable", ErrCycleFailed)
	}
	processor.event(Event{Event: "cycle_complete", CycleID: cycleID, State: "healthy", NewCount: result.NewCount, KnownCount: result.KnownCount, TotalCount: len(document.Artifacts)})
	return result, nil
}

func (processor Processor) failCycle(cycleID, code string, failed *StreamHealth, document state.Document) error {
	now := processor.Now
	if now == nil {
		now = time.Now
	}
	_ = WriteHealth(processor.HealthPath, Health{State: "degraded", Timestamp: now().UTC().Format(time.RFC3339Nano), TokenHealth: tokenHealthFor(code), Streams: processor.degradedStreams(document, code, failed)})
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
