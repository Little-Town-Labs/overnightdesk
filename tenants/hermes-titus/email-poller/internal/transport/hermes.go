package transport

import (
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"time"
)

var hermesRunIDPattern = regexp.MustCompile(`^run_[0-9a-f]{32}$`)

type HermesRun struct {
	Object    string `json:"object"`
	RunID     string `json:"run_id"`
	SessionID string `json:"session_id"`
	Status    string `json:"status"`
	Output    string `json:"output"`
	Error     string `json:"error"`
}

type HermesClient struct {
	api jsonClient
}

type HermesCapabilities struct {
	Object   string `json:"object"`
	Features struct {
		RunSubmission       bool `json:"run_submission"`
		RunStatus           bool `json:"run_status"`
		RunApprovalResponse bool `json:"run_approval_response"`
	} `json:"features"`
}

func NewHermesClient(baseURL, token string, timeout time.Duration) *HermesClient {
	return &HermesClient{api: newJSONClient(baseURL, token, timeout)}
}

func (client *HermesClient) CheckCapabilities() error {
	var result HermesCapabilities
	if err := client.api.do(http.MethodGet, "/v1/capabilities", nil, &result); err != nil {
		return err
	}
	if result.Object != "hermes.api_server.capabilities" || !result.Features.RunSubmission ||
		!result.Features.RunStatus || !result.Features.RunApprovalResponse {
		return errors.New("Hermes API lacks required run capabilities")
	}
	return nil
}

func (client *HermesClient) SubmitRun(input, sessionID, sessionKey, idempotency string) (HermesRun, error) {
	payload := struct {
		Input     string `json:"input"`
		SessionID string `json:"session_id"`
	}{Input: input, SessionID: sessionID}
	var result HermesRun
	err := client.api.doWithHeaders(http.MethodPost, "/v1/runs", payload, &result, map[string]string{
		"X-Hermes-Session-Key": sessionKey,
		"Idempotency-Key":      idempotency,
	})
	if err != nil {
		return HermesRun{}, err
	}
	if !hermesRunIDPattern.MatchString(result.RunID) || !submissionHermesStatus(result.Status) {
		return HermesRun{}, errors.New("invalid Hermes run response")
	}
	return result, nil
}

func (client *HermesClient) GetRun(runID string) (HermesRun, error) {
	if !hermesRunIDPattern.MatchString(runID) {
		return HermesRun{}, errors.New("invalid Hermes run identity")
	}
	var result HermesRun
	err := client.api.do(http.MethodGet, "/v1/runs/"+url.PathEscape(runID), nil, &result)
	if err != nil {
		return HermesRun{}, err
	}
	if result.RunID != runID || !knownHermesStatus(result.Status) {
		return HermesRun{}, errors.New("invalid Hermes run status response")
	}
	return result, nil
}

func submissionHermesStatus(status string) bool {
	return status == "started" || activeHermesStatus(status)
}

func activeHermesStatus(status string) bool {
	return status == "queued" || status == "running" || status == "waiting_for_approval"
}

func knownHermesStatus(status string) bool {
	return activeHermesStatus(status) || status == "completed" || status == "failed" ||
		status == "cancelled" || status == "stopping"
}
