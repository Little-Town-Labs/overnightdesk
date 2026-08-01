package state

type Stream struct {
	OrganizerFingerprint string `json:"organizer_fingerprint"`
	OrganizerSlot        string `json:"organizer_slot"`
	ArtifactType         string `json:"artifact_type"`
	DeltaLink            string `json:"delta_link,omitempty"`
	LastAttemptAt        string `json:"last_attempt_at,omitempty"`
	LastSuccessAt        string `json:"last_success_at,omitempty"`
	LastErrorCode        string `json:"last_error_code,omitempty"`
	ArtifactCount        int    `json:"artifact_count"`
}

type Artifact struct {
	InternalReference    string `json:"internal_reference"`
	OrganizerFingerprint string `json:"organizer_fingerprint"`
	OrganizerSlot        string `json:"organizer_slot"`
	ArtifactType         string `json:"artifact_type"`
	ProviderArtifactID   string `json:"provider_artifact_id"`
	ProviderMeetingID    string `json:"provider_meeting_id"`
	ProviderCreatedAt    string `json:"provider_created_at,omitempty"`
	DiscoveredAt         string `json:"discovered_at"`
	ContentStatus        string `json:"content_status"`
	RawContentDigest     string `json:"raw_content_digest,omitempty"`
	SafeContentDigest    string `json:"safe_content_digest,omitempty"`
	TitusOutputDigest    string `json:"titus_output_digest,omitempty"`
	TitusOutput          string `json:"titus_output,omitempty"`
	LastContentAttemptAt string `json:"last_content_attempt_at,omitempty"`
	ContentProcessedAt   string `json:"content_processed_at,omitempty"`
	ContentRetryCount    int    `json:"content_retry_count"`
	ContentErrorCode     string `json:"content_error_code,omitempty"`
}
