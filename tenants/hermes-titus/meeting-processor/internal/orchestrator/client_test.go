package orchestrator

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

func response(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}
}

func testBriefJSON() string {
	return `{"schemaVersion":"meeting-brief/v1","title":"Test meeting","occurredAt":"2026-08-01T12:00:00Z","participants":["Gary"],"summary":"Discussed internal delivery work.","facts":["The test completed."],"decisions":[],"actionItems":[{"title":"Track the internal follow-up","owner":"gary","dueDate":null,"sourceTimestamp":"00:01.000","confidence":"high"}],"externalCommitments":[],"unresolvedQuestions":[],"proposedFollowUp":"Review the internal note.","projectHint":"OvernightDesk","projectConfidence":"high"}`
}

func testPlan(t *testing.T) Plan {
	t.Helper()
	plan, err := Prepare(Request{MeetingReference: "MB-ABCDEFGHIJKL", SourceDigest: strings.Repeat("a", 64), Attempt: 1, OccurredAt: "2026-08-01T12:00:00Z", ScreenedTranscript: "WEBVTT\nTRANSCRIPT-MARKER"})
	if err != nil {
		t.Fatal(err)
	}
	return plan
}

func TestPrepareBuildsDeterministicNoModelBodiesAndSafeDelegationPrefix(t *testing.T) {
	plan := testPlan(t)
	if len([]byte(SafeChildPrefix)) < 512 || strings.Contains(SafeChildPrefix[:500], "TRANSCRIPT-MARKER") {
		t.Fatal("safe prefix does not cover Hermes kickoff preview")
	}
	if plan.SessionID != "meeting-abcdefghijkl-1" || plan.CreateBodyDigest == "" || plan.RunBodyDigest == "" {
		t.Fatalf("unexpected plan: %#v", plan)
	}
	for name, body := range map[string][]byte{"create": plan.createBody, "run": plan.runBody} {
		for _, forbidden := range []string{`"model"`, `"provider"`, `"model_options"`, "TRANSCRIPT-MARKER"} {
			if name == "run" && forbidden == "TRANSCRIPT-MARKER" {
				continue
			}
			if strings.Contains(string(body), forbidden) {
				t.Fatalf("%s body contains %q", name, forbidden)
			}
		}
		digest := sha256.Sum256(body)
		actual := plan.CreateBodyDigest
		if name == "run" {
			actual = plan.RunBodyDigest
		}
		if actual != hex.EncodeToString(digest[:]) {
			t.Fatalf("%s body digest mismatch", name)
		}
	}
	contextStart := strings.Index(string(plan.runBody), SafeChildPrefix)
	if contextStart < 0 {
		t.Fatal("run instructions omit exact child prefix")
	}
}

