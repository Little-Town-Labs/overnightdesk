package orchestrator

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
)

const maxResponseBytes = int64(1_048_576)

var (
	runIDPattern     = regexp.MustCompile(`^run_[0-9a-f]{32}$`)
	sessionIDPattern = regexp.MustCompile(`^[A-Za-z0-9_.:-]{1,160}$`)
)

// Hermes's session API reports the generic runtime persona as "hermes-agent"
// even when the immutable Titus config routes the parent and delegated child
// to the approved Sol/Luna models. deploy-aegis.sh verifies those effective
// routes before activation; the API's generic value is therefore an accepted
// runtime readback, not a request-scoped model selection.
const observedRuntimeModel = "hermes-agent"

type safeError struct{ code string }

func (err safeError) Error() string    { return err.code }
func (err safeError) SafeCode() string { return err.code }

func SafeCode(err error) string {
	var coded interface{ SafeCode() string }
	if errors.As(err, &coded) {
		return coded.SafeCode()
	}
	return "orchestrator_unavailable"
}

type Client struct {
	token string
	http  *http.Client
}

type InspectionBinding struct {
	QA             analyzer.QABinding
	ScreenedDigest string
}

type Inspection struct {
	Status             string
	DelegationCount    int
	ChildSessionIDs    []string
	ChildRouteVerified bool
	ChildDraftDigest   string
	QA                 analyzer.QAResult
}

func NewClient(origin, token string, source *http.Client) (*Client, error) {
	if origin != ServiceOrigin || len(token) < 32 || len(token) > 4096 || strings.ContainsAny(token, "\r\n") || source == nil {
		return nil, safeError{code: "orchestrator_config_invalid"}
	}
	clone := *source
	clone.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &Client{token: token, http: &clone}, nil
}

func (client *Client) EnsureSession(ctx context.Context, plan Plan) error {
	if !validPlan(plan) {
		return safeError{code: "orchestrator_request_invalid"}
	}
	status, raw, err := client.request(ctx, http.MethodPost, "/api/sessions", plan.createBody, true)
	if err != nil {
		return err
	}
	if status == http.StatusConflict {
		status, raw, err = client.request(ctx, http.MethodGet, "/api/sessions/"+url.PathEscape(plan.SessionID), nil, false)
		if err != nil {
			return err
		}
	}
	if status != http.StatusCreated && status != http.StatusOK {
		return safeError{code: "orchestrator_session_unavailable"}
	}
	session, parseErr := decodeSession(raw)
	if parseErr != nil || session.ID != plan.SessionID || session.Title != plan.Title || session.Source != "api_server" || !parentModelReadbackVerified(session.Model) || !session.HasSystemPrompt || session.HasModelConfig {
		return safeError{code: "orchestrator_session_conflict"}
	}
	return nil
}

func (client *Client) SubmitRun(ctx context.Context, plan Plan) (string, error) {
	if !validPlan(plan) {
		return "", safeError{code: "orchestrator_request_invalid"}
	}
	status, raw, err := client.request(ctx, http.MethodPost, "/v1/runs", plan.runBody, true)
	if err != nil {
		return "", err
	}
	var response struct {
		RunID  string `json:"run_id"`
		Status string `json:"status"`
	}
	if status != http.StatusAccepted || json.Unmarshal(raw, &response) != nil || !runIDPattern.MatchString(response.RunID) || response.Status != "started" {
		return "", safeError{code: "orchestrator_run_unavailable"}
	}
	return response.RunID, nil
}

func validPlan(plan Plan) bool {
	return sessionIDPattern.MatchString(plan.SessionID) && plan.Title != "" && digestPattern.MatchString(plan.CreateBodyDigest) && digestPattern.MatchString(plan.RunBodyDigest) && digestPattern.MatchString(plan.ScreenedDigest) && len(plan.createBody) > 0 && len(plan.runBody) > 0
}

type sessionSummary struct {
	ID              string  `json:"id"`
	Source          string  `json:"source"`
	Model           string  `json:"model"`
	Title           string  `json:"title"`
	ParentSessionID string  `json:"parent_session_id"`
	StartedAt       float64 `json:"started_at"`
	HasSystemPrompt bool    `json:"has_system_prompt"`
	HasModelConfig  bool    `json:"has_model_config"`
}

