package bus_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	bus "github.com/overnightdesk/tenet-0/shared/bus-go"
	"github.com/overnightdesk/tenet-0/shared/bus-go/testutil"
)

func TestApprovals_PerActionRoundTrip(t *testing.T) {
	tdb := testutil.New(t)
	finCred := tdb.SeedDepartment(t, "fin", "fin")
	presCred := tdb.SeedDepartment(t, "president", "president")
	tdb.SeedConstitution(t, []testutil.RuleSpec{
		{ID: "fin-payout", Pattern: "fin.payment.outbound", ApprovalMode: "per_action"},
	})

	ctx := context.Background()
	fin := mustConnect(t, tdb.URL, "fin", finCred)
	defer fin.Close()
	pres := mustConnect(t, tdb.URL, "president", presCred)
	defer pres.Close()

	// Finance publishes a request placeholder representing the pending action.
	targetID, err := fin.Publish(ctx, "fin.approval.requested",
		json.RawMessage(`{"target":"payroll-2026-04"}`))
	if err != nil {
		t.Fatalf("request placeholder: %v", err)
	}

	// President grants per-action approval.
	approvalID, err := pres.Approvals().GrantPerAction(ctx, targetID,
		"fin.payment.outbound", 10*time.Minute, "monthly payroll")
	if err != nil {
		t.Fatalf("GrantPerAction: %v", err)
	}

	// Finance publishes the actual payment using the approval.
	paymentID, err := fin.Publish(ctx, "fin.payment.outbound",
		json.RawMessage(`{"amount":100}`), bus.WithApproval(approvalID))
	if err != nil {
		t.Fatalf("payment publish: %v", err)
	}
	if paymentID == "" {
		t.Fatal("expected payment event id")
	}

	// Same approval reused must fail.
	_, err = fin.Publish(ctx, "fin.payment.outbound",
		json.RawMessage(`{"amount":50}`), bus.WithApproval(approvalID))
	if !errors.Is(err, bus.ErrConstitutionRejected) {
		t.Fatalf("expected reuse to fail, got %v", err)
	}
}

func TestApprovals_BlanketGrantThenRevoke(t *testing.T) {
	tdb := testutil.New(t)
	croCred := tdb.SeedDepartment(t, "cro", "cro")
	presCred := tdb.SeedDepartment(t, "president", "president")
	tdb.SeedConstitution(t, []testutil.RuleSpec{
		{ID: "marketing-content", Pattern: "cro.content.published",
			ApprovalMode: "blanket_category", Category: "routine.marketing.content"},
	})

	ctx := context.Background()
	cro := mustConnect(t, tdb.URL, "cro", croCred)
	defer cro.Close()
	pres := mustConnect(t, tdb.URL, "president", presCred)
	defer pres.Close()

	// Without authorization → rejected.
	_, err := cro.Publish(ctx, "cro.content.published", json.RawMessage(`{}`))
	if !errors.Is(err, bus.ErrConstitutionRejected) {
		t.Fatalf("expected pre-auth rejection, got %v", err)
	}

	// President grants blanket authorization.
	authID, err := pres.Approvals().GrantBlanket(ctx,
		"routine.marketing.content", nil, time.Time{}, "default policy")
	if err != nil {
		t.Fatalf("GrantBlanket: %v", err)
	}

	// Marketing publishes — succeeds (authorization in chain via active blanket).
	if _, err := cro.Publish(ctx, "cro.content.published", json.RawMessage(`{}`)); err != nil {
		t.Fatalf("post-auth publish: %v", err)
	}

	// President revokes.
	if err := pres.Approvals().Revoke(ctx, authID, "policy review"); err != nil {
		t.Fatalf("Revoke: %v", err)
	}

	// Subsequent publish rejected.
	_, err = cro.Publish(ctx, "cro.content.published", json.RawMessage(`{}`))
	if !errors.Is(err, bus.ErrConstitutionRejected) {
		t.Fatalf("expected post-revoke rejection, got %v", err)
	}
}

func TestApprovals_PresidentOnly(t *testing.T) {
	tdb := testutil.New(t)
	finCred := tdb.SeedDepartment(t, "fin", "fin")
	tdb.SeedConstitution(t, nil)

	fin := mustConnect(t, tdb.URL, "fin", finCred)
	defer fin.Close()

	// Finance attempting to grant approvals = namespace violation
	// (event prefix `president.approved` cannot be published by `fin`).
	_, err := fin.Approvals().GrantPerAction(context.Background(), "evt-xxx",
		"fin.payment.outbound", time.Minute, "self-approval attempt")
	if !errors.Is(err, bus.ErrNamespaceViolation) {
		t.Fatalf("expected namespace violation, got %v", err)
	}
}
