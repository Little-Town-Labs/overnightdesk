package analyzer

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"regexp"
)

const (
	QASchemaVersion = "meeting-qa/v1"
	QAPass          = "QA_PASS"
	QABlocked       = "QA_BLOCKED"
	MaxQABytes      = 131_072
)

var (
	qaMeetingReferencePattern = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)
	qaDigestPattern           = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

type QABinding struct {
	MeetingReference string
	Attempt          int
	SourceDigest     string
	DelegationCount  int
}

type QAResult struct {
	Status         string
	DraftAttempts  int
	QAReviews      int
	SafeReasonCode string
	Validated      *Validated
}

type qaEnvelope struct {
	SchemaVersion    string          `json:"schemaVersion"`
	Status           string          `json:"status"`
	MeetingReference string          `json:"meetingReference"`
	Attempt          int             `json:"attempt"`
	SourceDigest     string          `json:"sourceDigest"`
	DraftAttempts    int             `json:"draftAttempts"`
	QAReviews        int             `json:"qaReviews"`
	Brief            json.RawMessage `json:"brief,omitempty"`
	SafeReasonCode   string          `json:"safeReasonCode,omitempty"`
}

func ParseQAEnvelope(raw []byte, expected QABinding, protected []string, latestChild *Validated) (QAResult, error) {
	if len(raw) == 0 || len(raw) > MaxQABytes {
		return QAResult{}, safeError{code: "qa_output_rejected"}
	}
	var envelope qaEnvelope
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&envelope); err != nil {
		return QAResult{}, safeError{code: "qa_output_rejected"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return QAResult{}, safeError{code: "qa_output_rejected"}
	}
	if envelope.SchemaVersion != QASchemaVersion || !qaMeetingReferencePattern.MatchString(envelope.MeetingReference) ||
		envelope.MeetingReference != expected.MeetingReference || envelope.Attempt != expected.Attempt || envelope.Attempt < 1 || envelope.Attempt > 8 ||
		!qaDigestPattern.MatchString(envelope.SourceDigest) || envelope.SourceDigest != expected.SourceDigest ||
		expected.DelegationCount < 1 || expected.DelegationCount > 2 || envelope.DraftAttempts != expected.DelegationCount || envelope.QAReviews != expected.DelegationCount {
		return QAResult{}, safeError{code: "qa_output_rejected"}
	}
	result := QAResult{Status: envelope.Status, DraftAttempts: envelope.DraftAttempts, QAReviews: envelope.QAReviews, SafeReasonCode: envelope.SafeReasonCode}
	switch envelope.Status {
	case QAPass:
		if envelope.SafeReasonCode != "" || len(envelope.Brief) == 0 || latestChild == nil {
			return QAResult{}, safeError{code: "qa_output_rejected"}
		}
		validated, err := ParseAndValidate(envelope.Brief, protected)
		if err != nil || validated.Digest != latestChild.Digest {
			return QAResult{}, safeError{code: "qa_output_rejected"}
		}
		result.Validated = &validated
	case QABlocked:
		if len(envelope.Brief) != 0 || !oneOf(envelope.SafeReasonCode,
			"faithfulness_failed", "schema_failed", "unsupported_claims", "ownership_or_date_failed", "project_identification_failed", "remediation_exhausted") {
			return QAResult{}, safeError{code: "qa_output_rejected"}
		}
	default:
		return QAResult{}, safeError{code: "qa_output_rejected"}
	}
	return result, nil
}