type sessionMessage struct {
	Role      string          `json:"role"`
	Content   string          `json:"content"`
	ToolCalls json.RawMessage `json:"tool_calls"`
}

func decodeSession(raw []byte) (sessionSummary, error) {
	var response struct {
		Session sessionSummary `json:"session"`
	}
	if json.Unmarshal(raw, &response) != nil {
		return sessionSummary{}, safeError{code: "orchestrator_session_invalid"}
	}
	return response.Session, nil
}

func (client *Client) session(ctx context.Context, sessionID string) (sessionSummary, error) {
	status, raw, err := client.request(ctx, http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID), nil, false)
	if err != nil {
		return sessionSummary{}, err
	}
	if status != http.StatusOK {
		return sessionSummary{}, safeError{code: "orchestrator_session_invalid"}
	}
	return decodeSession(raw)
}

type messageList struct {
	Data []sessionMessage `json:"data"`
}

func (client *Client) Inspect(ctx context.Context, parentID string, binding InspectionBinding, protected []string) (Inspection, error) {
	if !sessionIDPattern.MatchString(parentID) || !digestPattern.MatchString(binding.ScreenedDigest) {
		return Inspection{}, safeError{code: "orchestrator_request_invalid"}
	}
	parent, err := client.session(ctx, parentID)
	expectedTitle := strings.Replace(parentID, "meeting-", "meeting-brief-", 1)
	if err != nil || parent.ID != parentID || parent.Title != expectedTitle || parent.Source != "api_server" || !parentModelReadbackVerified(parent.Model) || !parent.HasSystemPrompt {
		return Inspection{}, safeError{code: "orchestrator_session_conflict"}
	}
	parentMessages, err := client.messages(ctx, parentID)
	if err != nil {
		return Inspection{}, err
	}
	delegations, err := auditDelegations(parentMessages, binding.ScreenedDigest)
	if err != nil {
		return Inspection{}, err
	}
	inspection := Inspection{Status: "pending", DelegationCount: delegations}
	if delegations == 0 {
		return inspection, nil
	}
	children, err := client.children(ctx, parentID)
	if err != nil {
		return Inspection{}, err
	}
	if len(children) > delegations || len(children) > 2 {
		return Inspection{}, safeError{code: "orchestrator_child_mismatch"}
	}
	for _, child := range children {
		if child.ParentSessionID != parentID || !childModelReadbackVerified(child.Model) || !sessionIDPattern.MatchString(child.ID) || child.StartedAt <= 0 {
			return Inspection{}, safeError{code: "orchestrator_child_mismatch"}
		}
		inspection.ChildSessionIDs = append(inspection.ChildSessionIDs, child.ID)
	}
	inspection.ChildRouteVerified = len(children) > 0
	qaRaw, hasQA := latestQAContent(parentMessages)
	if !hasQA || len(children) < delegations {
		return inspection, nil
	}
	binding.QA.DelegationCount = delegations
	var latestChild *analyzer.Validated
	latestMessages, err := client.messages(ctx, children[len(children)-1].ID)
	if err != nil {
		return Inspection{}, err
	}
	if childRaw, ok := latestAssistantContent(latestMessages); ok {
		validated, childErr := analyzer.ParseAndValidate([]byte(childRaw), protected)
		if childErr == nil {
			latestChild = &validated
			inspection.ChildDraftDigest = validated.Digest
		}
	}
	qa, err := analyzer.ParseQAEnvelope([]byte(qaRaw), binding.QA, protected, latestChild)
	if err != nil {
		return Inspection{}, err
	}
	inspection.Status = qa.Status
	inspection.QA = qa
	return inspection, nil
}

func parentModelReadbackVerified(model string) bool {
	return model == ApprovedParentModel || model == observedRuntimeModel
}

func childModelReadbackVerified(model string) bool {
	return model == ApprovedChildModel || model == observedRuntimeModel
}

