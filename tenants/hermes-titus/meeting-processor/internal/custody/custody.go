package custody

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const (
	Retention     = 168 * time.Hour
	MaxPlaintext  = 1_000_000
	fileVersion   = byte(1)
	algorithmName = "AES-256-GCM"
)

var (
	keyIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$`)
	hexPattern   = regexp.MustCompile(`^[0-9a-f]{64}$`)
)

type safeError struct{ code string }

func (err safeError) Error() string { return err.code }

func ErrorCode(err error) string {
	var safe safeError
	if errors.As(err, &safe) {
		return safe.code
	}
	return "custody_unavailable"
}

type KeyRing struct {
	Active string
	keys   map[string][]byte
}

func ParseKeyRing(raw, active string) (KeyRing, error) {
	if !keyIDPattern.MatchString(active) || len(raw) == 0 || len(raw) > 16*1024 {
		return KeyRing{}, safeError{code: "custody_keyring_invalid"}
	}
	var encoded map[string]string
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&encoded); err != nil || len(encoded) == 0 || len(encoded) > 16 {
		return KeyRing{}, safeError{code: "custody_keyring_invalid"}
	}
	keys := make(map[string][]byte, len(encoded))
	for id, value := range encoded {
		if !keyIDPattern.MatchString(id) {
			return KeyRing{}, safeError{code: "custody_keyring_invalid"}
		}
		decoded, err := base64.StdEncoding.Strict().DecodeString(value)
		if err != nil || len(decoded) != 32 {
			return KeyRing{}, safeError{code: "custody_keyring_invalid"}
		}
		keys[id] = append([]byte(nil), decoded...)
	}
	if _, ok := keys[active]; !ok {
		return KeyRing{}, safeError{code: "custody_key_missing"}
	}
	return KeyRing{Active: active, keys: keys}, nil
}

func (ring KeyRing) Has(id string) bool {
	_, ok := ring.keys[id]
	return ok
}

type Record struct {
	Version          int    `json:"version"`
	ObjectName       string `json:"object_name"`
	Algorithm        string `json:"algorithm"`
	KeyID            string `json:"key_id"`
	PlaintextSHA256  string `json:"plaintext_sha256"`
	CiphertextSHA256 string `json:"ciphertext_sha256"`
	PlaintextBytes   int    `json:"plaintext_bytes"`
	CreatedAt        string `json:"created_at"`
	ExpiresAt        string `json:"expires_at"`
	DeletedAt        string `json:"deleted_at,omitempty"`
	Status           string `json:"status"`
	LastErrorCode    string `json:"last_error_code,omitempty"`
}

type Manager struct {
	Dir  string
	Ring KeyRing
	Now  func() time.Time
	Rand io.Reader
}

func (manager Manager) Encrypt(reference string, plaintext []byte) (Record, error) {
	if !hexPattern.MatchString(reference) || len(plaintext) == 0 || len(plaintext) > MaxPlaintext {
		return Record{}, safeError{code: "custody_input_invalid"}
	}
	if !manager.Ring.Has(manager.Ring.Active) {
		return Record{}, safeError{code: "custody_key_missing"}
	}
	if err := ensurePrivateDir(manager.Dir); err != nil {
		return Record{}, err
	}
	now := manager.now().UTC()
	createdAt := now.Format(time.RFC3339Nano)
	plainDigest := sha256.Sum256(plaintext)
	plainHex := hex.EncodeToString(plainDigest[:])
	objectRandom := make([]byte, 16)
	if _, err := io.ReadFull(manager.random(), objectRandom); err != nil {
		return Record{}, safeError{code: "custody_random_unavailable"}
	}
	objectName := hex.EncodeToString(objectRandom) + ".bin"
	key := manager.Ring.keys[manager.Ring.Active]
	block, err := aes.NewCipher(key)
	if err != nil {
		return Record{}, safeError{code: "custody_keyring_invalid"}
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return Record{}, safeError{code: "custody_unavailable"}
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(manager.random(), nonce); err != nil {
		return Record{}, safeError{code: "custody_random_unavailable"}
	}
	aad := associatedData(reference, manager.Ring.Active, plainHex, createdAt)
	sealed := gcm.Seal(nil, nonce, plaintext, aad)
	encoded := append([]byte{'O', 'D', 'C', 'U', fileVersion}, nonce...)
	encoded = append(encoded, sealed...)
	cipherDigest := sha256.Sum256(encoded)
	record := Record{
		Version: 1, ObjectName: objectName, Algorithm: algorithmName,
		KeyID: manager.Ring.Active, PlaintextSHA256: plainHex,
		CiphertextSHA256: hex.EncodeToString(cipherDigest[:]), PlaintextBytes: len(plaintext),
		CreatedAt: createdAt, ExpiresAt: now.Add(Retention).Format(time.RFC3339Nano), Status: "retained",
	}
	if err := writePrivateAtomic(filepath.Join(manager.Dir, objectName), encoded); err != nil {
		return Record{}, err
	}
	return record, nil
}

func (manager Manager) Decrypt(reference string, record Record) ([]byte, error) {
	if err := ValidateRecord(record); err != nil || !hexPattern.MatchString(reference) || record.Status != "retained" {
		return nil, safeError{code: "custody_record_invalid"}
	}
	key, ok := manager.Ring.keys[record.KeyID]
	if !ok {
		return nil, safeError{code: "custody_key_missing"}
	}
	raw, err := readObject(manager.Dir, record.ObjectName)
	if err != nil {
		return nil, err
	}
	digest := sha256.Sum256(raw)
	if hex.EncodeToString(digest[:]) != record.CiphertextSHA256 || len(raw) < 5 || string(raw[:4]) != "ODCU" || raw[4] != fileVersion {
		return nil, safeError{code: "custody_tampered"}
	}
	block, _ := aes.NewCipher(key)
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(raw) < 5+gcm.NonceSize()+gcm.Overhead() {
		return nil, safeError{code: "custody_tampered"}
	}
	nonce := raw[5 : 5+gcm.NonceSize()]
	plaintext, err := gcm.Open(nil, nonce, raw[5+gcm.NonceSize():], associatedData(reference, record.KeyID, record.PlaintextSHA256, record.CreatedAt))
	if err != nil {
		return nil, safeError{code: "custody_tampered"}
	}
	digest = sha256.Sum256(plaintext)
	if len(plaintext) != record.PlaintextBytes || hex.EncodeToString(digest[:]) != record.PlaintextSHA256 {
		return nil, safeError{code: "custody_tampered"}
	}
	return plaintext, nil
}

type SweepResult struct {
	Records        []Record
	Blocked        bool
	Code           string
	OrphansDeleted int
}

func (manager Manager) Sweep(records []Record) SweepResult {
	result := SweepResult{Records: append([]Record(nil), records...)}
	now := manager.now().UTC()
	live := make(map[string]struct{}, len(records))
	for index := range result.Records {
		record := &result.Records[index]
		if ValidateRecord(*record) != nil {
			result.Blocked, result.Code = true, "custody_state_invalid"
			continue
		}
		if record.Status == "deleted" {
			continue
		}
		live[record.ObjectName] = struct{}{}
		expiresAt, _ := time.Parse(time.RFC3339Nano, record.ExpiresAt)
		if now.Before(expiresAt) {
			if manager.Ring.keys == nil {
				continue
			}
			if !manager.Ring.Has(record.KeyID) {
				record.Status, record.LastErrorCode = "blocked", "custody_key_missing"
				result.Blocked, result.Code = true, "custody_referenced_key_missing"
			} else if record.Status == "blocked" && record.LastErrorCode == "custody_key_missing" {
				record.Status, record.LastErrorCode = "retained", ""
			}
			continue
		}
		path := filepath.Join(manager.Dir, record.ObjectName)
		err := os.Remove(path)
		if err == nil || errors.Is(err, os.ErrNotExist) {
			record.Status, record.DeletedAt, record.LastErrorCode = "deleted", now.Format(time.RFC3339Nano), ""
			continue
		}
		record.Status, record.LastErrorCode = "delete_retryable", "custody_delete_failed"
		result.Blocked, result.Code = true, "custody_retention_overdue"
	}
	entries, err := os.ReadDir(manager.Dir)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		result.Blocked, result.Code = true, "custody_reconcile_failed"
		return result
	}
	for _, entry := range entries {
		name := entry.Name()
		if entry.Type().IsRegular() && regexp.MustCompile(`^[0-9a-f]{32}\.bin$`).MatchString(name) {
			if _, ok := live[name]; ok {
				continue
			}
			if err := os.Remove(filepath.Join(manager.Dir, name)); err != nil && !errors.Is(err, os.ErrNotExist) {
				result.Blocked, result.Code = true, "custody_reconcile_failed"
				continue
			}
			result.OrphansDeleted++
		}
	}
	return result
}

// Discard removes a just-created ciphertext when its state record could not be
// committed. It is safe to replay and never requires the decryption key.
func (manager Manager) Discard(record Record) error {
	if !regexp.MustCompile(`^[0-9a-f]{32}\.bin$`).MatchString(record.ObjectName) {
		return safeError{code: "custody_record_invalid"}
	}
	err := os.Remove(filepath.Join(manager.Dir, record.ObjectName))
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return safeError{code: "custody_delete_failed"}
	}
	return nil
}

func ValidateRecord(record Record) error {
	createdAt, createdErr := time.Parse(time.RFC3339Nano, record.CreatedAt)
	expiresAt, expiresErr := time.Parse(time.RFC3339Nano, record.ExpiresAt)
	validStatus := record.Status == "retained" || record.Status == "deleted" || record.Status == "delete_retryable" || record.Status == "blocked"
	if record.Version != 1 || record.Algorithm != algorithmName || !keyIDPattern.MatchString(record.KeyID) ||
		!regexp.MustCompile(`^[0-9a-f]{32}\.bin$`).MatchString(record.ObjectName) || !hexPattern.MatchString(record.PlaintextSHA256) ||
		!hexPattern.MatchString(record.CiphertextSHA256) || record.PlaintextBytes < 1 || record.PlaintextBytes > MaxPlaintext ||
		createdErr != nil || expiresErr != nil || !expiresAt.Equal(createdAt.Add(Retention)) || !validStatus {
		return safeError{code: "custody_record_invalid"}
	}
	return nil
}

func associatedData(reference, keyID, digest, createdAt string) []byte {
	return []byte(fmt.Sprintf("meeting-custody/v1\x00%s\x00transcript\x00%s\x00%s\x00%s", reference, keyID, digest, createdAt))
}

func (manager Manager) now() time.Time {
	if manager.Now != nil {
		return manager.Now()
	}
	return time.Now()
}

func (manager Manager) random() io.Reader {
	if manager.Rand != nil {
		return manager.Rand
	}
	return rand.Reader
}

func ensurePrivateDir(path string) error {
	if path == "" || !filepath.IsAbs(path) {
		return safeError{code: "custody_path_invalid"}
	}
	if err := os.MkdirAll(path, 0o700); err != nil || os.Chmod(path, 0o700) != nil {
		return safeError{code: "custody_unavailable"}
	}
	return nil
}

func writePrivateAtomic(path string, body []byte) error {
	dir := filepath.Dir(path)
	temp, err := os.CreateTemp(dir, ".custody-*")
	if err != nil {
		return safeError{code: "custody_unavailable"}
	}
	tempName := temp.Name()
	defer os.Remove(tempName)
	if err := temp.Chmod(0o600); err != nil {
		temp.Close()
		return safeError{code: "custody_unavailable"}
	}
	if _, err := temp.Write(body); err != nil || temp.Sync() != nil || temp.Close() != nil || os.Rename(tempName, path) != nil {
		return safeError{code: "custody_unavailable"}
	}
	if dirHandle, err := os.Open(dir); err != nil || dirHandle.Sync() != nil || dirHandle.Close() != nil {
		return safeError{code: "custody_unavailable"}
	}
	return nil
}

func readObject(dir, objectName string) ([]byte, error) {
	if !regexp.MustCompile(`^[0-9a-f]{32}\.bin$`).MatchString(objectName) {
		return nil, safeError{code: "custody_record_invalid"}
	}
	path := filepath.Join(dir, objectName)
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > MaxPlaintext+1024 {
		return nil, safeError{code: "custody_unavailable"}
	}
	return os.ReadFile(path)
}
