package worker

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"
)

type healthRecord struct {
	State          string `json:"state"`
	Timestamp      string `json:"timestamp"`
	TimestampEpoch int64  `json:"timestamp_epoch"`
	ErrorCode      string `json:"error_code,omitempty"`
}

func WriteHealth(path, stateValue, errorCode string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	now := time.Now().UTC()
	record := healthRecord{State: stateValue, Timestamp: now.Format(time.RFC3339Nano), TimestampEpoch: now.Unix(), ErrorCode: errorCode}
	raw, err := json.Marshal(record)
	if err != nil {
		return err
	}
	temporary := path + ".tmp"
	if err := os.WriteFile(temporary, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(temporary, path)
}

func Health(path string, now time.Time, maximumAge time.Duration) (bool, string) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return false, "missing"
	}
	var record healthRecord
	if json.Unmarshal(raw, &record) != nil || record.TimestampEpoch <= 0 {
		return false, "invalid"
	}
	if record.State == "disabled" {
		return true, "disabled"
	}
	age := now.Unix() - record.TimestampEpoch
	if record.State == "healthy" && age >= 0 && age <= int64(maximumAge.Seconds()) {
		return true, "healthy"
	}
	if record.State == "initialized" && age >= 0 && age <= int64(maximumAge.Seconds()) {
		return true, "initialized"
	}
	return false, "stale"
}

var errDraftMismatch = errors.New("draft mismatch")