func auditDelegations(messages []sessionMessage, screenedDigest string) (int, error) {
	count := 0
	for _, message := range messages {
		if len(message.ToolCalls) == 0 || bytes.Equal(bytes.TrimSpace(message.ToolCalls), []byte("null")) {
			continue
		}
		if message.Role != "assistant" {
			return 0, safeError{code: "orchestrator_tool_audit_failed"}
		}
		var calls []struct {
			Type     string `json:"type"`
			Function struct {
				Name      string          `json:"name"`
				Arguments json.RawMessage `json:"arguments"`
			} `json:"function"`
		}
		if json.Unmarshal(message.ToolCalls, &calls) != nil || len(calls) == 0 {
			return 0, safeError{code: "orchestrator_tool_audit_failed"}
		}
		for _, call := range calls {
			if call.Type != "function" || call.Function.Name != "delegate_task" {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
			var encoded string
			if json.Unmarshal(call.Function.Arguments, &encoded) != nil {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
			var arguments struct {
				Goal    string `json:"goal"`
				Context string `json:"context"`
				Role    string `json:"role"`
			}
			decoder := json.NewDecoder(strings.NewReader(encoded))
			decoder.DisallowUnknownFields()
			if decoder.Decode(&arguments) != nil || arguments.Goal != FixedChildGoal || arguments.Role != "leaf" || !strings.HasPrefix(arguments.Context, SafeChildPrefix) {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
			var trailing any
			if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
			delimiter := strings.LastIndex(arguments.Context, transcriptDelimiter)
			if delimiter < len(SafeChildPrefix) {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
			transcript := arguments.Context[delimiter+len(transcriptDelimiter):]
			digest := sha256.Sum256([]byte(transcript))
			if hex.EncodeToString(digest[:]) != screenedDigest {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
			count++
			if count > 2 {
				return 0, safeError{code: "orchestrator_tool_audit_failed"}
			}
		}
	}
	return count, nil
}

func latestQAContent(messages []sessionMessage) (string, bool) {
	latestContent := -1
	latestToolCall := -1
	for index, message := range messages {
		if len(message.ToolCalls) > 0 && !bytes.Equal(bytes.TrimSpace(message.ToolCalls), []byte("null")) {
			latestToolCall = index
		}
		if message.Role == "assistant" && strings.TrimSpace(message.Content) != "" {
			latestContent = index
		}
	}
	if latestContent <= latestToolCall || latestContent < 0 {
		return "", false
	}
	content := strings.TrimSpace(messages[latestContent].Content)
	if strings.Contains(content, analyzer.QASchemaVersion) {
		var marker struct {
			Status         string `json:"status"`
			SafeReasonCode string `json:"safeReasonCode"`
		}
		if json.Unmarshal([]byte(content), &marker) == nil && marker.Status == analyzer.QABlocked && marker.SafeReasonCode == "DELEGATION_PENDING" {
			return "", false
		}
		return content, true
	}
	return "", false
}

func latestAssistantContent(messages []sessionMessage) (string, bool) {
	for index := len(messages) - 1; index >= 0; index-- {
		if messages[index].Role == "assistant" && strings.TrimSpace(messages[index].Content) != "" {
			return strings.TrimSpace(messages[index].Content), true
		}
	}
	return "", false
}

func (client *Client) messages(ctx context.Context, sessionID string) ([]sessionMessage, error) {
	status, raw, err := client.request(ctx, http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID)+"/messages", nil, false)
	if err != nil {
		return nil, err
	}
	var response messageList
	if status != http.StatusOK || json.Unmarshal(raw, &response) != nil || len(response.Data) > 256 {
		return nil, safeError{code: "orchestrator_session_invalid"}
	}
	return response.Data, nil
}

func (client *Client) children(ctx context.Context, parentID string) ([]sessionSummary, error) {
	children := []sessionSummary{}
	for page := 0; page < 5; page++ {
		values := url.Values{"limit": {"200"}, "offset": {itoa(page * 200)}, "include_children": {"true"}}
		path := "/api/sessions?" + values.Encode()
		status, raw, err := client.request(ctx, http.MethodGet, path, nil, false)
		if err != nil {
			return nil, err
		}
		var response struct {
			Data    []sessionSummary `json:"data"`
			HasMore bool             `json:"has_more"`
		}
		if status != http.StatusOK || json.Unmarshal(raw, &response) != nil || len(response.Data) > 200 {
			return nil, safeError{code: "orchestrator_session_invalid"}
		}
		for _, session := range response.Data {
			if session.ParentSessionID == parentID {
				children = append(children, session)
			}
		}
		if !response.HasMore {
			sort.Slice(children, func(i, j int) bool {
				if children[i].StartedAt == children[j].StartedAt {
					return children[i].ID < children[j].ID
				}
				return children[i].StartedAt < children[j].StartedAt
			})
			return children, nil
		}
	}
	return nil, safeError{code: "orchestrator_session_limit"}
}

func itoa(value int) string {
	if value == 0 {
		return "0"
	}
	digits := make([]byte, 0, 8)
	for value > 0 {
		digits = append(digits, byte('0'+value%10))
		value /= 10
	}
	for left, right := 0, len(digits)-1; left < right; left, right = left+1, right-1 {
		digits[left], digits[right] = digits[right], digits[left]
	}
	return string(digits)
}

func (client *Client) Cleanup(ctx context.Context, parentID string, childIDs []string) error {
	if !sessionIDPattern.MatchString(parentID) || len(childIDs) > 2 {
		return safeError{code: "orchestrator_request_invalid"}
	}
	verifiedChildren := make([]string, 0, len(childIDs))
	seen := map[string]bool{}
	for _, childID := range childIDs {
		if !sessionIDPattern.MatchString(childID) {
			return safeError{code: "orchestrator_request_invalid"}
		}
		if !seen[childID] {
			seen[childID] = true
			verifiedChildren = append(verifiedChildren, childID)
		}
	}
	discovered, err := client.children(ctx, parentID)
	if err != nil {
		return err
	}
	for _, child := range discovered {
		if child.ParentSessionID != parentID || !sessionIDPattern.MatchString(child.ID) {
			return safeError{code: "orchestrator_cleanup_failed"}
		}
		if !seen[child.ID] {
			seen[child.ID] = true
			verifiedChildren = append(verifiedChildren, child.ID)
		}
	}
	status, _, err := client.request(ctx, http.MethodDelete, "/api/sessions/"+url.PathEscape(parentID), nil, false)
	if err != nil {
		return err
	}
	if status != http.StatusOK && status != http.StatusNotFound {
		return safeError{code: "orchestrator_cleanup_failed"}
	}
	for _, sessionID := range append([]string{parentID}, verifiedChildren...) {
		status, raw, getErr := client.request(ctx, http.MethodGet, "/api/sessions/"+url.PathEscape(sessionID), nil, false)
		if getErr != nil {
			return getErr
		}
		if status != http.StatusNotFound || !isSessionNotFound(raw) {
			return safeError{code: "orchestrator_cleanup_failed"}
		}
	}
	return nil
}

func isSessionNotFound(raw []byte) bool {
	var response struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	return json.Unmarshal(raw, &response) == nil && response.Error.Code == "session_not_found"
}

func (client *Client) request(ctx context.Context, method, path string, body []byte, idempotent bool) (int, []byte, error) {
	request, err := http.NewRequestWithContext(ctx, method, ServiceOrigin+path, bytes.NewReader(body))
	if err != nil {
		return 0, nil, safeError{code: "orchestrator_request_invalid"}
	}
	request.Header.Set("Authorization", "Bearer "+client.token)
	request.Header.Set("Accept", "application/json")
	if len(body) > 0 {
		request.Header.Set("Content-Type", "application/json")
	}
	if idempotent {
		digest := sha256.Sum256(body)
		request.Header.Set("Idempotency-Key", hex.EncodeToString(digest[:]))
	}
	response, err := client.http.Do(request)
	if err != nil {
		return 0, nil, safeError{code: "orchestrator_unavailable"}
	}
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil || int64(len(raw)) > maxResponseBytes {
		return 0, nil, safeError{code: "orchestrator_response_invalid"}
	}
	if response.StatusCode >= 300 && response.StatusCode != http.StatusConflict && response.StatusCode != http.StatusNotFound {
		return response.StatusCode, raw, safeError{code: "orchestrator_unavailable"}
	}
	return response.StatusCode, raw, nil
}
