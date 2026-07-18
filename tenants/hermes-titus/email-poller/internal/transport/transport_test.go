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

func TestAgentMailListAndMessageContracts(t *testing.T) {
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
		case request.Method == http.MethodGet && strings.HasSuffix(request.URL.Path, "/messages/m-1"):
			return jsonResponse(200, `{"message_id":"m-1","inbox_id":"titus-inbox","extracted_text":"clean extraction target"}`), nil
		default:
			return jsonResponse(404, `{}`), nil
		}
	})
	if _, err := client.ListMessages("", 20); err != nil {
		t.Fatal(err)
	}
	message, err := client.GetMessage("m-1")
	if err != nil || message.BodyExcerpt(100) != "clean extraction target" {
		t.Fatal(err)
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
		if _, err := client.Reply("m-1", "Visible reply", "final-clean-1"); err != nil {
			t.Fatal(err)
		}
	}
	if len(keys) != 2 || keys[0] == "" || keys[0] != keys[1] {
		t.Fatalf("unstable reply idempotency keys: %#v", keys)
	}
}

func TestAgentMailReplyRequiresProviderMessageIdentity(t *testing.T) {
	client := NewAgentMailClient("https://agentmail.test", "key", "inbox", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusOK, `{}`), nil
	})
	if _, err := client.Reply("m-1", "Visible reply", "final-clean-1"); err == nil {
		t.Fatal("empty provider reply response accepted")
	}
}

func TestProviderErrorCodeNeverIncludesProviderInput(t *testing.T) {
	client := NewAgentMailClient("https://agentmail.test", "key", "inbox", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusBadRequest, `{"detail":[{"type":"missing","loc":["body","in_reply_to"],"input":"SECRET BODY"}]}`), nil
	})
	_, err := client.GetMessage("m-1")
	if err == nil || ErrorCode(err) != "http_400_body_in_reply_to_missing" || strings.Contains(err.Error(), "SECRET") {
		t.Fatalf("unsafe or incomplete provider error: %v", err)
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

func TestHermesRunContractUsesSessionAndIdempotencyHeaders(t *testing.T) {
	client := NewHermesClient("http://hermes-titus:8642", "hermes-key", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method != http.MethodPost || request.URL.Path != "/v1/runs" {
			t.Fatalf("unexpected request: %s %s", request.Method, request.URL.Path)
		}
		if request.Header.Get("Authorization") != "Bearer hermes-key" ||
			request.Header.Get("X-Hermes-Session-Key") != "email:thread-1" ||
			request.Header.Get("Idempotency-Key") != "clean:clean-1" {
			t.Fatalf("missing Hermes headers: %#v", request.Header)
		}
		var payload map[string]string
		_ = json.NewDecoder(request.Body).Decode(&payload)
		if payload["input"] != "clean content" || payload["session_id"] != "email:thread-1" {
			t.Fatalf("unexpected payload: %#v", payload)
		}
		return jsonResponse(http.StatusAccepted, `{"run_id":"run_0123456789abcdef0123456789abcdef","status":"started"}`), nil
	})
	run, err := client.SubmitRun("clean content", "email:thread-1", "email:thread-1", "clean:clean-1")
	if err != nil || run.RunID != "run_0123456789abcdef0123456789abcdef" {
		t.Fatalf("submit failed: %#v %v", run, err)
	}
}

func TestHermesRunSubmissionRejectsTerminalStatus(t *testing.T) {
	client := NewHermesClient("http://hermes-titus:8642", "key", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusAccepted, `{"run_id":"run_0123456789abcdef0123456789abcdef","status":"completed"}`), nil
	})
	if _, err := client.SubmitRun("clean", "session", "session", "clean:1"); err == nil {
		t.Fatal("terminal submission status accepted")
	}
}

func TestHermesCapabilitiesRequireRunsStatusAndApproval(t *testing.T) {
	client := NewHermesClient("http://hermes-titus:8642", "key", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusOK, `{"object":"hermes.api_server.capabilities","features":{"run_submission":true,"run_status":true,"run_approval_response":true}}`), nil
	})
	if err := client.CheckCapabilities(); err != nil {
		t.Fatal(err)
	}

	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusOK, `{"object":"hermes.api_server.capabilities","features":{"run_submission":true,"run_status":true,"run_approval_response":false}}`), nil
	})
	if err := client.CheckCapabilities(); err == nil {
		t.Fatal("incomplete capabilities were accepted")
	}
}

func TestHermesRunStatusRecognizesApprovalWaitAndCompletion(t *testing.T) {
	client := NewHermesClient("http://hermes-titus:8642", "key", time.Second)
	statuses := []string{"waiting_for_approval", "completed"}
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		status := statuses[0]
		statuses = statuses[1:]
		return jsonResponse(http.StatusOK, `{"object":"hermes.run","run_id":"run_0123456789abcdef0123456789abcdef","status":"`+status+`","output":"answer"}`), nil
	})
	for range 2 {
		if _, err := client.GetRun("run_0123456789abcdef0123456789abcdef"); err != nil {
			t.Fatal(err)
		}
	}
}

func TestHermesRunRejectsMalformedRunIdentity(t *testing.T) {
	client := NewHermesClient("http://hermes-titus:8642", "key", time.Second)
	client.api.client.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		return jsonResponse(http.StatusAccepted, `{"object":"hermes.run","run_id":"../../unsafe","status":"queued"}`), nil
	})
	if _, err := client.SubmitRun("clean", "session", "session", "clean:1"); err == nil {
		t.Fatal("malformed run identity accepted")
	}
}
