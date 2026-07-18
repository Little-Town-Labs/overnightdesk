package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"
)

const currentVersion = 2

type MessageRecord struct {
	MessageID      string `json:"message_id"`
	ThreadID       string `json:"thread_id,omitempty"`
	Classification string `json:"classification"`
	State          string `json:"state"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type DeliveryRecord struct {
	CleanID           string `json:"clean_id"`
	ProviderMessageID string `json:"provider_message_id"`
	ThreadID          string `json:"thread_id,omitempty"`
	RunID             string `json:"run_id"`
	State             string `json:"state"`
	ApprovalNotified  bool   `json:"approval_notified,omitempty"`
	CreatedAt         string `json:"created_at"`
	UpdatedAt         string `json:"updated_at"`
}

type document struct {
	Version    int                       `json:"version"`
	Messages   map[string]MessageRecord  `json:"messages"`
	Deliveries map[string]DeliveryRecord `json:"deliveries"`
	Metadata   map[string]string         `json:"metadata"`
}

type Store struct {
	mu   sync.Mutex
	path string
	doc  document
}

func Open(path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	store := &Store{path: path, doc: newDocument()}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return store, store.persistLocked()
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &store.doc); err != nil {
		return nil, fmt.Errorf("decode state: %w", err)
	}
	if store.doc.Version != 1 && store.doc.Version != currentVersion {
		return nil, errors.New("unsupported state document version")
	}
	if store.doc.Messages == nil {
		return nil, errors.New("incomplete state document")
	}
	if store.doc.Deliveries == nil {
		store.doc.Deliveries = make(map[string]DeliveryRecord)
	}
	if store.doc.Metadata == nil {
		store.doc.Metadata = make(map[string]string)
	}
	if store.doc.Version == 1 {
		store.doc.Version = currentVersion
		if err := store.persistLocked(); err != nil {
			return nil, fmt.Errorf("migrate state: %w", err)
		}
	}
	return store, nil
}

func newDocument() document {
	return document{Version: currentVersion, Messages: make(map[string]MessageRecord), Deliveries: make(map[string]DeliveryRecord), Metadata: make(map[string]string)}
}

func (store *Store) ReserveMessage(record MessageRecord) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if _, ok := store.doc.Messages[record.MessageID]; ok {
		return false, nil
	}
	now := timestamp()
	record.State, record.CreatedAt, record.UpdatedAt = "processing", now, now
	store.doc.Messages[record.MessageID] = record
	return true, store.persistLocked()
}

func (store *Store) Message(messageID string) (MessageRecord, bool) {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Messages[messageID]
	return record, ok
}

func (store *Store) UpdateMessage(messageID, status string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Messages[messageID]
	if !ok {
		return errors.New("message record not found")
	}
	record.State, record.UpdatedAt = status, timestamp()
	store.doc.Messages[messageID] = record
	return store.persistLocked()
}

func (store *Store) CreateDelivery(record DeliveryRecord) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if _, ok := store.doc.Deliveries[record.CleanID]; ok {
		return false, nil
	}
	now := timestamp()
	record.CreatedAt, record.UpdatedAt = now, now
	store.doc.Deliveries[record.CleanID] = record
	return true, store.persistLocked()
}

func (store *Store) UpdateDelivery(cleanID, status string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Deliveries[cleanID]
	if !ok {
		return errors.New("delivery record not found")
	}
	record.State, record.UpdatedAt = status, timestamp()
	store.doc.Deliveries[cleanID] = record
	return store.persistLocked()
}

func (store *Store) AttachRun(cleanID, runID, status string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Deliveries[cleanID]
	if !ok || record.RunID != "" || runID == "" {
		return errors.New("delivery run cannot be attached")
	}
	record.RunID, record.State, record.UpdatedAt = runID, status, timestamp()
	store.doc.Deliveries[cleanID] = record
	return store.persistLocked()
}

func (store *Store) MarkApprovalNotified(cleanID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Deliveries[cleanID]
	if !ok {
		return errors.New("delivery record not found")
	}
	record.ApprovalNotified, record.UpdatedAt = true, timestamp()
	store.doc.Deliveries[cleanID] = record
	return store.persistLocked()
}

func (store *Store) RemoveDelivery(cleanID string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	delete(store.doc.Deliveries, cleanID)
	return store.persistLocked()
}

func (store *Store) Deliveries() []DeliveryRecord {
	store.mu.Lock()
	defer store.mu.Unlock()
	records := make([]DeliveryRecord, 0, len(store.doc.Deliveries))
	for _, record := range store.doc.Deliveries {
		records = append(records, record)
	}
	sort.Slice(records, func(i, j int) bool { return records[i].CreatedAt < records[j].CreatedAt })
	return records
}

func (store *Store) SetMetadata(key, value string) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	store.doc.Metadata[key] = value
	return store.persistLocked()
}

func (store *Store) persistLocked() error {
	raw, err := json.Marshal(store.doc)
	if err != nil {
		return err
	}
	temporary := store.path + ".tmp"
	file, err := os.OpenFile(temporary, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	if _, err = file.Write(raw); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if err := os.Rename(temporary, store.path); err != nil {
		return err
	}
	directory, err := os.Open(filepath.Dir(store.path))
	if err != nil {
		return err
	}
	err = directory.Sync()
	_ = directory.Close()
	return err
}

func timestamp() string { return time.Now().UTC().Format(time.RFC3339Nano) }
