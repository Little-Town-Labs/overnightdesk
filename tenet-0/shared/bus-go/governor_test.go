package bus_test

import (
	"context"
	"errors"
	"testing"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

func TestGovernor_CheckBudget_Ok(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	tdb.SeedBudget(t, "ops", 1000)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	st, err := b.Governor().CheckBudget(context.Background())
	if err != nil {
		t.Fatalf("CheckBudget: %v", err)
	}
	if st.Status != "ok" {
		t.Errorf("status = %q, want ok", st.Status)
	}
	if st.LimitCents != 1000 {
		t.Errorf("limit = %d, want 1000", st.LimitCents)
	}
	if st.RemainingCents != 1000 {
		t.Errorf("remaining = %d, want 1000", st.RemainingCents)
	}
}

func TestGovernor_Call_RecordsUsage(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	tdb.SeedBudget(t, "ops", 10000)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	fake := &fakeClaudeClient{
		inputTokens:  100000,
		outputTokens: 50000,
		reply:        "hello",
	}

	resp, err := b.Governor().Call(context.Background(), fake, bus.ClaudeRequest{
		Model: "claude-haiku-4-5",
	})
	if err != nil {
		t.Fatalf("Call: %v", err)
	}
	if resp.Text != "hello" {
		t.Errorf("reply = %q", resp.Text)
	}

	st, err := b.Governor().CheckBudget(context.Background())
	if err != nil {
		t.Fatalf("CheckBudget: %v", err)
	}
	// haiku: 80 cents/Mtok input + 400 cents/Mtok output
	// 100k input * 80/1M + 50k output * 400/1M = 8 + 20 = 28 cents
	if st.SpentCents != 28 {
		t.Errorf("spent = %d, want 28", st.SpentCents)
	}
}

func TestGovernor_Call_BlockedWhenOverBudget(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	tdb.SeedBudget(t, "ops", 10) // tiny budget

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	fake := &fakeClaudeClient{
		inputTokens:  1000000, // 1M input tokens
		outputTokens: 1000000, // 1M output tokens
		reply:        "over the limit",
	}

	// First call pushes spend over 100% of $0.10 budget (haiku: 80 + 400 = 480 cents).
	_, err := b.Governor().Call(context.Background(), fake, bus.ClaudeRequest{
		Model: "claude-haiku-4-5",
	})
	if err != nil {
		t.Fatalf("first Call: %v", err)
	}

	// Second call must be blocked.
	_, err = b.Governor().Call(context.Background(), fake, bus.ClaudeRequest{
		Model: "claude-haiku-4-5",
	})
	if !errors.Is(err, bus.ErrBudgetBlocked) {
		t.Fatalf("expected ErrBudgetBlocked on second call, got %v", err)
	}
}

func TestGovernor_Call_SkipsClaudeOnBlocked(t *testing.T) {
	tdb := testutil.New(t)
	cred := tdb.SeedDepartment(t, "ops", "ops")
	tdb.SeedConstitution(t, nil)
	tdb.SeedBudget(t, "ops", 1)

	b := mustConnect(t, tdb.URL, "ops", cred)
	defer b.Close()

	// Push over budget.
	fake := &fakeClaudeClient{inputTokens: 1000000, outputTokens: 1000000, reply: "ok"}
	_, _ = b.Governor().Call(context.Background(), fake, bus.ClaudeRequest{Model: "claude-haiku-4-5"})

	// Now a second client that records whether it was called.
	blocking := &fakeClaudeClient{
		inputTokens:  100,
		outputTokens: 100,
		reply:        "should-not-see-this",
	}
	_, err := b.Governor().Call(context.Background(), blocking, bus.ClaudeRequest{Model: "claude-haiku-4-5"})
	if !errors.Is(err, bus.ErrBudgetBlocked) {
		t.Fatalf("want ErrBudgetBlocked, got %v", err)
	}
	if blocking.called {
		t.Error("Claude client should NOT be called when budget is blocked")
	}
}

// --- fakes ---

type fakeClaudeClient struct {
	inputTokens  int
	outputTokens int
	reply        string
	err          error
	called       bool
}

func (f *fakeClaudeClient) CreateMessage(_ context.Context, _ bus.ClaudeRequest) (bus.ClaudeResponse, error) {
	f.called = true
	if f.err != nil {
		return bus.ClaudeResponse{}, f.err
	}
	return bus.ClaudeResponse{
		Text:         f.reply,
		InputTokens:  f.inputTokens,
		OutputTokens: f.outputTokens,
	}, nil
}
