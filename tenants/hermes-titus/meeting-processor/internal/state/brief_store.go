package state

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"syscall"
	"time"
	"unicode/utf8"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/custody"
)

const (
	BriefStateVersion = 1
	LegacySentinel    = "Legacy Feature 034 analysis retired; Meeting Brief v1 required."
	MaxBriefStateSize = int64(32 << 20)
)

var (
	meetingReferencePattern  = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)
	sessionIdentifierPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,160}$`)
	runIdentifierPattern     = regexp.MustCompile(`^run_[0-9a-f]{32}$`)
	safeCodePattern          = regexp.MustCompile(`^[a-z0-9_]{1,80}$`)
)

type BriefDocument struct {
	Version int                    `json:"version"`
	Records map[string]BriefRecord `json:"records"`
}

type BriefRecord struct {
	InternalReference     string                 `json:"internal_reference"`
	MigrationStatus       string                 `json:"migration_status"`
	LegacyAnalysisDigest  string                 `json:"legacy_analysis_digest,omitempty"`
	MeetingReference      string                 `json:"meeting_reference,omitempty"`
	SourceDigest          string                 `json:"source_digest,omitempty"`
	Brief                 json.RawMessage        `json:"brief,omitempty"`
	BriefMarkdown         string                 `json:"brief_markdown,omitempty"`
	BriefDigest           string                 `json:"brief_digest,omitempty"`
	AnalysisPromptVersion string                 `json:"analysis_prompt_version,omitempty"`
	ReviewStatus          string                 `json:"review_status,omitempty"`
	Analysis              *AnalysisAttempt       `json:"analysis,omitempty"`
	Custody               *custody.Record        `json:"custody,omitempty"`
	ProjectRoute          *ProjectRoute          `json:"project_route,omitempty"`
	Email                 *EmailDelivery         `json:"email,omitempty"`
	Decision              *ReviewDecision        `json:"decision,omitempty"`
	Filing                *FilingResult          `json:"filing,omitempty"`
	Recording             *RecordingVerification `json:"recording,omitempty"`
	CreatedAt             string                 `json:"created_at"`
	UpdatedAt             string                 `json:"updated_at"`
	RetryCount            int                    `json:"retry_count,omitempty"`
	LastErrorCode         string                 `json:"last_error_code,omitempty"`
}

type AnalysisAttempt struct {
	Version            int      `json:"version"`
	Attempt            int      `json:"attempt"`
	SessionID          string   `json:"session_id"`
	RunID              string   `json:"run_id,omitempty"`
	CreateBodyDigest   string   `json:"create_body_digest"`
	RunBodyDigest      string   `json:"run_body_digest"`
	ScreenedDigest     string   `json:"screened_digest"`
	ChildSessionIDs    []string `json:"child_session_ids"`
	ChildRouteVerified bool     `json:"child_route_verified"`
	ChildDraftDigest   string   `json:"child_draft_digest,omitempty"`
	OutcomeCode        string   `json:"outcome_code,omitempty"`
	Status             string   `json:"status"`
	DelegationCount    int      `json:"delegation_count"`
	QAReviewCount      int      `json:"qa_review_count"`
	CleanupRetryCount  int      `json:"cleanup_retry_count"`
	StartedAt          string   `json:"started_at"`
	LastObservedAt     string   `json:"last_observed_at"`
	CompletedAt        string   `json:"completed_at,omitempty"`
	DeletedAt          string   `json:"deleted_at,omitempty"`
	LastErrorCode      string   `json:"last_error_code,omitempty"`
}

type ProjectRoute struct {
	CanonicalProject string `json:"canonical_project"`
	NoteDirectory    string `json:"note_directory"`
	KanbanBoard      string `json:"kanban_board"`
	ConfigDigest     string `json:"config_digest"`
}

type EmailDelivery struct {
	IdempotencyKey          string `json:"idempotency_key"`
	ProviderMessageIDDigest string `json:"provider_message_id_digest"`
	RecipientSet            string `json:"recipient_set"`
	TemplateVersion         string `json:"template_version"`
	SentAt                  string `json:"sent_at"`
	ReadbackVerifiedAt      string `json:"readback_verified_at"`
}

type ReviewDecision struct {
	Decision         string `json:"decision"`
	Actor            string `json:"actor"`
	ActorFingerprint string `json:"actor_fingerprint"`
	MessageDigest    string `json:"message_digest"`
	ReceivedAt       string `json:"received_at"`
	AcceptedAt       string `json:"accepted_at"`
	IdempotencyKey   string `json:"idempotency_key"`
}

type FilingResult struct {
	RequestDigest    string   `json:"request_digest"`
	NoteRelativePath string   `json:"note_relative_path"`
	NoteDigest       string   `json:"note_digest"`
	NoteKey          string   `json:"note_key"`
	Board            string   `json:"board"`
	TriageTaskKey    string   `json:"triage_task_key,omitempty"`
	ActionTaskKeys   []string `json:"action_task_keys"`
	FiledAt          string   `json:"filed_at"`
}

type RecordingVerification struct {
	Version       int    `json:"version"`
	Status        string `json:"status"`
	SHA256        string `json:"sha256,omitempty"`
	Bytes         int64  `json:"bytes,omitempty"`
	ContentType   string `json:"content_type,omitempty"`
	VerifiedAt    string `json:"verified_at,omitempty"`
	RetryCount    int    `json:"retry_count"`
	LastErrorCode string `json:"last_error_code,omitempty"`
}

type BriefStore struct {
	path     string
	lockFile *os.File
	doc      BriefDocument
}

func OpenBrief(path string) (*BriefStore, error) {
	if path == "" {
		return nil, invalidState()
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, safeError{code: "state_unavailable"}
	}
	lock, err := os.OpenFile(path+".lock", os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		return nil, safeError{code: "state_unavailable"}
	}
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		lock.Close()
		return nil, safeError{code: "state_lock_busy"}
	}
	store := &BriefStore{path: path, lockFile: lock}
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		store.doc = BriefDocument{Version: BriefStateVersion, Records: map[string]BriefRecord{}}
		if err := store.persist(store.doc); err != nil {
			store.Close()
			return nil, err
		}
		return store, nil
	}
	if err != nil || !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > MaxBriefStateSize {
		store.Close()
		return nil, invalidState()
	}
	raw, err := os.ReadFile(path)
	if err != nil || decodeBriefDocument(raw, &store.doc) != nil {
		store.Close()
		return nil, invalidState()
	}
	if err := os.Chmod(path, 0o600); err != nil {
		store.Close()
		return nil, safeError{code: "state_unavailable"}
	}
	return store, nil
}

func decodeBriefDocument(raw []byte, target *BriefDocument) error {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return invalidState()
	}
	return validateBriefDocument(*target)
}

func validateBriefDocument(doc BriefDocument) error {
	if doc.Version != BriefStateVersion || doc.Records == nil || len(doc.Records) > MaxStateArtifacts {
		return invalidState()
	}
	for key, record := range doc.Records {
		created, createdErr := time.Parse(time.RFC3339Nano, record.CreatedAt)
		updated, updatedErr := time.Parse(time.RFC3339Nano, record.UpdatedAt)
		if !digestPattern.MatchString(key) || record.InternalReference != key ||
			(record.LegacyAnalysisDigest != "" && !digestPattern.MatchString(record.LegacyAnalysisDigest)) ||
			(record.MigrationStatus != "migration_pending" && record.MigrationStatus != "complete" && record.MigrationStatus != "not_applicable") ||
			createdErr != nil || updatedErr != nil || updated.Before(created) ||
			(record.MeetingReference != "" && !meetingReferencePattern.MatchString(record.MeetingReference)) ||
			(record.SourceDigest != "" && !digestPattern.MatchString(record.SourceDigest)) ||
			(record.BriefDigest != "" && !digestPattern.MatchString(record.BriefDigest)) || (record.AnalysisPromptVersion != "" && !oneOfBrief(record.AnalysisPromptVersion, "meeting-brief-prompt/v1", "meeting-sol-luna/v1")) || record.RetryCount < 0 || record.RetryCount > 8 || !validBriefReviewStatus(record.ReviewStatus) {
			return invalidState()
		}
		if record.MigrationStatus == "migration_pending" && record.LegacyAnalysisDigest == "" {
			return invalidState()
		}
		if record.Custody != nil && custody.ValidateRecord(*record.Custody) != nil {
			return invalidState()
		}
		if record.BriefMarkdown != "" && (len(record.BriefMarkdown) > 65_536 || !utf8.ValidString(record.BriefMarkdown) || strings.ContainsRune(record.BriefMarkdown, 0)) {
			return invalidState()
		}
		if record.ProjectRoute != nil && (!boundedSafe(record.ProjectRoute.CanonicalProject, 80) || !boundedSafe(record.ProjectRoute.NoteDirectory, 160) || !boundedSafe(record.ProjectRoute.KanbanBoard, 80) || !digestPattern.MatchString(record.ProjectRoute.ConfigDigest)) {
			return invalidState()
		}
		if record.Email != nil && (!digestPattern.MatchString(record.Email.IdempotencyKey) || !digestPattern.MatchString(record.Email.ProviderMessageIDDigest) || record.Email.RecipientSet != "gary+austin" || record.Email.TemplateVersion == "" || !validTimestamp(record.Email.SentAt) || !validTimestamp(record.Email.ReadbackVerifiedAt)) {
			return invalidState()
		}
		if record.Decision != nil && (!oneOfBrief(record.Decision.Decision, "approve", "hold") || !oneOfBrief(record.Decision.Actor, "gary", "austin") || !digestPattern.MatchString(record.Decision.ActorFingerprint) || !digestPattern.MatchString(record.Decision.MessageDigest) || !digestPattern.MatchString(record.Decision.IdempotencyKey) || !validTimestamp(record.Decision.ReceivedAt) || !validTimestamp(record.Decision.AcceptedAt)) {
			return invalidState()
		}
		if record.Filing != nil && (!digestPattern.MatchString(record.Filing.RequestDigest) || !boundedSafe(record.Filing.NoteRelativePath, 512) || !digestPattern.MatchString(record.Filing.NoteDigest) || !digestPattern.MatchString(record.Filing.NoteKey) || !boundedSafe(record.Filing.Board, 80) || !validTimestamp(record.Filing.FiledAt)) {
			return invalidState()
		}
		if record.Recording != nil && !validRecording(*record.Recording) {
			return invalidState()
		}
		if record.Analysis != nil && !validAnalysisAttempt(*record.Analysis) {
			return invalidState()
		}
	}
	return nil
}

func validBriefReviewStatus(value string) bool {
	return oneOfBrief(value, "", "draft", "analysis_pending", "luna_running", "sol_qa_pending", "qa_remediation", "cleanup_pending", "cleanup_retryable", "cleanup_blocked", "email_pending", "pending_review", "approved", "held", "filing_retryable", "filed", "blocked")
}

func validAnalysisAttempt(value AnalysisAttempt) bool {
	startedAt, startedErr := time.Parse(time.RFC3339Nano, value.StartedAt)
	lastObservedAt, observedErr := time.Parse(time.RFC3339Nano, value.LastObservedAt)
	if value.Version == 1 && value.SessionID == "" && value.RunID == "" && value.CreateBodyDigest == "" && value.RunBodyDigest == "" &&
		value.ChildDraftDigest == "" && len(value.ChildSessionIDs) == 0 && !value.ChildRouteVerified && value.DelegationCount == 0 && value.QAReviewCount == 0 && value.CleanupRetryCount == 0 {
		return value.Attempt >= 1 && value.Attempt <= 8 && digestPattern.MatchString(value.ScreenedDigest) && startedErr == nil && observedErr == nil &&
			!lastObservedAt.Before(startedAt) && (value.CompletedAt == "" || validTimestamp(value.CompletedAt)) &&
			(value.OutcomeCode == "" || safeCodePattern.MatchString(value.OutcomeCode)) && oneOfBrief(value.Status, "analysis_pending", "dispatching", "completed", "blocked")
	}
	if value.Version != 1 || value.Attempt < 1 || value.Attempt > 8 || !sessionIdentifierPattern.MatchString(value.SessionID) ||
		(value.RunID != "" && !runIdentifierPattern.MatchString(value.RunID)) || !digestPattern.MatchString(value.CreateBodyDigest) ||
		!digestPattern.MatchString(value.RunBodyDigest) || !digestPattern.MatchString(value.ScreenedDigest) ||
		(value.ChildDraftDigest != "" && !digestPattern.MatchString(value.ChildDraftDigest)) || (value.OutcomeCode != "" && !safeCodePattern.MatchString(value.OutcomeCode)) || len(value.ChildSessionIDs) > 2 ||
		value.DelegationCount < 0 || value.DelegationCount > 2 || value.QAReviewCount < 0 || value.QAReviewCount > 2 ||
		value.CleanupRetryCount < 0 || value.CleanupRetryCount > 8 || startedErr != nil || observedErr != nil || lastObservedAt.Before(startedAt) ||
		(value.CompletedAt != "" && !validTimestamp(value.CompletedAt)) || (value.DeletedAt != "" && !validTimestamp(value.DeletedAt)) ||
		!oneOfBrief(value.Status, "dispatch_pending", "dispatch_unknown", "luna_running", "sol_qa_pending", "qa_remediation", "qa_passed", "qa_blocked", "cleanup_pending", "cleanup_retryable", "cleanup_blocked", "deleted", "unknown") {
		return false
	}
	seen := map[string]bool{}
	for _, child := range value.ChildSessionIDs {
		if !sessionIdentifierPattern.MatchString(child) || seen[child] {
			return false
		}
		seen[child] = true
	}
	if value.ChildRouteVerified && len(value.ChildSessionIDs) == 0 {
		return false
	}
	return true
}

func oneOfBrief(value string, candidates ...string) bool {
	for _, candidate := range candidates {
		if value == candidate {
			return true
		}
	}
	return false
}

func boundedSafe(value string, maximum int) bool {
	return value != "" && len(value) <= maximum && !strings.ContainsAny(value, "\r\n\x00")
}

func validRecording(record RecordingVerification) bool {
	if record.Version != 1 || record.RetryCount < 0 || record.RetryCount > 8 || !oneOfBrief(record.Status, "pending", "verified", "retryable", "blocked") {
		return false
	}
	if record.Status == "verified" {
		return digestPattern.MatchString(record.SHA256) && record.Bytes > 0 && record.Bytes <= 2<<30 && record.ContentType == "video/mp4" && validTimestamp(record.VerifiedAt) && record.LastErrorCode == ""
	}
	return record.SHA256 == "" && record.Bytes == 0 && record.ContentType == "" && record.VerifiedAt == ""
}

func (store *BriefStore) Document() BriefDocument {
	clone := BriefDocument{Version: store.doc.Version, Records: make(map[string]BriefRecord, len(store.doc.Records))}
	for key, record := range store.doc.Records {
		record.Brief = append(json.RawMessage(nil), record.Brief...)
		if record.Custody != nil {
			custodyCopy := *record.Custody
			record.Custody = &custodyCopy
		}
		if record.ProjectRoute != nil {
			value := *record.ProjectRoute
			record.ProjectRoute = &value
		}
		if record.Analysis != nil {
			value := *record.Analysis
			value.ChildSessionIDs = append([]string(nil), record.Analysis.ChildSessionIDs...)
			record.Analysis = &value
		}
		if record.Email != nil {
			value := *record.Email
			record.Email = &value
		}
		if record.Decision != nil {
			value := *record.Decision
			record.Decision = &value
		}
		if record.Filing != nil {
			value := *record.Filing
			value.ActionTaskKeys = append([]string(nil), record.Filing.ActionTaskKeys...)
			record.Filing = &value
		}
		if record.Recording != nil {
			value := *record.Recording
			record.Recording = &value
		}
		clone.Records[key] = record
	}
	return clone
}

func (store *BriefStore) Commit(doc BriefDocument) error {
	if err := validateBriefDocument(doc); err != nil {
		return err
	}
	if err := store.persist(doc); err != nil {
		return err
	}
	store.doc = doc
	return nil
}

// ResetBlockedBrief reopens only a terminal Titus-output rejection. It keeps
// custody and meeting identity intact while clearing analysis-attempt state so
// the worker can make one fresh, prompt-versioned attempt.
func (store *BriefStore) ResetBlockedBrief(key string, now time.Time) error {
	if !digestPattern.MatchString(key) || now.IsZero() {
		return safeError{code: "state_reset_invalid"}
	}
	doc := store.Document()
	record, ok := doc.Records[key]
	if !ok || record.ReviewStatus != "blocked" || record.LastErrorCode != "titus_output_rejected" || record.Custody == nil || record.SourceDigest == "" || record.BriefDigest != "" || len(record.Brief) != 0 || record.BriefMarkdown != "" || record.Email != nil || record.Decision != nil || record.Filing != nil || record.ProjectRoute != nil {
		return safeError{code: "state_reset_not_allowed"}
	}
	record.ReviewStatus = ""
	record.Analysis = nil
	record.RetryCount = 0
	record.LastErrorCode = ""
	record.UpdatedAt = now.UTC().Format(time.RFC3339Nano)
	doc.Records[key] = record
	return store.Commit(doc)
}

func (store *BriefStore) persist(doc BriefDocument) error {
	raw, err := json.Marshal(doc)
	if err != nil || int64(len(raw)) > MaxBriefStateSize {
		return invalidState()
	}
	raw = append(raw, '\n')
	temporary, err := os.CreateTemp(filepath.Dir(store.path), filepath.Base(store.path)+".tmp-")
	if err != nil {
		return safeError{code: "state_unavailable"}
	}
	name := temporary.Name()
	defer os.Remove(name)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return safeError{code: "state_unavailable"}
	}
	if _, err := temporary.Write(raw); err != nil || temporary.Sync() != nil || temporary.Close() != nil || os.Rename(name, store.path) != nil {
		return safeError{code: "state_unavailable"}
	}
	dir, err := os.Open(filepath.Dir(store.path))
	if err != nil {
		return safeError{code: "state_unavailable"}
	}
	defer dir.Close()
	if err := dir.Sync(); err != nil {
		return safeError{code: "state_unavailable"}
	}
	return nil
}

func (store *BriefStore) Close() error {
	if store.lockFile == nil {
		return nil
	}
	unlockErr := syscall.Flock(int(store.lockFile.Fd()), syscall.LOCK_UN)
	closeErr := store.lockFile.Close()
	store.lockFile = nil
	return errors.Join(unlockErr, closeErr)
}