func TestClientCreatesSessionAndSubmitsExactlyOneAuthenticatedRun(t *testing.T) {
	plan := testPlan(t)
	requests := 0
	client, err := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		requests++
		body, _ := io.ReadAll(request.Body)
		digest := sha256.Sum256(body)
		if request.Header.Get("Authorization") != "Bearer "+strings.Repeat("k", 32) || request.Header.Get("Idempotency-Key") != hex.EncodeToString(digest[:]) {
			t.Fatal("missing authenticated exact-body idempotency")
		}
		switch request.URL.Path {
		case "/api/sessions":
			if strings.Contains(string(body), `"model"`) {
				t.Fatal("session request selected a model")
			}
			return response(http.StatusCreated, `{"object":"hermes.session","session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
		case "/v1/runs":
			if strings.Contains(string(body), `"model"`) {
				t.Fatal("run request selected a model")
			}
			return response(http.StatusAccepted, `{"run_id":"run_0123456789abcdef0123456789abcdef","status":"started"}`), nil
		default:
			t.Fatalf("unexpected path %s", request.URL.Path)
			return nil, nil
		}
	})})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.EnsureSession(context.Background(), plan); err != nil {
		t.Fatal(err)
	}
	runID, err := client.SubmitRun(context.Background(), plan)
	if err != nil || runID != "run_0123456789abcdef0123456789abcdef" || requests != 2 {
		t.Fatalf("run=%q requests=%d err=%v", runID, requests, err)
	}
}

func TestClientReadsBackDeterministicSessionAfterCreateConflict(t *testing.T) {
	plan := testPlan(t)
	calls := 0
	client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		if calls == 1 && request.Method == http.MethodPost && request.URL.Path == "/api/sessions" {
			return response(http.StatusConflict, `{"error":{"code":"session_exists"}}`), nil
		}
		if calls == 2 && request.Method == http.MethodGet && request.URL.Path == "/api/sessions/"+plan.SessionID {
			return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
		}
		t.Fatalf("unexpected request %s %s", request.Method, request.URL.Path)
		return nil, nil
	})})
	if err := client.EnsureSession(context.Background(), plan); err != nil || calls != 2 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestClientReconcilesVerifiedLunaChildAndBoundQAEnvelope(t *testing.T) {
	plan := testPlan(t)
	brief := testBriefJSON()
	qa := `{"schemaVersion":"meeting-qa/v1","status":"QA_PASS","meetingReference":"MB-ABCDEFGHIJKL","attempt":1,"sourceDigest":"` + strings.Repeat("a", 64) + `","draftAttempts":1,"qaReviews":1,"brief":` + brief + `}`
	toolArgs, _ := json.Marshal(map[string]string{"goal": FixedChildGoal, "context": SafeChildPrefix + "\n\nScreened transcript:\nWEBVTT\nTRANSCRIPT-MARKER", "role": "leaf"})
	toolArgsJSON, _ := json.Marshal(string(toolArgs))
	qaJSON, _ := json.Marshal(qa)
	briefJSON, _ := json.Marshal(brief)
	client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		switch {
		case request.URL.Path == "/api/sessions/"+plan.SessionID:
			// Hermes persists its normal runtime model snapshot after the run starts.
			// This is distinct from a request-scoped model override at session creation.
			return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":true}}`), nil
		case request.URL.Path == "/api/sessions/"+plan.SessionID+"/messages":
			return response(http.StatusOK, `{"object":"list","session_id":"`+plan.SessionID+`","data":[{"role":"assistant","tool_calls":[{"id":"call_1","type":"function","function":{"name":"delegate_task","arguments":`+string(toolArgsJSON)+`}}]},{"role":"assistant","content":`+string(qaJSON)+`}]}`), nil
		case request.URL.Path == "/api/sessions" && request.URL.Query().Get("include_children") == "true":
			return response(http.StatusOK, `{"object":"list","data":[{"id":"child_1","model":"gpt-5.6-luna","parent_session_id":"`+plan.SessionID+`","started_at":1}],"has_more":false}`), nil
		case request.URL.Path == "/api/sessions/child_1/messages":
			return response(http.StatusOK, `{"object":"list","session_id":"child_1","data":[{"role":"assistant","content":`+string(briefJSON)+`}]}`), nil
		default:
			t.Fatalf("unexpected request %s", request.URL.String())
			return nil, nil
		}
	})})
	inspection, err := client.Inspect(context.Background(), plan.SessionID, InspectionBinding{QA: analyzer.QABinding{MeetingReference: "MB-ABCDEFGHIJKL", Attempt: 1, SourceDigest: strings.Repeat("a", 64)}, ScreenedDigest: plan.ScreenedDigest}, nil)
	if err != nil || inspection.Status != analyzer.QAPass || inspection.QA.Validated == nil || inspection.DelegationCount != 1 || len(inspection.ChildSessionIDs) != 1 || !inspection.ChildRouteVerified {
		t.Fatalf("inspection=%#v err=%v", inspection, err)
	}
}

func TestClientRejectsWrongChildUnsupportedToolAndMalformedResponses(t *testing.T) {
	plan := testPlan(t)
	fixtures := []roundTripFunc{
		func(request *http.Request) (*http.Response, error) {
			if request.URL.Path == "/api/sessions/"+plan.SessionID {
				return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
			}
			if request.URL.Path == "/api/sessions/"+plan.SessionID+"/messages" {
				return response(http.StatusOK, `{"data":[{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"terminal","arguments":"{}"}}]}]}`), nil
			}
			return response(http.StatusOK, `{"data":[],"has_more":false}`), nil
		},
		func(request *http.Request) (*http.Response, error) {
			if request.URL.Path == "/api/sessions/"+plan.SessionID {
				return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
			}
			if request.URL.Path == "/api/sessions/"+plan.SessionID+"/messages" {
				args, _ := json.Marshal(map[string]string{"goal": FixedChildGoal, "context": SafeChildPrefix + "x", "role": "leaf"})
				encoded, _ := json.Marshal(string(args))
				return response(http.StatusOK, `{"data":[{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"delegate_task","arguments":`+string(encoded)+`}}]}]}`), nil
			}
			return response(http.StatusOK, `{"data":[{"id":"child_1","model":"gpt-5.6-sol","parent_session_id":"`+plan.SessionID+`"}],"has_more":false}`), nil
		},
		func(*http.Request) (*http.Response, error) { return nil, errors.New("timeout detail") },
	}
	for index, transport := range fixtures {
		client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: transport})
		if _, err := client.Inspect(context.Background(), plan.SessionID, InspectionBinding{QA: analyzer.QABinding{MeetingReference: "MB-ABCDEFGHIJKL", Attempt: 1, SourceDigest: strings.Repeat("a", 64)}, ScreenedDigest: plan.ScreenedDigest}, nil); err == nil {
			t.Fatalf("fixture %d accepted", index)
		}
	}
}

