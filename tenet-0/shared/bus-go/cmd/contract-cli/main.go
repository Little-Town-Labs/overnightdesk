// Command contract-cli is a narrow JSON-in/JSON-out driver for cross-language
// interop tests between the Go and TypeScript bus libraries. The TS-side
// test harness spawns this binary for Go-side actions. Not intended for
// production use.
//
// Env:
//   TENET0_PG_URL      Postgres connection string (disposable test DB)
//   TENET0_DEPARTMENT  Department id
//   TENET0_CREDENTIAL  Credential (raw bearer, matches what TS seeds)
//
// Subcommands:
//   publish <event-type> <json-payload>
//   subscribe <key> <pattern> --count N --timeout DURATION
//   grant-blanket <category>
//   check-budget
//   metrics-snapshot
//
// All output goes to stdout as a single JSON object/array. Errors go to
// stderr and the process exits non-zero.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"sync"
	"time"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
)

func main() {
	if len(os.Args) < 2 {
		die("usage: contract-cli <subcommand> [args...]")
	}
	sub := os.Args[1]
	rest := os.Args[2:]

	cfg := bus.Config{
		PostgresURL: os.Getenv("TENET0_PG_URL"),
		Department:  os.Getenv("TENET0_DEPARTMENT"),
		Credential:  os.Getenv("TENET0_CREDENTIAL"),
	}
	if cfg.PostgresURL == "" || cfg.Department == "" || cfg.Credential == "" {
		die("TENET0_PG_URL, TENET0_DEPARTMENT, TENET0_CREDENTIAL env vars required")
	}

	// connectCtx is only for the initial Connect — long-running subcommands
	// (subscribe) derive their own context from background so the connect
	// timeout doesn't kill them mid-flight.
	connectCtx, connectCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer connectCancel()

	b, err := bus.Connect(connectCtx, cfg)
	if err != nil {
		die("connect: %v", err)
	}
	defer b.Close()

	switch sub {
	case "publish":
		runPublish(connectCtx, b, rest)
	case "subscribe":
		// Subscribe uses background — its own --timeout flag bounds it.
		runSubscribe(context.Background(), b, rest)
	case "grant-blanket":
		runGrantBlanket(connectCtx, b, rest)
	case "check-budget":
		runCheckBudget(connectCtx, b)
	case "metrics-snapshot":
		runMetricsSnapshot(connectCtx, b)
	default:
		die("unknown subcommand: %s", sub)
	}
}

func runPublish(ctx context.Context, b *bus.Bus, args []string) {
	if len(args) < 2 {
		die("publish: need <event-type> <json-payload>")
	}
	eventID, err := b.Publish(ctx, args[0], json.RawMessage(args[1]))
	if err != nil {
		die("publish: %v", err)
	}
	emit(map[string]string{"event_id": eventID})
}

func runSubscribe(ctx context.Context, b *bus.Bus, args []string) {
	// Parse flags first so they can appear before positionals.
	fs := flag.NewFlagSet("subscribe", flag.ExitOnError)
	count := fs.Int("count", 1, "number of events to receive before exiting")
	timeout := fs.Duration("timeout", 10*time.Second, "overall timeout")
	if err := fs.Parse(args); err != nil {
		die("subscribe: %v", err)
	}
	positional := fs.Args()
	if len(positional) < 2 {
		die("subscribe: need <key> <pattern>")
	}
	key := positional[0]
	pattern := positional[1]

	type outEvent struct {
		ID       string          `json:"id"`
		Type     string          `json:"type"`
		Source   string          `json:"source"`
		Payload  json.RawMessage `json:"payload"`
		ParentID string          `json:"parent_id,omitempty"`
	}

	var mu sync.Mutex
	received := make([]outEvent, 0, *count)
	done := make(chan struct{})
	var doneOnce sync.Once

	subCtx, subCancel := context.WithTimeout(ctx, *timeout)
	defer subCancel()

	sub, err := b.Subscribe(subCtx, key, pattern, func(_ context.Context, e bus.Event) error {
		mu.Lock()
		received = append(received, outEvent{
			ID: e.ID, Type: e.Type, Source: e.Source,
			Payload: e.Payload, ParentID: e.ParentID,
		})
		full := len(received) >= *count
		mu.Unlock()
		if full {
			doneOnce.Do(func() { close(done) })
		}
		return nil
	})
	if err != nil {
		die("subscribe: %v", err)
	}
	defer sub.Close()

	// Signal readiness to the TS harness on stderr so the caller can
	// publish without a hard-coded sleep. Must come AFTER Subscribe returns
	// because that is when LISTEN is issued against Postgres.
	fmt.Fprintln(os.Stderr, "contract-cli: subscribe ready")

	select {
	case <-done:
	case <-subCtx.Done():
	}

	mu.Lock()
	snapshot := append([]outEvent(nil), received...)
	mu.Unlock()
	emit(map[string]any{"events": snapshot})
}

