package bus

import (
	"context"
	"fmt"
)

// ClaudeClient is the narrow interface the Governor wraps. Satisfies both
// the official anthropic-sdk-go client and any fake used in tests.
type ClaudeClient interface {
	CreateMessage(ctx context.Context, req ClaudeRequest) (ClaudeResponse, error)
}

// ClaudeRequest is a stack-agnostic message request. Transport-specific
// fields (system prompt, tools, etc.) ride in the adapter that implements
// ClaudeClient; the governor only needs the model name for pricing.
type ClaudeRequest struct {
	Model    string
	Messages []ClaudeMessage
}

// ClaudeMessage mirrors Anthropic's message shape for simple callers.
type ClaudeMessage struct {
	Role    string // "user", "assistant", "system"
	Content string
}

// ClaudeResponse is what CreateMessage returns — enough for the governor to
// record usage. Transport adapters may include richer fields.
type ClaudeResponse struct {
	Text         string
	InputTokens  int
	OutputTokens int
}

// Governor wraps Claude API calls with pre-flight budget checks and
// post-flight usage recording against the Tenet-0 token_usage ledger.
type Governor struct {
	bus *Bus
}

// Governor returns the Governor view of this Bus.
func (b *Bus) Governor() *Governor {
	return &Governor{bus: b}
}

// CheckBudget returns the current status without making a Claude call.
func (g *Governor) CheckBudget(ctx context.Context) (BudgetStatus, error) {
	var st BudgetStatus
	err := g.bus.pool.QueryRow(ctx,
		`SELECT status, limit_cents, spent_cents, remaining_cents FROM check_budget($1)`,
		g.bus.config.Credential,
	).Scan(&st.Status, &st.LimitCents, &st.SpentCents, &st.RemainingCents)
	if err != nil {
		return BudgetStatus{}, fmt.Errorf("governor: check_budget: %w", err)
	}
	if st.Status == budgetStatusUnauthenticated {
		return st, ErrUnauthenticated
	}
	return st, nil
}

// Call pre-checks the department's budget, invokes the Claude client, then
// records token usage. Returns ErrBudgetBlocked if the department is at or
// over its monthly limit — Claude is not invoked in that case.
//
// Callers should use this instead of invoking their Claude client directly
// so that every Tenet-0 Claude call is accounted for in the token_usage
// ledger.
func (g *Governor) Call(ctx context.Context, client ClaudeClient, req ClaudeRequest) (ClaudeResponse, error) {
	st, err := g.CheckBudget(ctx)
	if err != nil {
		return ClaudeResponse{}, err
	}
	if st.Status == budgetStatusBlocked {
		return ClaudeResponse{}, ErrBudgetBlocked
	}

	resp, callErr := client.CreateMessage(ctx, req)
	if callErr != nil {
		// Best-effort usage recording even on failure — any tokens consumed
		// before the error should count toward the budget.
		if resp.InputTokens > 0 || resp.OutputTokens > 0 {
			if err := g.recordUsage(ctx, req.Model, resp.InputTokens, resp.OutputTokens); err != nil {
				g.bus.logger.Warn("governor: record_token_usage failed on call error path", "error", err)
			}
		}
		return resp, callErr
	}

	if err := g.recordUsage(ctx, req.Model, resp.InputTokens, resp.OutputTokens); err != nil {
		// Usage couldn't be recorded — surface as a soft warning but don't
		// fail the caller. The response is still valid.
		g.bus.logger.Warn("governor: record_token_usage failed", "error", err)
	}

	return resp, nil
}

// recordUsage calls the record_token_usage stored procedure and ignores the
// cost/status reply (callers can query CheckBudget afterward).
func (g *Governor) recordUsage(ctx context.Context, model string, input, output int) error {
	var costCents int
	var budgetStatus string
	err := g.bus.pool.QueryRow(ctx,
		`SELECT cost_cents, budget_status FROM record_token_usage($1, $2, $3, $4, NULL)`,
		g.bus.config.Credential, model, input, output,
	).Scan(&costCents, &budgetStatus)
	if err != nil {
		return fmt.Errorf("record_token_usage: %w", err)
	}
	return nil
}
