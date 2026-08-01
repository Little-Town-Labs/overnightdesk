package worker

import (
	"encoding/json"
	"sort"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

type handoffDocument struct {
	Version     int                `json:"version"`
	GeneratedAt string             `json:"generated_at"`
	Discoveries []handoffDiscovery `json:"discoveries"`
}

type handoffDiscovery struct {
	InternalReference  string `json:"internal_reference"`
	OrganizerSlot      string `json:"organizer_slot"`
	ArtifactType       string `json:"artifact_type"`
	ProviderCreatedAt  string `json:"provider_created_at,omitempty"`
	DiscoveredAt       string `json:"discovered_at"`
	ContentProcessedAt string `json:"content_processed_at,omitempty"`
	TitusOutputDigest  string `json:"titus_output_digest,omitempty"`
}

func WriteHandoff(path string, document state.Document, now time.Time) error {
	handoff := handoffDocument{Version: 2, GeneratedAt: now.UTC().Format(time.RFC3339Nano), Discoveries: make([]handoffDiscovery, 0, len(document.Artifacts))}
	keys := make([]string, 0, len(document.Artifacts))
	for key := range document.Artifacts {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		artifact := document.Artifacts[key]
		handoff.Discoveries = append(handoff.Discoveries, handoffDiscovery{
			InternalReference: artifact.InternalReference, OrganizerSlot: artifact.OrganizerSlot,
			ArtifactType: artifact.ArtifactType, ProviderCreatedAt: artifact.ProviderCreatedAt, DiscoveredAt: artifact.DiscoveredAt,
			ContentProcessedAt: artifact.ContentProcessedAt, TitusOutputDigest: artifact.TitusOutputDigest,
		})
	}
	raw, err := json.Marshal(handoff)
	if err != nil {
		return err
	}
	return atomicWrite(path, raw)
}
