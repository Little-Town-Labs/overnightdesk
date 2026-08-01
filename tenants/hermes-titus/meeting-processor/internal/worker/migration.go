package worker

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

var ErrMigrationBlocked = errors.New("meeting_brief_migration_blocked")

func MigrateLegacyOutputs(discovery *state.Store, briefs *state.BriefStore, handoffPath string, now time.Time) error {
	if discovery == nil || briefs == nil || handoffPath == "" {
		return ErrMigrationBlocked
	}
	discoveryDoc := discovery.Document()
	briefDoc := briefs.Document()
	timestamp := now.UTC().Format(time.RFC3339Nano)
	sentinelDigest := sha256.Sum256([]byte(state.LegacySentinel))
	sentinelHex := hex.EncodeToString(sentinelDigest[:])

	for key, artifact := range discoveryDoc.Artifacts {
		if artifact.ArtifactType != "transcript" || artifact.ContentStatus != "processed" {
			continue
		}
		record, hasRecord := briefDoc.Records[key]
		if artifact.TitusOutput == state.LegacySentinel {
			nativeBrief := hasRecord && record.MigrationStatus == "not_applicable" && record.BriefDigest != ""
			migratedLegacy := hasRecord && record.LegacyAnalysisDigest != ""
			if (!nativeBrief && !migratedLegacy) || artifact.TitusOutputDigest != sentinelHex {
				return ErrMigrationBlocked
			}
			continue
		}
		actual := sha256.Sum256([]byte(artifact.TitusOutput))
		actualHex := hex.EncodeToString(actual[:])
		if artifact.TitusOutput == "" || actualHex != artifact.TitusOutputDigest {
			return ErrMigrationBlocked
		}
		if hasRecord && record.LegacyAnalysisDigest != actualHex {
			return ErrMigrationBlocked
		}
		if !hasRecord {
			briefDoc.Records[key] = state.BriefRecord{
				InternalReference: key, MigrationStatus: "migration_pending",
				LegacyAnalysisDigest: actualHex, CreatedAt: timestamp, UpdatedAt: timestamp,
			}
			if err := briefs.Commit(briefDoc); err != nil {
				return err
			}
		}
		artifact.TitusOutput = state.LegacySentinel
		artifact.TitusOutputDigest = sentinelHex
		discoveryDoc.Artifacts[key] = artifact
		if err := discovery.Commit(discoveryDoc); err != nil {
			return err
		}
	}

	if err := WriteHandoff(handoffPath, discoveryDoc, now); err != nil {
		return err
	}
	briefDoc = briefs.Document()
	changed := false
	for key, record := range briefDoc.Records {
		if record.MigrationStatus == "migration_pending" {
			record.MigrationStatus = "complete"
			record.UpdatedAt = timestamp
			briefDoc.Records[key] = record
			changed = true
		}
	}
	if changed {
		return briefs.Commit(briefDoc)
	}
	return nil
}
