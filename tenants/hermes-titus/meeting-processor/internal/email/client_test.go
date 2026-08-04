package email

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func response(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func TestSendScreensThenSendsExactlyGaryAustinAndReadsBack(t *testing.T) {
	var calls []string
	var sent []byte
	httpClient := &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls = append(calls, request.Method+" "+request.URL.String())
		switch {
		case request.URL.String() == SecurityOrigin+"/check-outbound":
			raw, _ := io.ReadAll(request.Body)
			var envelope struct {
				Content string `json:"content"`
			}
			_ = json.Unmarshal(raw, &envelope)
			encoded, _ := json.Marshal(envelope.Content)
			return response(http.StatusOK, `{"allowed":true,"content":`+string(encoded)+`}`), nil
		case request.Method == http.MethodPost:
			if request.Header.Get("Idempotency-Key") == "" {
				t.Fatal("missing idempotency")
			}
			sent, _ = io.ReadAll(request.Body)
			return response(http.StatusOK, `{"message_id":"<msg-1@example>","thread_id":"thread-1"}`), nil
		case request.Method == http.MethodGet:
			readback := strings.TrimSuffix(string(sent), "}") + `,"message_id":"<msg-1@example>","thread_id":"thread-1","labels":["sent"],"created_at":"2026-08-04T12:00:00Z","headers":{}}`
			return response(http.StatusOK, readback), nil
		default:
			t.Fatalf("unexpected request %s", request.URL.String())
			return nil, nil
		}
	})}
	client, err := NewClient(SecurityOrigin, strings.Repeat("s", 32), AgentMailOrigin, strings.Repeat("a", 32), "titus@agentmail.to", [2]string{"gary@example.com", "austin@example.com"}, httpClient)
	if err != nil {
		t.Fatal(err)
	}
	delivery, err := client.Send(context.Background(), "MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "# Safe brief\n\nSource-derived summary.\n")
	if err != nil || delivery.RecipientSet != "gary+austin" || len(delivery.ProviderMessageIDDigest) != 64 {
		t.Fatalf("delivery=%#v err=%v", delivery, err)
	}
	if len(calls) != 3 || !strings.HasPrefix(calls[0], "POST "+SecurityOrigin) || !strings.HasPrefix(calls[1], "POST "+AgentMailOrigin) || !strings.HasPrefix(calls[2], "GET "+AgentMailOrigin) {
		t.Fatalf("ordering=%v", calls)
	}
	for _, requiredEmpty := range []string{`"cc":[]`, `"bcc":[]`, `"attachments":[]`, `"html":null`} {
		if !bytes.Contains(sent, []byte(requiredEmpty)) {
			t.Fatalf("missing explicit empty envelope field %s: %s", requiredEmpty, sent)
		}
	}
	if !bytes.Contains(sent, []byte(`"to":["austin@example.com","gary@example.com"]`)) {
		t.Fatalf("wrong recipients: %s", sent)
	}
}

func TestSendFailsClosedBeforeProviderOnSecurityOrLeakFailure(t *testing.T) {
	providerCalls := 0
	client, _ := NewClient(SecurityOrigin, strings.Repeat("s", 32), AgentMailOrigin, strings.Repeat("a", 32), "titus@agentmail.to", [2]string{"gary@example.com", "austin@example.com"}, &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if strings.HasPrefix(request.URL.String(), AgentMailOrigin) {
			providerCalls++
		}
		return response(http.StatusOK, `{"allowed":false,"content":""}`), nil
	})})
	if _, err := client.Send(context.Background(), "MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "safe"); SafeCode(err) != "meeting_email_security_denied" {
		t.Fatalf("err=%v", err)
	}
	if _, err := client.Send(context.Background(), "MB-ABCDEFGHIJKL", strings.Repeat("b", 64), "Authorization: Bearer secret"); SafeCode(err) != "meeting_email_rejected" {
		t.Fatalf("err=%v", err)
	}
	if providerCalls != 0 {
		t.Fatalf("provider called %d times", providerCalls)
	}
}

func TestNewClientRejectsRecipientOrOriginDrift(t *testing.T) {
	for _, recipients := range [][2]string{{"Gary <gary@example.com>", "austin@example.com"}, {"gary@example.com", "gary@example.com"}, {"GARY@example.com", "austin@example.com"}} {
		if _, err := NewClient(SecurityOrigin, strings.Repeat("s", 32), AgentMailOrigin, strings.Repeat("a", 32), "inbox", recipients, &http.Client{}); err == nil {
			t.Fatalf("accepted %#v", recipients)
		}
	}
}
