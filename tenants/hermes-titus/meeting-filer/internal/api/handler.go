package api

import (
	"bytes"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/filing"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/kanban"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/policy"
)

const MaxRequestBytes = int64(128 * 1024)

var referencePattern = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)
var digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

type Handler struct {
	configuration policy.Config
	kanban        kanban.Adapter
	now           func() time.Time
	mu            sync.Mutex
	ledger        map[string]model.FilingResult
}

func NewHandler(configuration policy.Config, adapter kanban.Adapter, now func() time.Time) (*Handler, error) {
	if !configuration.Enabled || configuration.Bearer == "" || adapter.Runner == nil {
		return nil, errors.New("api_config_invalid")
	}
	if now == nil {
		now = time.Now
	}
	ledger, err := loadLedger(configuration.LedgerPath)
	if err != nil {
		return nil, err
	}
	return &Handler{configuration: configuration, kanban: adapter, now: now, ledger: ledger}, nil
}

func (handler *Handler) ServeHTTP(response http.ResponseWriter, request *http.Request) {
	response.Header().Set("Content-Type", "application/json")
	if request.Method == http.MethodGet && request.URL.Path == "/health" {
		status := "healthy"
		code := http.StatusOK
		if !handler.dependenciesHealthy() {
			status, code = "degraded", http.StatusServiceUnavailable
		}
		response.WriteHeader(code)
		_ = json.NewEncoder(response).Encode(map[string]string{"status": status, "schemaVersion": "meeting-filer-health/v1"})
		return
	}
	if request.Method != http.MethodPost || request.URL.Path != "/v1/filings" {
		writeError(response, http.StatusNotFound, "NOT_FOUND", "Filing endpoint not found.")
		return
	}
	if !constant(request.Header.Get("Authorization"), "Bearer "+handler.configuration.Bearer) {
		writeError(response, http.StatusUnauthorized, "UNAUTHORIZED", "Authentication failed.")
		return
	}
	raw, err := io.ReadAll(io.LimitReader(request.Body, MaxRequestBytes+1))
	if err != nil || len(raw) == 0 || int64(len(raw)) > MaxRequestBytes {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.")
		return
	}
	requestDigest := sha256.Sum256(raw)
	requestDigestHex := hex.EncodeToString(requestDigest[:])
	if !constant(request.Header.Get("Idempotency-Key"), requestDigestHex) {
		writeError(response, http.StatusBadRequest, "IDEMPOTENCY_MISMATCH", "Idempotency key is invalid.")
		return
	}
	handler.mu.Lock()
	defer handler.mu.Unlock()
	if prior, ok := handler.ledger[requestDigestHex]; ok {
		response.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(response).Encode(prior)
		return
	}
	var input model.FilingInput
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.")
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeError(response, http.StatusBadRequest, "INVALID_REQUEST", "Request body is invalid.")
		return
	}
	brief, err := validateInput(input, handler.configuration.ProtectedValues)
	if err != nil {
		writeError(response, http.StatusUnprocessableEntity, "VALIDATION_FAILED", "Filing input failed validation.")
		return
	}
	route, ok := policy.ValidateRoute(handler.configuration, input.ProjectRoute)
	if !ok {
		writeError(response, http.StatusUnprocessableEntity, "ROUTE_INVALID", "Project route is invalid.")
		return
	}
	noteRoute := input.ProjectRoute
	if noteRoute != nil {
		copy := route
		noteRoute = &copy
	}
	note, err := filing.CreateNote(handler.configuration.ProjectsRoot, input.Reference, input.BriefDigest, input.ApprovedAt, noteRoute, brief)
	if err != nil {
		writeError(response, http.StatusConflict, "NOTE_CONFLICT", "Meeting note could not be created safely.")
		return
	}
	tasks, err := kanban.CreateTasks(request.Context(), handler.kanban, input.Reference, input.BriefDigest, brief, noteRoute)
	if err != nil {
		writeError(response, http.StatusInternalServerError, "KANBAN_UNAVAILABLE", "Kanban tasks could not be created.")
		return
	}
	result := model.FilingResult{SchemaVersion: "meeting-filing-result/v1", Reference: input.Reference, RequestDigest: requestDigestHex, NoteRelativePath: note.RelativePath, NoteDigest: note.Digest, NoteKey: note.Key, Board: route.KanbanBoard, TriageTaskKey: tasks.TriageKey, ActionTaskKeys: tasks.ActionKeys, FiledAt: handler.now().UTC().Format(time.RFC3339Nano)}
	handler.ledger[requestDigestHex] = result
	if err := persistLedger(handler.configuration.LedgerPath, handler.ledger); err != nil {
		delete(handler.ledger, requestDigestHex)
		writeError(response, http.StatusInternalServerError, "LEDGER_UNAVAILABLE", "Filing result could not be stored.")
		return
	}
	response.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(response).Encode(result)
}

