package transport

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func jsonResponse(status int, body string) *http.Response {
	return &http.Response{
		StatusCode: status,
		Header:     make(http.Header),
		Body:       io.NopCloser(strings.NewReader(body)),
	}
}

func TestAgentMailListAndDraftContracts(t *testing.T) {
	requests := make([]map[string]any, 0)
	client := NewAgentMailClient("https://agentmail.test", "test-key", "titus-inbox", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Header.Get("Authorization") != "Bearer test-key" {
			t.Fatal("missing bearer authentication")
		}
		switch {
		case request.Method == http.MethodGet && strings.HasSuffix(request.URL.Path, "/messages"):
			if request.URL.Query().Get("include_blocked") != "true" || request.URL.Query().Get("include_unauthenticated") != "true" {
				t.Fatal("required inbox visibility flags missing")
			}
			return jsonResponse(200, `{"messages":[{"message_id":"m-1"}]}`), nil
		case request.Method == http.MethodPost && strings.HasSuffix(request.URL.Path, "/messages/m-1/draft-reply"):
			var payload map[string]any
			_ = json.NewDecoder(request.Body).Decode(&payload)
			requests = append(requests, payload)
			return jsonResponse(200, `{"draft_id":"d-1","to":["garyb@timelesstechs.com"],"in_reply_to":"m-1","text":"Hello"}`), nil
		case request.Method == http.MethodPost && strings.HasSuffix(request.URL.Path, "/drafts"):
			var payload map[string]any
			_ = json.NewDecoder(request.Body).Decode(&payload)
			requests = append(requests, payload)
			return jsonResponse(200, `{"draft_id":"d-2","to":["austin@example.com"],"subject":"Notice","text":"Review"}`), nil
		default:
			return jsonResponse(404, `{}`), nil
		}
	})
	if _, err := client.ListMessages("", 20); err != nil {
		t.Fatal(err)
	}
	if _, err := client.CreateDraft(CreateDraftRequest{InReplyTo: "m-1", Text: "Hello", ClientID: "client-1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.CreateDraft(CreateDraftRequest{To: []string{"austin@example.com"}, Subject: "Notice", Text: "Review", ClientID: "client-2"}); err != nil {
		t.Fatal(err)
	}
	if len(requests) != 2 || requests[0]["client_id"] != "client-1" || requests[0]["in_reply_to"] != nil ||
		requests[1]["client_id"] != "client-2" {
		t.Fatalf("unexpected draft request: %#v", requests)
	}
}

func TestAgentMailSendUsesStableIdempotencyKey(t *testing.T) {
	client := NewAgentMailClient("https://agentmail.test", "key", "inbox", time.Second)
	keys := make([]string, 0, 2)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		keys = append(keys, request.Header.Get("Idempotency-Key"))
		return jsonResponse(http.StatusOK, `{"message_id":"sent-1","thread_id":"thread-1"}`), nil
	})
	for range 2 {
		result, err := client.SendDraft("draft-1")
		if err != nil || result.MessageID != "sent-1" {
			t.Fatalf("send failed: %#v %v", result, err)
		}
	}
	if len(keys) != 2 || keys[0] == "" || keys[0] != keys[1] {
		t.Fatalf("unstable idempotency keys: %#v", keys)
	}
}

func TestAgentMailReplyUsesStableIdempotencyKeyAndVisibleBodies(t *testing.T) {
	client := NewAgentMailClient("https://agentmail.test", "key", "inbox", time.Second)
	keys := make([]string, 0, 2)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if !strings.HasSuffix(request.URL.Path, "/messages/m-1/reply") {
			t.Fatalf("unexpected reply path: %s", request.URL.Path)
		}
		keys = append(keys, request.Header.Get("Idempotency-Key"))
		var payload map[string]string
		_ = json.NewDecoder(request.Body).Decode(&payload)
		if payload["text"] != "Visible reply" || !strings.Contains(payload["html"], "Visible reply") {
			t.Fatalf("reply did not contain text and HTML bodies: %#v", payload)
		}
		return jsonResponse(http.StatusOK, `{"message_id":"sent-1","thread_id":"thread-1"}`), nil
	})
	for range 2 {
		if _, err := client.Reply("m-1", "Visible reply"); err != nil {
			t.Fatal(err)
		}
	}
	if len(keys) != 2 || keys[0] == "" || keys[0] != keys[1] {
		t.Fatalf("unstable reply idempotency keys: %#v", keys)
	}
}

func TestProviderErrorCodeNeverIncludesProviderInput(t *testing.T) {
	client := NewAgentMailClient("https://agentmail.test", "key", "inbox", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusBadRequest, `{"detail":[{"type":"missing","loc":["body","in_reply_to"],"input":"SECRET BODY"}]}`), nil
	})
	_, err := client.CreateDraft(CreateDraftRequest{Text: "reply"})
	if err == nil || ErrorCode(err) != "http_400_body_in_reply_to_missing" || strings.Contains(err.Error(), "SECRET") {
		t.Fatalf("unsafe or incomplete provider error: %v", err)
	}
}

func TestOpenRouterRequestHasNoToolsOrMemory(t *testing.T) {
	var payload map[string]any
	client := NewOpenRouterClient("https://openrouter.test", "router-key", "provider/model", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		_ = json.NewDecoder(request.Body).Decode(&payload)
		return jsonResponse(200, `{"choices":[{"message":{"content":"Safe reply"}}]}`), nil
	})
	reply, err := client.GenerateReply("Subject", "untrusted email")
	if err != nil || reply != "Safe reply" {
		t.Fatalf("model call failed: %q %v", reply, err)
	}
	for _, forbidden := range []string{"tools", "tool_choice", "memory", "attachments"} {
		if _, ok := payload[forbidden]; ok {
			t.Fatalf("forbidden model field present: %s", forbidden)
		}
	}
	if payload["max_tokens"].(float64) != 300 || len(payload["messages"].([]any)) != 2 {
		t.Fatalf("unexpected bounded payload: %#v", payload)
	}
}

func TestHTTPResponseLimit(t *testing.T) {
	client := NewAgentMailClient("https://agentmail.test", "key", "inbox", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(200, strings.Repeat("x", maxResponseBytes+1)), nil
	})
	if _, err := client.ListMessages("", 20); err == nil {
		t.Fatal("oversized response accepted")
	}
}