func TestClientRejectsMalformedQAMarkerTrailingDelegationArgumentsAndUnorderedChild(t *testing.T) {
	plan := testPlan(t)
	validArgs, _ := json.Marshal(map[string]string{"goal": FixedChildGoal, "context": SafeChildPrefix + "\n\nScreened transcript:\nWEBVTT\nTRANSCRIPT-MARKER", "role": "leaf"})
	trailingArgs, _ := json.Marshal(string(validArgs) + ` {}`)
	validArgsJSON, _ := json.Marshal(string(validArgs))
	fixtures := []roundTripFunc{
		func(request *http.Request) (*http.Response, error) {
			if request.URL.Path == "/api/sessions/"+plan.SessionID {
				return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
			}
			if request.URL.Path == "/api/sessions/"+plan.SessionID+"/messages" {
				return response(http.StatusOK, `{"data":[{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"delegate_task","arguments":`+string(validArgsJSON)+`}}]},{"role":"assistant","content":"meeting-qa/v1 malformed"}]}`), nil
			}
			return response(http.StatusOK, `{"data":[{"id":"child_1","model":"gpt-5.6-luna","parent_session_id":"`+plan.SessionID+`","started_at":1}],"has_more":false}`), nil
		},
		func(request *http.Request) (*http.Response, error) {
			if request.URL.Path == "/api/sessions/"+plan.SessionID {
				return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
			}
			if request.URL.Path == "/api/sessions/"+plan.SessionID+"/messages" {
				return response(http.StatusOK, `{"data":[{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"delegate_task","arguments":`+string(trailingArgs)+`}}]}]}`), nil
			}
			return response(http.StatusOK, `{"data":[],"has_more":false}`), nil
		},
		func(request *http.Request) (*http.Response, error) {
			if request.URL.Path == "/api/sessions/"+plan.SessionID {
				return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
			}
			if request.URL.Path == "/api/sessions/"+plan.SessionID+"/messages" {
				return response(http.StatusOK, `{"data":[{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"delegate_task","arguments":`+string(validArgsJSON)+`}}]}]}`), nil
			}
			return response(http.StatusOK, `{"data":[{"id":"child_1","model":"gpt-5.6-luna","parent_session_id":"`+plan.SessionID+`","started_at":0}],"has_more":false}`), nil
		},
	}
	for index, transport := range fixtures {
		client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: transport})
		if _, err := client.Inspect(context.Background(), plan.SessionID, InspectionBinding{QA: analyzer.QABinding{MeetingReference: "MB-ABCDEFGHIJKL", Attempt: 1, SourceDigest: strings.Repeat("a", 64)}, ScreenedDigest: plan.ScreenedDigest}, nil); err == nil {
			t.Fatalf("fixture %d accepted", index)
		}
	}
}

func TestLatestQAContentRequiresTerminalAssistantResultAfterFinalDelegation(t *testing.T) {
	qa := `{"schemaVersion":"meeting-qa/v1"}`
	toolCall := json.RawMessage(`[{"type":"function"}]`)
	fixtures := []struct {
		name     string
		messages []sessionMessage
		want     bool
	}{
		{name: "terminal qa", messages: []sessionMessage{{Role: "assistant", ToolCalls: toolCall}, {Role: "assistant", Content: qa}}, want: true},
		{name: "later assistant prose", messages: []sessionMessage{{Role: "assistant", ToolCalls: toolCall}, {Role: "assistant", Content: qa}, {Role: "assistant", Content: "later result"}}},
		{name: "later delegation", messages: []sessionMessage{{Role: "assistant", Content: qa}, {Role: "assistant", ToolCalls: toolCall}}},
	}
	for _, fixture := range fixtures {
		t.Run(fixture.name, func(t *testing.T) {
			got, ok := latestQAContent(fixture.messages)
			if ok != fixture.want || (ok && got != qa) {
				t.Fatalf("content=%q ok=%t", got, ok)
			}
		})
	}
}

