package state

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"syscall"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
)

const (
	CurrentVersion      = 2
	MaxStateArtifacts   = 10000
	MaxStateStringBytes = int64(32 << 20)
	MaxStateFileBytes   = int64(64 << 20)
)

type Document struct {
	Version   int                 `json:"version"`
	Streams   map[string]Stream   `json:"streams"`
	Artifacts map[string]Artifact `json:"artifacts"`
	Metadata  map[string]string   `json:"metadata"`
}

type safeError struct {
	code string
}

func (err safeError) Error() string { return err.code }

func ErrorCode(err error) string {
	var safe safeError
	if errors.As(err, &safe) {
		return safe.code
	}
	return "state_unavailable"
}

type Store struct {
	path           string
	lockFile       *os.File
	doc            Document
	maxArtifacts   int
	maxStringBytes int64
	maxFileBytes   int64
}

func Open(path string) (*Store, error) {
	if path == "" {
		return nil, safeError{code: "state_invalid"}
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
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

	store := &Store{
		path: path, lockFile: lock, maxArtifacts: MaxStateArtifacts,
		maxStringBytes: MaxStateStringBytes, maxFileBytes: MaxStateFileBytes,
	}
	info, err := os.Lstat(path)
	if errors.Is(err, os.ErrNotExist) {
		store.doc = newDocument()
		if err := store.persist(store.doc); err != nil {
			store.Close()
			return nil, err
		}
		return store, nil
	}
	if err != nil {
		store.Close()
		return nil, safeError{code: "state_unavailable"}
	}
	if !info.Mode().IsRegular() || info.Size() < 0 || info.Size() > store.maxFileBytes {
		store.Close()
		return nil, invalidState()
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		store.Close()
		return nil, safeError{code: "state_unavailable"}
	}
	migrated, err := decodeDocument(raw, &store.doc)
	if err != nil {
		store.Close()
		return nil, err
	}
	if migrated {
		if err := store.persist(store.doc); err != nil {
			store.Close()
			return nil, err
		}
	}
	if err := os.Chmod(path, 0o600); err != nil {
		store.Close()
		return nil, safeError{code: "state_unavailable"}
	}
	return store, nil
}

func newDocument() Document {
	return Document{
		Version:   CurrentVersion,
		Streams:   make(map[string]Stream),
		Artifacts: make(map[string]Artifact),
		Metadata:  make(map[string]string),
	}
}

func decodeDocument(raw []byte, target *Document) (bool, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return false, safeError{code: "state_invalid"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return false, safeError{code: "state_invalid"}
	}
	migrated := false
	if target.Version == 1 {
		for key, artifact := range target.Artifacts {
			if artifact.ContentStatus != "" || artifact.RawContentDigest != "" || artifact.SafeContentDigest != "" || artifact.TitusOutputDigest != "" || artifact.TitusOutput != "" || artifact.LastContentAttemptAt != "" || artifact.ContentProcessedAt != "" || artifact.ContentRetryCount != 0 || artifact.ContentErrorCode != "" {
				return false, invalidState()
			}
			if artifact.ArtifactType == "transcript" {
				artifact.ContentStatus = "pending"
			} else if artifact.ArtifactType == "recording" {
				artifact.ContentStatus = "not_applicable"
			} else {
				return false, invalidState()
			}
			target.Artifacts[key] = artifact
		}
		target.Version = CurrentVersion
		migrated = true
	}
	return migrated, validate(*target)
}

func validate(doc Document) error {
	return validateWithLimits(doc, MaxStateArtifacts, MaxStateStringBytes)
}

func validateWithLimits(doc Document, maxArtifacts int, maxStringBytes int64) error {
	if doc.Version != CurrentVersion || doc.Streams == nil || doc.Artifacts == nil || doc.Metadata == nil {
		return invalidState()
	}
	if maxArtifacts <= 0 || maxStringBytes <= 0 || len(doc.Artifacts) > maxArtifacts || !withinStringBudget(doc, maxStringBytes) {
		return invalidState()
	}
	if len(doc.Streams) == 0 {
		if len(doc.Artifacts) != 0 || len(doc.Metadata) != 0 {
			return invalidState()
		}
		return nil
	}
	if len(doc.Streams) != 4 || !validMetadata(doc.Metadata) {
		return invalidState()
	}

	organizerIDs := make(map[string]string, 2)
	organizerFingerprints := make(map[string]string, 2)
	for _, slot := range []string{"organizer_1", "organizer_2"} {
		for _, artifactType := range []string{"transcript", "recording"} {
			key := slot + ":" + artifactType
			stream, ok := doc.Streams[key]
			if !ok || stream.OrganizerSlot != slot || stream.ArtifactType != artifactType ||
				!digestPattern.MatchString(stream.OrganizerFingerprint) || stream.ArtifactCount < 0 ||
				!validTimestamp(stream.LastAttemptAt) || !validTimestamp(stream.LastSuccessAt) ||
				!validSafeCode(stream.LastErrorCode) {
				return invalidState()
			}
			organizerID, err := continuationOrganizer(stream.DeltaLink, artifactType)
			if err != nil || digestString(organizerID) != stream.OrganizerFingerprint {
				return invalidState()
			}
			if previous := organizerIDs[slot]; previous != "" && previous != organizerID {
				return invalidState()
			}
			if previous := organizerFingerprints[slot]; previous != "" && previous != stream.OrganizerFingerprint {
				return invalidState()
			}
			organizerIDs[slot] = organizerID
			organizerFingerprints[slot] = stream.OrganizerFingerprint
		}
	}
	if organizerFingerprints["organizer_1"] == organizerFingerprints["organizer_2"] {
		return invalidState()
	}

	artifactCounts := make(map[string]int, 4)
	providerKeys := make(map[string]struct{}, len(doc.Artifacts))
	for key, artifact := range doc.Artifacts {
		streamKey := artifact.OrganizerSlot + ":" + artifact.ArtifactType
		stream, ok := doc.Streams[streamKey]
		if !ok || key != artifact.InternalReference || !digestPattern.MatchString(key) ||
			artifact.OrganizerFingerprint != stream.OrganizerFingerprint ||
			!boundedProviderValue(artifact.ProviderArtifactID) || !boundedProviderValue(artifact.ProviderMeetingID) ||
			!validOptionalTimestamp(artifact.ProviderCreatedAt) || !validTimestamp(artifact.DiscoveredAt) ||
			!validContentLifecycle(artifact) {
			return invalidState()
		}
		expectedReference := digestString(organizerIDs[artifact.OrganizerSlot] + "\x00" + artifact.ArtifactType + "\x00" + artifact.ProviderArtifactID)
		if artifact.InternalReference != expectedReference {
			return invalidState()
		}
		providerKey := streamKey + "\x00" + artifact.ProviderArtifactID
		if _, duplicate := providerKeys[providerKey]; duplicate {
			return invalidState()
		}
		providerKeys[providerKey] = struct{}{}
		artifactCounts[streamKey]++
	}
	for key, stream := range doc.Streams {
		if artifactCounts[key] != stream.ArtifactCount {
			return invalidState()
		}
	}
	return nil
}

func withinStringBudget(doc Document, maximum int64) bool {
	used := int64(0)
	add := func(values ...string) bool {
		for _, value := range values {
			length := int64(len(value))
			if length > maximum-used {
				return false
			}
			used += length
		}
		return true
	}
	for key, value := range doc.Metadata {
		if !add(key, value) {
			return false
		}
	}
	for key, stream := range doc.Streams {
		if !add(key, stream.OrganizerFingerprint, stream.OrganizerSlot, stream.ArtifactType,
			stream.DeltaLink, stream.LastAttemptAt, stream.LastSuccessAt, stream.LastErrorCode) {
			return false
		}
	}
	for key, artifact := range doc.Artifacts {
		if !add(key, artifact.InternalReference, artifact.OrganizerFingerprint, artifact.OrganizerSlot,
			artifact.ArtifactType, artifact.ProviderArtifactID, artifact.ProviderMeetingID,
			artifact.ProviderCreatedAt, artifact.DiscoveredAt, artifact.ContentStatus,
			artifact.RawContentDigest, artifact.SafeContentDigest, artifact.TitusOutputDigest,
			artifact.TitusOutput, artifact.LastContentAttemptAt, artifact.ContentProcessedAt,
			artifact.ContentErrorCode) {
			return false
		}
	}
	return true
}

var (
	digestPattern           = regexp.MustCompile(`^[0-9a-f]{64}$`)
	uuidPattern             = regexp.MustCompile(`^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[1-5][0-9A-Fa-f]{3}-[89ABab][0-9A-Fa-f]{3}-[0-9A-Fa-f]{12}$`)
	credentialOutputPattern = regexp.MustCompile(`(?i)(authorization\s*:\s*bearer|MSGRAPH_[A-Z0-9_]*(SECRET|TOKEN|KEY)|HERMES_API_KEY|SECURITY_SERVICE_TOKEN)`)
)

func invalidState() error { return safeError{code: "state_invalid"} }

func validMetadata(metadata map[string]string) bool {
	if len(metadata) != 2 || !validTimestamp(metadata["created_at"]) || !validTimestamp(metadata["updated_at"]) {
		return false
	}
	created, _ := time.Parse(time.RFC3339Nano, metadata["created_at"])
	updated, _ := time.Parse(time.RFC3339Nano, metadata["updated_at"])
	return !updated.Before(created)
}

func validTimestamp(value string) bool {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	return err == nil && strings.HasSuffix(value, "Z") && parsed.UTC().Format(time.RFC3339Nano) == value
}

func validOptionalTimestamp(value string) bool { return value == "" || validTimestamp(value) }

func validSafeCode(code string) bool {
	switch code {
	case "", "token_unavailable", "token_rejected", "payment_required", "forbidden",
		"transcripts_disabled", "throttled", "provider_unavailable", "provider_rejected",
		"provider_response_invalid", "transcript_content_invalid", "securityteam_unavailable",
		"securityteam_response_invalid", "securityteam_blocked", "titus_unavailable",
		"titus_response_invalid", "titus_output_rejected", "state_invalid",
		"handoff_unavailable", "health_unavailable", "meeting_qa_blocked":
		return true
	default:
		return false
	}
}

func validContentLifecycle(artifact Artifact) bool {
	if artifact.ContentRetryCount < 0 || artifact.ContentRetryCount > 1000 ||
		!validOptionalTimestamp(artifact.LastContentAttemptAt) || !validOptionalTimestamp(artifact.ContentProcessedAt) ||
		(artifact.RawContentDigest != "" && !digestPattern.MatchString(artifact.RawContentDigest)) ||
		(artifact.SafeContentDigest != "" && !digestPattern.MatchString(artifact.SafeContentDigest)) ||
		(artifact.TitusOutputDigest != "" && !digestPattern.MatchString(artifact.TitusOutputDigest)) ||
		!validSafeCode(artifact.ContentErrorCode) {
		return false
	}
	if artifact.ArtifactType == "recording" {
		return artifact.ContentStatus == "not_applicable" && artifact.RawContentDigest == "" && artifact.SafeContentDigest == "" &&
			artifact.TitusOutputDigest == "" && artifact.TitusOutput == "" && artifact.LastContentAttemptAt == "" &&
			artifact.ContentProcessedAt == "" && artifact.ContentRetryCount == 0 && artifact.ContentErrorCode == ""
	}
	switch artifact.ContentStatus {
	case "pending":
		return artifact.RawContentDigest == "" && artifact.SafeContentDigest == "" && artifact.TitusOutputDigest == "" &&
			artifact.TitusOutput == "" && artifact.LastContentAttemptAt == "" && artifact.ContentProcessedAt == "" &&
			artifact.ContentRetryCount == 0 && artifact.ContentErrorCode == ""
	case "processed":
		return digestPattern.MatchString(artifact.RawContentDigest) && digestPattern.MatchString(artifact.SafeContentDigest) &&
			digestPattern.MatchString(artifact.TitusOutputDigest) && artifact.TitusOutputDigest == digestString(artifact.TitusOutput) &&
			artifact.TitusOutput != "" && len(artifact.TitusOutput) <= 65536 &&
			utf8.ValidString(artifact.TitusOutput) && !strings.ContainsRune(artifact.TitusOutput, 0) &&
			!strings.Contains(artifact.TitusOutput, artifact.ProviderArtifactID) && !strings.Contains(artifact.TitusOutput, artifact.ProviderMeetingID) &&
			!strings.Contains(strings.ToLower(artifact.TitusOutput), "graph.microsoft.com") && !credentialOutputPattern.MatchString(artifact.TitusOutput) &&
			validTimestamp(artifact.LastContentAttemptAt) && validTimestamp(artifact.ContentProcessedAt) && artifact.ContentErrorCode == ""
	case "blocked", "retryable_error":
		return validTimestamp(artifact.LastContentAttemptAt) && artifact.ContentProcessedAt == "" && artifact.ContentRetryCount > 0 &&
			artifact.ContentErrorCode != "" && artifact.TitusOutput == "" && artifact.TitusOutputDigest == ""
	default:
		return false
	}
}

func boundedProviderValue(value string) bool {
	if value == "" || len(value) > 8192 || !utf8.ValidString(value) {
		return false
	}
	for _, character := range value {
		if unicode.IsControl(character) {
			return false
		}
	}
	return true
}

func continuationOrganizer(raw, artifactType string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	prefix := "/v1.0/users/"
	if !strings.HasPrefix(parsed.Path, prefix) {
		return "", errors.New("state continuation invalid")
	}
	organizerID := strings.SplitN(strings.TrimPrefix(parsed.Path, prefix), "/", 2)[0]
	if !uuidPattern.MatchString(organizerID) {
		return "", errors.New("state continuation invalid")
	}
	kind := graph.ArtifactType(artifactType)
	if err := graph.ValidateDeltaURL(raw, organizerID, kind, false); err != nil {
		return "", err
	}
	return organizerID, nil
}

func digestString(value string) string {
	sum := sha256.Sum256([]byte(value))
	return fmt.Sprintf("%x", sum[:])
}

func (store *Store) Document() Document {
	return cloneDocument(store.doc)
}

func (store *Store) Commit(doc Document) error {
	if err := validateWithLimits(doc, store.maxArtifacts, store.maxStringBytes); err != nil {
		return err
	}
	if err := store.persist(doc); err != nil {
		return err
	}
	store.doc = cloneDocument(doc)
	return nil
}

func (store *Store) persist(doc Document) error {
	temporary, err := os.CreateTemp(filepath.Dir(store.path), filepath.Base(store.path)+".tmp-")
	if err != nil {
		return safeError{code: "state_unavailable"}
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := temporary.Chmod(0o600); err != nil {
		temporary.Close()
		return safeError{code: "state_unavailable"}
	}
	writer := &boundedWriter{writer: temporary, remaining: store.maxFileBytes}
	if err := writeDocumentJSON(writer, doc); err != nil {
		temporary.Close()
		if errors.Is(err, errStateFileTooLarge) {
			return invalidState()
		}
		return safeError{code: "state_unavailable"}
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return safeError{code: "state_unavailable"}
	}
	if err := temporary.Close(); err != nil {
		return safeError{code: "state_unavailable"}
	}
	if err := os.Rename(temporaryPath, store.path); err != nil {
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

func writeDocumentJSON(writer io.Writer, doc Document) error {
	if _, err := io.WriteString(writer, `{"version":2,"streams":{`); err != nil {
		return err
	}
	streamKeys := sortedKeys(doc.Streams)
	for index, key := range streamKeys {
		if err := writeMapEntry(writer, index, key, doc.Streams[key]); err != nil {
			return err
		}
	}
	if _, err := io.WriteString(writer, `},"artifacts":{`); err != nil {
		return err
	}
	artifactKeys := sortedKeys(doc.Artifacts)
	for index, key := range artifactKeys {
		if err := writeMapEntry(writer, index, key, doc.Artifacts[key]); err != nil {
			return err
		}
	}
	if _, err := io.WriteString(writer, `},"metadata":{`); err != nil {
		return err
	}
	metadataKeys := sortedKeys(doc.Metadata)
	for index, key := range metadataKeys {
		if err := writeMapEntry(writer, index, key, doc.Metadata[key]); err != nil {
			return err
		}
	}
	_, err := io.WriteString(writer, "}}\n")
	return err
}

func sortedKeys[Value any](values map[string]Value) []string {
	keys := make([]string, 0, len(values))
	for key := range values {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func writeMapEntry(writer io.Writer, index int, key string, value any) error {
	if index > 0 {
		if _, err := io.WriteString(writer, ","); err != nil {
			return err
		}
	}
	encodedKey, err := json.Marshal(key)
	if err != nil {
		return invalidState()
	}
	encodedValue, err := json.Marshal(value)
	if err != nil {
		return invalidState()
	}
	if _, err := writer.Write(encodedKey); err != nil {
		return err
	}
	if _, err := io.WriteString(writer, ":"); err != nil {
		return err
	}
	_, err = writer.Write(encodedValue)
	return err
}

var errStateFileTooLarge = errors.New("state file too large")

type boundedWriter struct {
	writer    io.Writer
	remaining int64
}

func (writer *boundedWriter) Write(data []byte) (int, error) {
	if int64(len(data)) > writer.remaining {
		return 0, errStateFileTooLarge
	}
	written, err := writer.writer.Write(data)
	writer.remaining -= int64(written)
	return written, err
}

func (store *Store) Close() error {
	if store.lockFile == nil {
		return nil
	}
	unlockErr := syscall.Flock(int(store.lockFile.Fd()), syscall.LOCK_UN)
	closeErr := store.lockFile.Close()
	store.lockFile = nil
	return errors.Join(unlockErr, closeErr)
}

func cloneDocument(doc Document) Document {
	clone := newDocument()
	clone.Version = doc.Version
	for key, value := range doc.Streams {
		clone.Streams[key] = value
	}
	for key, value := range doc.Artifacts {
		clone.Artifacts[key] = value
	}
	for key, value := range doc.Metadata {
		clone.Metadata[key] = value
	}
	return clone
}
