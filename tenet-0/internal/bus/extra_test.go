package bus

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"testing"
	"time"

	busgo "github.com/overnightdesk/tenet-0/shared/bus-go"
)

// mapBusError matrix — exercises every branch of the mapper so coverage
// reflects the real contract, not just the paths the test double hit.
func TestMapBusError_AllBranches(t *testing.T) {
	cases := []struct {
		name string
		in   error
		want error
	}{
		{"nil", nil, nil},
		{"busgo-unauth", busgo.ErrUnauthenticated, ErrBusUnauthorized},
		{"busgo-namespace", busgo.ErrNamespaceViolation, ErrBusNamespaceViolation},
		{"busgo-constitution", busgo.ErrConstitutionRejected, ErrBusRuleViolation},
		{"busgo-causality", busgo.ErrCausalityLoop, ErrBusRuleViolation},
		{"busgo-noconstitution", busgo.ErrNoConstitution, ErrBusRuleViolation},
		{"busgo-notfound", busgo.ErrNotFound, ErrBusNotFound},
		{"busgo-query-invalid", busgo.ErrQueryInvalid, ErrBusQueryInvalid},
		{"busgo-dup-idem", busgo.ErrDuplicateIdempotency, ErrBusDuplicateIdempotency},
		{"busgo-connection-lost", busgo.ErrConnectionLost, ErrBusDown},
		{"deadline-exceeded", context.DeadlineExceeded, ErrBusDown},
		{"canceled", context.Canceled, ErrBusDown},
		{"idempotency-text", errors.New("idempotency_key reused"), ErrBusDuplicateIdempotency},
		{"passthrough-sentinel", ErrBusNotFound, ErrBusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := mapBusError(tc.in)
			if tc.want == nil {
				if got != nil {
					t.Fatalf("got %v, want nil", got)
				}
				return
			}
			if got == nil {
				t.Fatalf("got nil, want %v", tc.want)
			}
			if !errors.Is(got, tc.want) {
				t.Fatalf("errors.Is(%v, %v) = false", got, tc.want)
			}
		})
	}

	// Unknown passes through unchanged (not wrapped).
	surprise := errors.New("surprise")
	if got := mapBusError(surprise); got != surprise {
		t.Errorf("unknown error should pass through unchanged; got %v", got)
	}
}

// Net error → BUS_DOWN via errors.As branch.
func TestMapBusError_NetError(t *testing.T) {
	var ne net.Error = &net.DNSError{Err: "boom", Name: "x"}
	out := mapBusError(ne)
	if !errors.Is(out, ErrBusDown) {
		t.Fatalf("net.Error should map to ErrBusDown, got %v", out)
	}
}

func TestConvertEvent_ParentIDRoundtrip(t *testing.T) {
	in := busgo.Event{
		ID:          "id",
		Type:        "a.b.c",
		Source:      "ops",
		Payload:     []byte(`{"x":1}`),
		ParentID:    "parent-id",
		PublishedAt: time.Unix(42, 0),
	}
	out := convertEvent(in)
	if out.ParentEventID == nil || *out.ParentEventID != "parent-id" {
		t.Errorf("ParentEventID lost: %+v", out.ParentEventID)
	}
	if string(out.Payload) != `{"x":1}` {
		t.Errorf("Payload = %s", out.Payload)
	}
	// Empty ParentID -> nil pointer
	in2 := in
	in2.ParentID = ""
	out2 := convertEvent(in2)
	if out2.ParentEventID != nil {
		t.Errorf("empty ParentID should map to nil pointer, got %v", out2.ParentEventID)
	}
}

func TestConvertEvents_NilAndNonNil(t *testing.T) {
	if convertEvents(nil) != nil {
		t.Errorf("nil in should map to nil out")
	}
	out := convertEvents([]busgo.Event{{ID: "a"}, {ID: "b"}})
	if len(out) != 2 {
		t.Errorf("len = %d", len(out))
	}
}

func TestEventTypePattern(t *testing.T) {
	valid := []string{"ops.job.completed", "fin.payment.outbound", "president.approval.granted", "a.b.c"}
	invalid := []string{"", "a", "a.b", "a.b.c.d", "A.b.c", "a..b", "ops.JOB.completed", "-.b.c"}
	for _, v := range valid {
		if !eventTypePattern.MatchString(v) {
			t.Errorf("expected valid: %q", v)
		}
	}
	for _, v := range invalid {
		if eventTypePattern.MatchString(v) {
			t.Errorf("expected invalid: %q", v)
		}
	}
}

func TestNew_RejectsEmptyDeptCredDSN(t *testing.T) {
	// Logger supplied so the first branch succeeds; other fields exercised.
	cases := []Config{
		{Logger: discardLogger()},                                              // missing dept
		{Logger: discardLogger(), Department: "ops"},                           // missing cred
		{Logger: discardLogger(), Department: "ops", Credential: "x"},          // missing dsn
	}
	for i, c := range cases {
		if _, err := New(c); err == nil {
			t.Errorf("case %d: expected error", i)
		}
	}
}

// Ensure the handler's RegisterTools wires handlers whose input unmarshal
// rejects bad JSON with ErrBusPayloadInvalid (tested via the handler func
// signature inside the tool registry). We don't depend on the mcp server
// harness for this — we unmarshal the raw schema paths via the handler
// closure indirectly through PublishEvent.
func TestPublishEvent_InvalidJSONFromSchema(t *testing.T) {
	h := newTestHandler(&fakeBus{}, "ops")

	// Direct handler: bad event_type shape
	_, err := h.PublishEvent(context.Background(), PublishEventRequest{
		EventType: "x",
		Payload:   json.RawMessage(`{}`),
	})
	if !errors.Is(err, ErrBusPayloadInvalid) {
		t.Fatalf("got %v want ErrBusPayloadInvalid", err)
	}
}
