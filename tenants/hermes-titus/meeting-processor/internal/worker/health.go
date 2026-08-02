package worker

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
)

type Event struct {
	Event                string `json:"event"`
	CycleID              string `json:"cycle_id"`
	OrganizerSlot        string `json:"organizer_slot,omitempty"`
	ArtifactType         string `json:"artifact_type,omitempty"`
	State                string `json:"state,omitempty"`
	SafeErrorCode        string `json:"safe_error_code,omitempty"`
	HTTPStatusClass      string `json:"http_status_class,omitempty"`
	PageCount            int    `json:"page_count,omitempty"`
	NewCount             int    `json:"new_count,omitempty"`
	KnownCount           int    `json:"known_count,omitempty"`
	TotalCount           int    `json:"total_count,omitempty"`
	RetryCount           int    `json:"retry_count,omitempty"`
	DurationMS           int64  `json:"duration_ms,omitempty"`
	CursorPresent        bool   `json:"cursor_present,omitempty"`
	CorrelationReference string `json:"correlation_reference,omitempty"`
}

type StreamHealth struct {
	OrganizerSlot string `json:"organizer_slot"`
	ArtifactType  string `json:"artifact_type"`
	State         string `json:"state"`
	CursorPresent bool   `json:"cursor_present"`
	LastAttemptAt string `json:"last_attempt_at,omitempty"`
	LastSuccessAt string `json:"last_success_at,omitempty"`
	NewCount      int    `json:"new_count"`
	KnownCount    int    `json:"known_count"`
	TotalCount    int    `json:"total_count"`
	RetryCount    int    `json:"retry_count"`
	SafeErrorCode string `json:"safe_error_code,omitempty"`
}

type Health struct {
	State          string         `json:"state"`
	Timestamp      string         `json:"timestamp"`
	TimestampEpoch int64          `json:"timestamp_epoch"`
	TokenHealth    string         `json:"token_health"`
	Streams        []StreamHealth `json:"streams"`
	Content        ContentHealth  `json:"content"`
	Meeting        MeetingHealth  `json:"meeting"`
}

type MeetingHealth struct {
	Enabled            bool `json:"enabled"`
	CustodyRetained    int  `json:"custody_retained"`
	CustodyDeleted     int  `json:"custody_deleted"`
	CustodyBlocked     int  `json:"custody_blocked"`
	CustodyOverdue     int  `json:"custody_overdue"`
	CustodyMissingKey  int  `json:"custody_missing_key"`
	AnalysisPending    int  `json:"analysis_pending"`
	LunaRunning        int  `json:"luna_running"`
	SolQAPending       int  `json:"sol_qa_pending"`
	CleanupRetryable   int  `json:"cleanup_retryable"`
	CleanupBlocked     int  `json:"cleanup_blocked"`
	PendingReview      int  `json:"pending_review"`
	Approved           int  `json:"approved"`
	Held               int  `json:"held"`
	Filed              int  `json:"filed"`
	Blocked            int  `json:"blocked"`
	RecordingsVerified int  `json:"recordings_verified"`
}

type ContentHealth struct {
	Enabled        bool `json:"enabled"`
	Pending        int  `json:"pending"`
	Processed      int  `json:"processed"`
	Blocked        int  `json:"blocked"`
	RetryableError int  `json:"retryable_error"`
}

var cyclePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

var allowedEvents = map[string]bool{
	"cycle_start": true, "cycle_complete": true, "cycle_failed": true,
	"stream_start": true, "stream_complete": true, "stream_failed": true, "retry": true,
	"content_processed": true, "content_blocked": true, "content_retryable_error": true,
	"meeting_analysis_state": true, "meeting_session_cleanup": true,
	"meeting_brief_created": true, "meeting_email_sent": true,
	"meeting_recording_verified": true, "meeting_filed": true,
}

func contentHealth(document state.Document, enabled bool) ContentHealth {
	health := ContentHealth{Enabled: enabled}
	for _, artifact := range document.Artifacts {
		if artifact.ArtifactType != "transcript" {
			continue
		}
		switch artifact.ContentStatus {
		case "pending":
			health.Pending++
		case "processed":
			health.Processed++
		case "blocked":
			health.Blocked++
		case "retryable_error":
			health.RetryableError++
		}
	}
	return health
}

func meetingHealth(document state.BriefDocument, enabled bool) MeetingHealth {
	health := MeetingHealth{Enabled: enabled}
	if !enabled {
		return health
	}
	for _, record := range document.Records {
		if record.Custody != nil {
			switch record.Custody.Status {
			case "retained":
				health.CustodyRetained++
			case "deleted":
				health.CustodyDeleted++
			case "blocked", "delete_retryable":
				health.CustodyBlocked++
			}
			if record.Custody.Status == "delete_retryable" || record.Custody.LastErrorCode == "custody_delete_failed" {
				health.CustodyOverdue++
			}
			if record.Custody.LastErrorCode == "custody_key_missing" {
				health.CustodyMissingKey++
			}
		}
		switch record.ReviewStatus {
		case "analysis_pending":
			health.AnalysisPending++
		case "luna_running":
			health.LunaRunning++
		case "sol_qa_pending", "qa_remediation":
			health.SolQAPending++
		case "cleanup_retryable":
			health.CleanupRetryable++
		case "cleanup_blocked":
			health.CleanupBlocked++
		case "pending_review", "email_pending":
			health.PendingReview++
		case "approved", "filing_retryable":
			health.Approved++
		case "held":
			health.Held++
		case "filed":
			health.Filed++
		case "blocked":
			health.Blocked++
		}
		if record.Recording != nil && record.Recording.Status == "verified" {
			health.RecordingsVerified++
		}
	}
	return health
}