func TestClientBoundsPaginationAndRejectsRedirectOversizeAndMalformedCreate(t *testing.T) {
	plan := testPlan(t)
	pages := 0
	client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Path == "/api/sessions/"+plan.SessionID {
			return response(http.StatusOK, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
		}
		if strings.HasSuffix(request.URL.Path, "/messages") {
			args, _ := json.Marshal(map[string]string{"goal": FixedChildGoal, "context": SafeChildPrefix + "\n\nScreened transcript:\nWEBVTT\nTRANSCRIPT-MARKER", "role": "leaf"})
			encoded, _ := json.Marshal(string(args))
			return response(http.StatusOK, `{"data":[{"role":"assistant","tool_calls":[{"type":"function","function":{"name":"delegate_task","arguments":`+string(encoded)+`}}]}]}`), nil
		}
		pages++
		return response(http.StatusOK, `{"data":[],"has_more":true}`), nil
	})})
	if _, err := client.Inspect(context.Background(), plan.SessionID, InspectionBinding{QA: analyzer.QABinding{MeetingReference: "MB-ABCDEFGHIJKL", Attempt: 1, SourceDigest: strings.Repeat("a", 64)}, ScreenedDigest: plan.ScreenedDigest}, nil); SafeCode(err) != "orchestrator_session_limit" || pages != 5 {
		t.Fatalf("pages=%d code=%s", pages, SafeCode(err))
	}

	fixtures := []roundTripFunc{
		func(*http.Request) (*http.Response, error) { return response(http.StatusFound, `{}`), nil },
		func(*http.Request) (*http.Response, error) {
			return response(http.StatusCreated, strings.Repeat("x", int(maxResponseBytes)+1)), nil
		},
		func(*http.Request) (*http.Response, error) { return response(http.StatusCreated, `{}`), nil },
		func(*http.Request) (*http.Response, error) {
			return response(http.StatusCreated, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-luna","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":false}}`), nil
		},
		func(*http.Request) (*http.Response, error) {
			return response(http.StatusCreated, `{"session":{"id":"`+plan.SessionID+`","source":"api_server","model":"gpt-5.6-sol","title":"`+plan.Title+`","has_system_prompt":true,"has_model_config":true}}`), nil
		},
	}
	for index, transport := range fixtures {
		candidate, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: transport})
		if err := candidate.EnsureSession(context.Background(), plan); err == nil {
			t.Fatalf("fixture %d accepted", index)
		}
	}
}

func TestCleanupDeletesParentAndVerifiesParentAndChildrenNotFound(t *testing.T) {
	calls := 0
	client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls++
		if request.Method == http.MethodGet && request.URL.Path == "/api/sessions" {
			return response(http.StatusOK, `{"data":[],"has_more":false}`), nil
		}
		if request.Method == http.MethodDelete && request.URL.Path == "/api/sessions/meeting-abcdefghijkl-1" {
			return response(http.StatusOK, `{"object":"hermes.session.deleted","id":"meeting-abcdefghijkl-1","deleted":true}`), nil
		}
		return response(http.StatusNotFound, `{"error":{"code":"session_not_found"}}`), nil
	})})
	if err := client.Cleanup(context.Background(), "meeting-abcdefghijkl-1", []string{"child_1", "child_2"}); err != nil || calls != 5 {
		t.Fatalf("calls=%d err=%v", calls, err)
	}
}

func TestCleanupDiscoversAndVerifiesChildMissingFromDurableState(t *testing.T) {
	verifiedChild := false
	client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method == http.MethodGet && request.URL.Path == "/api/sessions" {
			return response(http.StatusOK, `{"data":[{"id":"unexpected_child","model":"gpt-5.6-luna","parent_session_id":"meeting-abcdefghijkl-1","started_at":1}],"has_more":false}`), nil
		}
		if request.Method == http.MethodDelete {
			return response(http.StatusOK, `{"deleted":true}`), nil
		}
		if request.URL.Path == "/api/sessions/unexpected_child" {
			verifiedChild = true
		}
		return response(http.StatusNotFound, `{"error":{"code":"session_not_found"}}`), nil
	})})
	if err := client.Cleanup(context.Background(), "meeting-abcdefghijkl-1", nil); err != nil || !verifiedChild {
		t.Fatalf("verified_child=%t err=%v", verifiedChild, err)
	}
}

func TestCleanupRejectsNonCanonicalNotFoundBody(t *testing.T) {
	client, _ := NewClient(ServiceOrigin, strings.Repeat("k", 32), &http.Client{Transport: roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.Method == http.MethodGet && request.URL.Path == "/api/sessions" {
			return response(http.StatusOK, `{"data":[],"has_more":false}`), nil
		}
		if request.Method == http.MethodDelete {
			return response(http.StatusOK, `{"deleted":true}`), nil
		}
		return response(http.StatusNotFound, `{"message":"text containing session_not_found is not the canonical error"}`), nil
	})})
	if err := client.Cleanup(context.Background(), "meeting-abcdefghijkl-1", nil); err == nil {
		t.Fatal("non-canonical 404 body accepted")
	}
}
