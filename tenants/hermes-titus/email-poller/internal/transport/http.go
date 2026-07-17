package transport

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const maxResponseBytes = 2_000_000

type APIError struct {
	Status int
	Code   string
}

func (err *APIError) Error() string {
	return fmt.Sprintf("provider request failed: %s", err.Code)
}

type jsonClient struct {
	baseURL string
	token   string
	client  *http.Client
}

func newJSONClient(baseURL, token string, timeout time.Duration) jsonClient {
	return jsonClient{
		baseURL: strings.TrimRight(baseURL, "/"), token: token,
		client: &http.Client{Timeout: timeout},
	}
}

func (client jsonClient) do(method, path string, requestBody, responseBody any) error {
	return client.doWithHeaders(method, path, requestBody, responseBody, nil)
}

func (client jsonClient) doWithHeaders(method, path string, requestBody, responseBody any, headers map[string]string) error {
	var body io.Reader
	if requestBody != nil {
		raw, err := json.Marshal(requestBody)
		if err != nil {
			return err
		}
		body = bytes.NewReader(raw)
	}
	request, err := http.NewRequest(method, client.baseURL+path, body)
	if err != nil {
		return err
	}
	request.Header.Set("Authorization", "Bearer "+client.token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "overnightdesk-titus-email-poller/1")
	for key, value := range headers {
		request.Header.Set(key, value)
	}
	response, err := client.client.Do(request)
	if err != nil {
		return &APIError{Code: "transport_error"}
	}
	defer response.Body.Close()
	limited := io.LimitReader(response.Body, maxResponseBytes+1)
	raw, err := io.ReadAll(limited)
	if err != nil {
		return &APIError{Code: "read_error"}
	}
	if len(raw) > maxResponseBytes {
		return &APIError{Code: "response_too_large"}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return &APIError{Status: response.StatusCode, Code: providerErrorCode(response.StatusCode, raw)}
	}
	if responseBody == nil || len(raw) == 0 {
		return nil
	}
	if err := json.Unmarshal(raw, responseBody); err != nil {
		return &APIError{Code: "invalid_json"}
	}
	return nil
}

func ErrorCode(err error) string {
	var apiError *APIError
	if errors.As(err, &apiError) {
		return apiError.Code
	}
	return "internal_error"
}

func providerErrorCode(status int, raw []byte) string {
	code := fmt.Sprintf("http_%d", status)
	var envelope struct {
		Code  string `json:"code"`
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
		Detail []struct {
			Type string `json:"type"`
			Loc  []any  `json:"loc"`
		} `json:"detail"`
	}
	if json.Unmarshal(raw, &envelope) != nil {
		return code
	}
	providerCode := envelope.Code
	if providerCode == "" {
		providerCode = envelope.Error.Code
	}
	if providerCode != "" {
		code += "_" + safeToken(providerCode)
	}
	if len(envelope.Detail) > 0 {
		location := make([]string, 0, len(envelope.Detail[0].Loc))
		for _, value := range envelope.Detail[0].Loc {
			if text, ok := value.(string); ok {
				location = append(location, safeToken(text))
			}
		}
		code += "_" + strings.Join(location, "_") + "_" + safeToken(envelope.Detail[0].Type)
	}
	return strings.Trim(code, "_")
}

func safeToken(value string) string {
	var result strings.Builder
	for _, character := range value {
		if result.Len() >= 64 {
			break
		}
		if character >= 'a' && character <= 'z' || character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' || strings.ContainsRune("._-", character) {
			result.WriteRune(character)
		} else {
			result.WriteByte('_')
		}
	}
	return strings.Trim(result.String(), "_")
}