func WriteEvent(output io.Writer, event Event) error {
	if !allowedEvents[event.Event] || !cyclePattern.MatchString(event.CycleID) || (event.CorrelationReference != "" && !regexp.MustCompile(`^MB-[A-Z2-7]{12}$`).MatchString(event.CorrelationReference)) {
		return errors.New("structured event invalid")
	}
	encoder := json.NewEncoder(output)
	encoder.SetEscapeHTML(true)
	return encoder.Encode(event)
}

func WriteHealth(path string, health Health) error {
	if !validHealthState(health.State) || !validTokenHealth(health.TokenHealth) {
		return errors.New("health record invalid")
	}
	timestamp, err := time.Parse(time.RFC3339Nano, health.Timestamp)
	if err != nil {
		return errors.New("health record invalid")
	}
	health.TimestampEpoch = timestamp.Unix()
	for _, stream := range health.Streams {
		if !validSlot(stream.OrganizerSlot) || !validArtifactType(stream.ArtifactType) || !validStreamState(stream.State) {
			return errors.New("health stream invalid")
		}
	}
	if health.Content.Pending < 0 || health.Content.Processed < 0 || health.Content.Blocked < 0 || health.Content.RetryableError < 0 {
		return errors.New("health content invalid")
	}
	if health.Meeting.CustodyRetained < 0 || health.Meeting.CustodyDeleted < 0 || health.Meeting.CustodyBlocked < 0 || health.Meeting.CustodyOverdue < 0 || health.Meeting.CustodyMissingKey < 0 || health.Meeting.AnalysisPending < 0 || health.Meeting.LunaRunning < 0 || health.Meeting.SolQAPending < 0 || health.Meeting.CleanupRetryable < 0 || health.Meeting.CleanupBlocked < 0 || health.Meeting.PendingReview < 0 || health.Meeting.Approved < 0 || health.Meeting.Held < 0 || health.Meeting.Filed < 0 || health.Meeting.Blocked < 0 || health.Meeting.RecordingsVerified < 0 {
		return errors.New("health meeting invalid")
	}
	if health.State == "healthy" && (health.Meeting.CustodyOverdue > 0 || health.Meeting.CustodyMissingKey > 0 || health.Meeting.CleanupBlocked > 0) {
		return errors.New("health meeting failed closed")
	}
	raw, err := json.Marshal(health)
	if err != nil {
		return errors.New("health record invalid")
	}
	return atomicWrite(path, raw)
}

func ReadContentHealth(path string) (ContentHealth, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return ContentHealth{}, errors.New("health unavailable")
	}
	var health Health
	if json.Unmarshal(raw, &health) != nil || health.Content.Pending < 0 || health.Content.Processed < 0 || health.Content.Blocked < 0 || health.Content.RetryableError < 0 {
		return ContentHealth{}, errors.New("health invalid")
	}
	return health.Content, nil
}

func HealthStatus(path string, now time.Time, maximumAge time.Duration) string {
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return "missing"
	}
	if err != nil {
		return "invalid"
	}
	var health Health
	if json.Unmarshal(raw, &health) != nil || !validHealthState(health.State) || health.TimestampEpoch <= 0 {
		return "invalid"
	}
	if health.State == "disabled" {
		return "disabled"
	}
	age := now.UTC().Unix() - health.TimestampEpoch
	if age < 0 || age > int64(maximumAge.Seconds()) {
		return "stale"
	}
	return health.State
}

func atomicWrite(path string, raw []byte) error {
	dirPath := filepath.Dir(path)
	if err := os.MkdirAll(dirPath, 0o700); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(dirPath, filepath.Base(path)+".tmp-")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return err
	}
	if _, err := temporary.Write(raw); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, path); err != nil {
		return err
	}
	dir, err := os.Open(dirPath)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func validHealthState(value string) bool {
	return value == "disabled" || value == "starting" || value == "healthy" || value == "degraded" || value == "failed"
}

func validTokenHealth(value string) bool {
	return value == "unused" || value == "healthy" || value == "failed"
}

func validSlot(value string) bool { return value == "organizer_1" || value == "organizer_2" }

func validArtifactType(value string) bool { return value == "transcript" || value == "recording" }

func validStreamState(value string) bool {
	return value == "starting" || value == "healthy" || value == "degraded" || value == "failed"
}
