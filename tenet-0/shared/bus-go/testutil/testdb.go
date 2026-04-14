// Package testutil provides test-only helpers for spinning up an isolated
// Tenet-0 database per test. Do not import from non-test code.
package testutil

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// TestDB holds a disposable Tenet-0 database seeded with all schema
// migrations. Close drops the database.
type TestDB struct {
	// AdminURL connects to the admin database (postgres).
	AdminURL string
	// URL connects to the disposable test database.
	URL string
	// Name is the generated test database name (for logging).
	Name string
	// Pool is a pgxpool connected to URL.
	Pool *pgxpool.Pool
}

// New provisions a disposable test database. The PG_TEST_ADMIN_URL env var
// must point at a Postgres admin connection (e.g.,
// postgres://user:pass@host:5432/postgres). The test skips if it is unset.
//
// Migrations from tenet-0/db/migrations/ are applied in order. The caller is
// responsible for calling Close via t.Cleanup.
func New(t *testing.T) *TestDB {
	t.Helper()

	adminURL := os.Getenv("PG_TEST_ADMIN_URL")
	if adminURL == "" {
		t.Skip("PG_TEST_ADMIN_URL not set; skipping integration test")
	}

	ctx := context.Background()
	suffix := randSuffix(8)
	dbName := fmt.Sprintf("tenet0_test_%s", suffix)

	adminConn, err := pgx.Connect(ctx, adminURL)
	if err != nil {
		t.Fatalf("connect admin: %v", err)
	}
	defer func() { _ = adminConn.Close(ctx) }()

	if _, err := adminConn.Exec(ctx, "CREATE DATABASE "+dbName); err != nil {
		t.Fatalf("create database %s: %v", dbName, err)
	}

	// Ensure roles exist (idempotent).
	rolesSQL := `
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_admin') THEN
    CREATE ROLE tenet0_admin NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_app') THEN
    CREATE ROLE tenet0_app NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tenet0_secops') THEN
    CREATE ROLE tenet0_secops NOINHERIT;
  END IF;
END $$;`
	if _, err := adminConn.Exec(ctx, rolesSQL); err != nil {
		t.Fatalf("create roles: %v", err)
	}

	testURL := swapDatabase(adminURL, dbName)

	// Apply migrations in order.
	testConn, err := pgx.Connect(ctx, testURL)
	if err != nil {
		t.Fatalf("connect test db: %v", err)
	}
	for _, path := range migrationPaths(t) {
		sqlBytes, err := os.ReadFile(path)
		if err != nil {
			_ = testConn.Close(ctx)
			t.Fatalf("read %s: %v", path, err)
		}
		if _, err := testConn.Exec(ctx, string(sqlBytes)); err != nil {
			_ = testConn.Close(ctx)
			t.Fatalf("apply %s: %v", filepath.Base(path), err)
		}
	}
	_ = testConn.Close(ctx)

	pool, err := pgxpool.New(ctx, testURL)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}

	tdb := &TestDB{
		AdminURL: adminURL,
		URL:      testURL,
		Name:     dbName,
		Pool:     pool,
	}

	t.Cleanup(func() { tdb.Close(t) })
	return tdb
}

// SeedDepartment inserts a department row with a bcrypt-hashed credential.
// Returns the raw credential the caller should pass to the SDK.
func (tdb *TestDB) SeedDepartment(t *testing.T, id, namespace string) string {
	t.Helper()
	credential := fmt.Sprintf("%s-cred-%s", id, randSuffix(4))
	ctx := context.Background()
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO departments (id, namespace_prefix, credential_hash)
		 VALUES ($1, $2, crypt($3, gen_salt('bf')))`,
		id, namespace, credential)
	if err != nil {
		t.Fatalf("seed department %s: %v", id, err)
	}
	return credential
}

// SeedConstitution inserts an active constitution version with optional
// rules. Returns the version ID.
func (tdb *TestDB) SeedConstitution(t *testing.T, rules []RuleSpec) int64 {
	t.Helper()
	ctx := context.Background()
	var versionID int64
	err := tdb.Pool.QueryRow(ctx,
		`INSERT INTO constitution_versions (prose_sha256, rules_sha256, prose_text, rules_yaml, published_by, is_active)
		 VALUES ($1, $2, $3, $4, $5, true)
		 RETURNING version_id`,
		"test-prose-hash", "test-rules-hash", "test prose", "rules: []", "test",
	).Scan(&versionID)
	if err != nil {
		t.Fatalf("seed constitution: %v", err)
	}
	for _, r := range rules {
		_, err := tdb.Pool.Exec(ctx,
			`INSERT INTO constitution_rules (constitution_version_id, rule_id, event_type_pattern, requires_approval_mode, approval_category)
			 VALUES ($1, $2, $3, $4, $5)`,
			versionID, r.ID, r.Pattern, r.ApprovalMode, r.Category)
		if err != nil {
			t.Fatalf("seed rule %s: %v", r.ID, err)
		}
	}
	return versionID
}

// RuleSpec describes a constitution_rules row for SeedConstitution.
type RuleSpec struct {
	ID           string
	Pattern      string
	ApprovalMode string // "per_action", "blanket_category", "none", ""
	Category     string
}

// SeedBudget inserts a budget for the current UTC month.
func (tdb *TestDB) SeedBudget(t *testing.T, departmentID string, limitCents int) {
	t.Helper()
	ctx := context.Background()
	_, err := tdb.Pool.Exec(ctx,
		`INSERT INTO department_budgets (department_id, budget_month, monthly_limit_cents)
		 VALUES ($1, date_trunc('month', current_date)::date, $2)`,
		departmentID, limitCents)
	if err != nil {
		t.Fatalf("seed budget %s: %v", departmentID, err)
	}
}

// Close drops the test database.
func (tdb *TestDB) Close(t *testing.T) {
	t.Helper()
	if tdb.Pool != nil {
		tdb.Pool.Close()
	}
	ctx := context.Background()
	adminConn, err := pgx.Connect(ctx, tdb.AdminURL)
	if err != nil {
		t.Logf("cleanup connect: %v", err)
		return
	}
	defer func() { _ = adminConn.Close(ctx) }()
	if _, err := adminConn.Exec(ctx, "DROP DATABASE IF EXISTS "+tdb.Name+" WITH (FORCE)"); err != nil {
		t.Logf("cleanup drop %s: %v", tdb.Name, err)
	}
}

// migrationPaths walks up from this file to locate tenet-0/db/migrations/.
func migrationPaths(t *testing.T) []string {
	t.Helper()
	_, thisFile, _, _ := runtime.Caller(0)
	// testutil sits at tenet-0/shared/bus-go/testutil/testdb.go.
	// Walk up 3 to reach tenet-0/.
	base := filepath.Dir(filepath.Dir(filepath.Dir(thisFile)))
	migDir := filepath.Join(base, "..", "db", "migrations")
	entries, err := os.ReadDir(migDir)
	if err != nil {
		t.Fatalf("read migrations dir %s: %v", migDir, err)
	}
	var paths []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".sql") {
			paths = append(paths, filepath.Join(migDir, e.Name()))
		}
	}
	sort.Strings(paths)
	return paths
}

// swapDatabase replaces the database name in a libpq URL.
func swapDatabase(raw, newDB string) string {
	u, err := url.Parse(raw)
	if err != nil {
		// Fall back to naive replace.
		parts := strings.Split(raw, "/")
		parts[len(parts)-1] = newDB
		return strings.Join(parts, "/")
	}
	u.Path = "/" + newDB
	return u.String()
}

func randSuffix(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)[:n]
}
