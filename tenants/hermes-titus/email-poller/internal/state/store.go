package state

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const currentVersion = 1

type MessageRecord struct {
	MessageID      string `json:"message_id"`
	ThreadID       string `json:"thread_id"`
	Sender         string `json:"sender,omitempty"`
	Subject        string `json:"subject,omitempty"`
	Classification string `json:"classification"`
	State          string `json:"state"`
	ClientID       string `json:"client_id"`
	ReplyText      string `json:"reply_text,omitempty"`
	RemoteID       string `json:"remote_id,omitempty"`
	LastErrorCode  string `json:"last_error_code,omitempty"`
	CreatedAt      string `json:"created_at"`
	UpdatedAt      string `json:"updated_at"`
}

type ApprovalRecord struct {
	QueueID              string `json:"queue_id"`
	SourceMessageID      string `json:"source_message_id"`
	DraftID              string `json:"draft_id,omitempty"`
	DraftClientID        string `json:"draft_client_id,omitempty"`
	NotificationDraftID  string `json:"notification_draft_id,omitempty"`
	NotificationClientID string `json:"notification_client_id,omitempty"`
	Recipient            string `json:"recipient,omitempty"`
	InReplyTo            string `json:"in_reply_to,omitempty"`
	DraftSubject         string `json:"draft_subject,omitempty"`
	DraftText            string `json:"draft_text,omitempty"`
	DraftDigest          string `json:"draft_digest,omitempty"`
	TokenDigest          string `json:"token_digest,omitempty"`
	State                string `json:"state"`
	DecidedBy            string `json:"decided_by,omitempty"`
	DecisionMessageID    string `json:"decision_message_id,omitempty"`
	SentMessageID        string `json:"sent_message_id,omitempty"`
	CreatedAt            string `json:"created_at,omitempty"`
	DecidedAt            string `json:"decided_at,omitempty"`
}

type document struct {
	Version   int                       `json:"version"`
	Messages  map[string]MessageRecord  `json:"messages"`
	Approvals map[string]ApprovalRecord `json:"approvals"`
	Metadata  map[string]string         `json:"metadata"`
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
	if store.doc.Version != currentVersion || store.doc.Messages == nil || store.doc.Approvals == nil {
		return nil, errors.New("unsupported or incomplete state document")
	}
	if store.doc.Metadata == nil {
		store.doc.Metadata = make(map[string]string)
	}
	return store, nil
}

func newDocument() document {
	return document{Version: currentVersion, Messages: make(map[string]MessageRecord), Approvals: make(map[string]ApprovalRecord), Metadata: make(map[string]string)}
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

func (store *Store) UpdateMessage(messageID string, update func(*MessageRecord)) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Messages[messageID]
	if !ok {
		return errors.New("message record not found")
	}
	update(&record)
	record.UpdatedAt = timestamp()
	store.doc.Messages[messageID] = record
	return store.persistLocked()
}

func (store *Store) CreateApproval(record ApprovalRecord) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	if _, ok := store.doc.Approvals[record.QueueID]; ok {
		return false, nil
	}
	if record.CreatedAt == "" {
		record.CreatedAt = timestamp()
	}
	store.doc.Approvals[record.QueueID] = record
	return true, store.persistLocked()
}

func (store *Store) Approval(queueID string) (ApprovalRecord, bool) {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Approvals[queueID]
	return record, ok
}

func (store *Store) UpdateApproval(queueID string, update func(*ApprovalRecord)) error {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Approvals[queueID]
	if !ok {
		return errors.New("approval record not found")
	}
	update(&record)
	store.doc.Approvals[queueID] = record
	return store.persistLocked()
}

func (store *Store) ClaimDecision(queueID, decision, actor, messageID string) (bool, error) {
	store.mu.Lock()
	defer store.mu.Unlock()
	record, ok := store.doc.Approvals[queueID]
	if !ok || record.State != "pending" {
		return false, nil
	}
	if decision == "approve" {
		record.State = "approving"
	} else {
		record.State = "rejecting"
	}
	record.DecidedBy, record.DecisionMessageID, record.DecidedAt = actor, messageID, timestamp()
	store.doc.Approvals[queueID] = record
	return true, store.persistLocked()
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

func timestamp() string {
	return time.Now().UTC().Format(time.RFC3339Nano)
}
