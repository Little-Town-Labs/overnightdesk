package filer

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
)

const ServiceOrigin = "http://titus-meeting-filer:8090"
const MaxResponseBytes = int64(64 * 1024)

var digestPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)
var referencePattern = regexp.MustCompile(`^MB-[A-Z2-7]{12}$`)

type ProjectRoute struct {
	CanonicalProject string `json:"canonicalProject"`
	NoteDirectory    string `json:"noteDirectory"`
	KanbanBoard      string `json:"kanbanBoard"`
	ConfigDigest     string `json:"configDigest"`
}
type Request struct {
	SchemaVersion string         `json:"schemaVersion"`
	Reference     string         `json:"reference"`
	ApprovedBy    string         `json:"approvedBy"`
	ApprovedAt    string         `json:"approvedAt"`
	BriefDigest   string         `json:"briefDigest"`
	Brief         analyzer.Brief `json:"brief"`
	ProjectRoute  *ProjectRoute  `json:"projectRoute"`
}
type Result struct {
	SchemaVersion    string   `json:"schemaVersion"`
	Reference        string   `json:"reference"`
	RequestDigest    string   `json:"requestDigest"`
	NoteRelativePath string   `json:"noteRelativePath"`
	NoteDigest       string   `json:"noteDigest"`
	NoteKey          string   `json:"noteKey"`
	Board            string   `json:"board"`
	TriageTaskKey    *string  `json:"triageTaskKey"`
	ActionTaskKeys   []string `json:"actionTaskKeys"`
	FiledAt          string   `json:"filedAt"`
}
type Client struct {
	bearer string
	http   *http.Client
}

func NewClient(origin, bearer string, source *http.Client) (*Client, error) {
	if origin != ServiceOrigin || len(bearer) < 32 || len(bearer) > 4096 || strings.ContainsAny(bearer, "\r\n") || source == nil {
		return nil, errors.New("filer_config_invalid")
	}
	clone := *source
	clone.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{bearer: bearer, http: &clone}, nil
}

func (client *Client) File(ctx context.Context, input Request) (Result, error) {
	if input.SchemaVersion != "meeting-filing/v1" || !referencePattern.MatchString(input.Reference) || (input.ApprovedBy != "gary" && input.ApprovedBy != "austin") || !digestPattern.MatchString(input.BriefDigest) {
		return Result{}, errors.New("filer_request_invalid")
	}
	body, err := json.Marshal(input)
	if err != nil || len(body) > 128*1024 {
		return Result{}, errors.New("filer_request_invalid")
	}
	digest := sha256.Sum256(body)
	digestHex := hex.EncodeToString(digest[:])
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, ServiceOrigin+"/v1/filings", bytes.NewReader(body))
	if err != nil {
		return Result{}, errors.New("filer_request_invalid")
	}
	request.Header.Set("Authorization", "Bearer "+client.bearer)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Idempotency-Key", digestHex)
	response, err := client.http.Do(request)
	if err != nil {
		return Result{}, errors.New("filer_ambiguous")
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, MaxResponseBytes+1))
	if err != nil || int64(len(raw)) > MaxResponseBytes {
		return Result{}, errors.New("filer_response_invalid")
	}
	if response.StatusCode != http.StatusOK && response.StatusCode != http.StatusCreated {
		return Result{}, errors.New("filer_rejected")
	}
	var result Result
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&result) != nil || result.SchemaVersion != "meeting-filing-result/v1" || result.Reference != input.Reference || result.RequestDigest != digestHex || !digestPattern.MatchString(result.NoteDigest) || !validFilingResult(result, input) {
		return Result{}, errors.New("filer_response_invalid")
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Result{}, errors.New("filer_response_invalid")
	}
	return result, nil
}

func validFilingResult(result Result, input Request) bool {
	board, prefix := "meeting-triage", "00-inbox/meetings/"
	if input.ProjectRoute != nil {
		board, prefix = input.ProjectRoute.KanbanBoard, input.ProjectRoute.NoteDirectory+"/"
	}
	filed, err := time.Parse(time.RFC3339Nano, result.FiledAt)
	if err != nil || filed.UTC().Format(time.RFC3339Nano) != result.FiledAt || result.Board != board || !strings.HasPrefix(result.NoteRelativePath, prefix) || !strings.HasSuffix(result.NoteRelativePath, "-"+input.Reference+".md") || result.NoteKey != filingItemKey(input.Reference, input.BriefDigest, "note", 0) {
		return false
	}
	expected := make([]string, 0, len(input.Brief.ActionItems)+len(input.Brief.ExternalCommitments))
	for index := range input.Brief.ActionItems {
		expected = append(expected, filingItemKey(input.Reference, input.BriefDigest, "action", index))
	}
	for index := range input.Brief.ExternalCommitments {
		expected = append(expected, filingItemKey(input.Reference, input.BriefDigest, "commitment", index))
	}
	if len(expected) != len(result.ActionTaskKeys) {
		return false
	}
	seen := map[string]struct{}{}
	for index, key := range result.ActionTaskKeys {
		if key != expected[index] {
			return false
		}
		if _, ok := seen[key]; ok {
			return false
		}
		seen[key] = struct{}{}
	}
	if input.ProjectRoute == nil {
		want := filingItemKey(input.Reference, input.BriefDigest, "triage", 0)
		return result.TriageTaskKey != nil && *result.TriageTaskKey == want
	}
	return result.TriageTaskKey == nil
}

func filingItemKey(reference, briefDigest, kind string, index int) string {
	digest := sha256.Sum256([]byte("meeting-filing-item/v1\x00" + reference + "\x00" + briefDigest + "\x00" + kind + "\x00" + fmt.Sprintf("%06d", index)))
	return hex.EncodeToString(digest[:])
}