func (handler *Handler) dependenciesHealthy() bool {
	for path, kind := range map[string]string{handler.configuration.ProjectsRoot: "dir", filepath.Dir(handler.configuration.LedgerPath): "dir", handler.configuration.LedgerPath: "file", handler.configuration.HermesBinary: "file"} {
		info, err := os.Lstat(path)
		if err != nil || info.Mode()&os.ModeSymlink != 0 || (kind == "dir" && !info.IsDir()) || (kind == "file" && !info.Mode().IsRegular()) {
			return false
		}
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return false
	}
	kanban, err := os.Lstat(filepath.Join(home, ".hermes", "kanban", "boards"))
	return err == nil && kanban.IsDir() && kanban.Mode()&os.ModeSymlink == 0
}

func validateInput(input model.FilingInput, protected []string) (model.Brief, error) {
	approved, err := time.Parse(time.RFC3339Nano, input.ApprovedAt)
	if input.SchemaVersion != "meeting-filing/v1" || !referencePattern.MatchString(input.Reference) || (input.ApprovedBy != "gary" && input.ApprovedBy != "austin") || err != nil || !strings.HasSuffix(input.ApprovedAt, "Z") || approved.UTC().Format(time.RFC3339Nano) != input.ApprovedAt || !digestPattern.MatchString(input.BriefDigest) {
		return model.Brief{}, errors.New("invalid")
	}
	digest := sha256.Sum256(input.Brief)
	if hex.EncodeToString(digest[:]) != input.BriefDigest {
		return model.Brief{}, errors.New("invalid")
	}
	var brief model.Brief
	decoder := json.NewDecoder(bytes.NewReader(input.Brief))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&brief) != nil {
		return model.Brief{}, errors.New("invalid")
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return model.Brief{}, errors.New("invalid")
	}
	if !model.ValidateBrief(brief, protected) {
		return model.Brief{}, errors.New("invalid")
	}
	return brief, nil
}

func loadLedger(path string) (map[string]model.FilingResult, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, errors.New("ledger_unavailable")
	}
	raw, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		ledger := map[string]model.FilingResult{}
		if err := persistLedger(path, ledger); err != nil {
			return nil, err
		}
		return ledger, nil
	}
	if err != nil || len(raw) > 16<<20 {
		return nil, errors.New("ledger_unavailable")
	}
	var ledger map[string]model.FilingResult
	if json.Unmarshal(raw, &ledger) != nil || ledger == nil {
		return nil, errors.New("ledger_invalid")
	}
	return ledger, nil
}
func persistLedger(path string, ledger map[string]model.FilingResult) error {
	raw, err := json.Marshal(ledger)
	if err != nil || len(raw) > 16<<20 {
		return errors.New("ledger_invalid")
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), ".ledger-*")
	if err != nil {
		return errors.New("ledger_unavailable")
	}
	name := temporary.Name()
	defer os.Remove(name)
	if temporary.Chmod(0o600) != nil {
		return errors.New("ledger_unavailable")
	}
	if _, err := temporary.Write(append(raw, '\n')); err != nil || temporary.Sync() != nil || temporary.Close() != nil || os.Rename(name, path) != nil {
		return errors.New("ledger_unavailable")
	}
	return nil
}
func constant(first, second string) bool {
	return len(first) == len(second) && subtle.ConstantTimeCompare([]byte(first), []byte(second)) == 1
}
func writeError(response http.ResponseWriter, status int, code, message string) {
	response.WriteHeader(status)
	_ = json.NewEncoder(response).Encode(map[string]any{"error": map[string]string{"code": code, "message": message}})
}
