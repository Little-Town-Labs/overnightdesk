package worker

import (
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"time"
)

type Event struct {
	Event           string `json:"event"`
	CycleID         string `json:"cycle_id"`
	OrganizerSlot   string `json:"organizer_slot,omitempty"`
	ArtifactType    string `json:"artifact_type,omitempty"`
	State           string `json:"state,omitempty"`
	SafeErrorCode   string `json:"safe_error_code,omitempty"`
	HTTPStatusClass string `json:"http_status_class,omitempty"`
	PageCount       int    `json:"page_count,omitempty"`
	NewCount        int    `json:"new_count,omitempty"`
	KnownCount      int    `json:"known_count,omitempty"`
	TotalCount      int    `json:"total_count,omitempty"`
	RetryCount      int    `json:"retry_count,omitempty"`
	DurationMS      int64  `json:"duration_ms,omitempty"`
	CursorPresent   bool   `json:"cursor_present,omitempty"`
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
}

var cyclePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

var allowedEvents = map[string]bool{
	"cycle_start": true, "cycle_complete": true, "cycle_failed": true,
	"stream_start": true, "stream_complete": true, "stream_failed": true, "retry": true,
}

func WriteEvent(output io.Writer, event Event) error {
	if !allowedEvents[event.Event] || !cyclePattern.MatchString(event.CycleID) {
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
	raw, err := json.Marshal(health)
	if err != nil {
		return errors.New("health record invalid")
	}
	return atomicWrite(path, raw)
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