func runGrantBlanket(ctx context.Context, b *bus.Bus, args []string) {
	if len(args) < 1 {
		die("grant-blanket: need <category>")
	}
	id, err := b.Approvals().GrantBlanket(ctx, args[0], nil, time.Time{}, "contract-test")
	if err != nil {
		die("grant-blanket: %v", err)
	}
	emit(map[string]string{"event_id": id})
}

func runCheckBudget(ctx context.Context, b *bus.Bus) {
	st, err := b.Governor().CheckBudget(ctx)
	if err != nil {
		die("check-budget: %v", err)
	}
	emit(map[string]any{
		"status":          st.Status,
		"limit_cents":     st.LimitCents,
		"spent_cents":     st.SpentCents,
		"remaining_cents": st.RemainingCents,
	})
}

func runMetricsSnapshot(ctx context.Context, b *bus.Bus) {
	snap, err := b.Metrics().Snapshot(ctx)
	if err != nil {
		die("metrics-snapshot: %v", err)
	}

	// Flatten to the JSON shape defined in contracts/sdk-api.md so the TS
	// side can compare against its own snake_case output.
	type epmRow struct {
		Department      string `json:"department"`
		EventsPerMinute int    `json:"events_per_minute"`
	}
	type budgetRow struct {
		Department  string  `json:"department"`
		SpentCents  int     `json:"spent_cents"`
		LimitCents  int     `json:"limit_cents"`
		PctUtilized float64 `json:"pct_utilized"`
		Status      string  `json:"status"`
	}
	type rejRow struct {
		Actor      string `json:"actor"`
		Action     string `json:"action"`
		Rejections int    `json:"rejections"`
	}
	type lagRow struct {
		Department      string `json:"department"`
		SubscriptionKey string `json:"subscription_key"`
		LagEvents       int    `json:"lag_events"`
	}

	epm := make([]epmRow, 0, len(snap.EventsPerMinute))
	for _, r := range snap.EventsPerMinute {
		epm = append(epm, epmRow{Department: r.Department, EventsPerMinute: r.EventsPerMinute})
	}
	budgets := make([]budgetRow, 0, len(snap.BudgetUtilization))
	for _, r := range snap.BudgetUtilization {
		budgets = append(budgets, budgetRow{
			Department: r.Department, SpentCents: r.SpentCents,
			LimitCents: r.LimitCents, PctUtilized: r.PctUtilized, Status: r.Status,
		})
	}
	rejections := make([]rejRow, 0, len(snap.RejectionRatePerHour))
	for _, r := range snap.RejectionRatePerHour {
		rejections = append(rejections, rejRow{Actor: r.Actor, Action: r.Action, Rejections: r.Rejections})
	}
	lag := make([]lagRow, 0, len(snap.SubscriptionLag))
	for _, r := range snap.SubscriptionLag {
		lag = append(lag, lagRow{Department: r.Department, SubscriptionKey: r.SubscriptionKey, LagEvents: r.LagEvents})
	}

	emit(map[string]any{
		"events_per_minute":               epm,
		"rejection_rate_per_hour":         rejections,
		"subscription_lag":                lag,
		"budget_utilization":              budgets,
		"audit_log_write_rate_per_minute": snap.AuditLogWriteRatePerMinute,
	})
}

func emit(v any) {
	if err := json.NewEncoder(os.Stdout).Encode(v); err != nil {
		die("encode: %v", err)
	}
}

func die(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "contract-cli: "+format+"\n", args...)
	os.Exit(1)
}
