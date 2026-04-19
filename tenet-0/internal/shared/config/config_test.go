package config

import (
	"strings"
	"testing"
	"time"
)

// withEnv runs fn with the given env vars set, restoring prior values after.
func withEnv(t *testing.T, env map[string]string, fn func()) {
	t.Helper()
	prior := make(map[string]string, len(env))
	for k, v := range env {
		prior[k] = getenvForRestore(k)
		setenv(t, k, v)
	}
	defer func() {
		for k := range env {
			if prior[k] == "" {
				unsetenv(t, k)
			} else {
				setenv(t, k, prior[k])
			}
		}
	}()
	fn()
}

func TestLoad_RejectsMissingDatabaseURL(t *testing.T) {
	withEnv(t, map[string]string{"TENET0_DATABASE_URL": ""}, func() {
		_, err := Load()
		if err == nil {
			t.Fatal("Load with missing TENET0_DATABASE_URL should fail")
		}
		if !strings.Contains(err.Error(), "TENET0_DATABASE_URL") {
			t.Errorf("error doesn't name the missing var: %v", err)
		}
	})
}

func TestLoad_RejectsBadDatabaseURLScheme(t *testing.T) {
	withEnv(t, map[string]string{"TENET0_DATABASE_URL": "mysql://nope/db"}, func() {
		_, err := Load()
		if err == nil || !strings.Contains(err.Error(), "scheme") {
			t.Fatalf("expected scheme rejection, got: %v", err)
		}
	})
}

func TestLoad_AcceptsValidDevConfig(t *testing.T) {
	withEnv(t, map[string]string{
		"TENET0_DATABASE_URL": "postgres://test:test@localhost/tenet0",
		"PHASE_SERVICE_TOKEN": "", // dev mode, no secrets enforcement
	}, func() {
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load failed: %v", err)
		}
		if cfg.LogLevel != "info" {
			t.Errorf("default LogLevel should be 'info', got %q", cfg.LogLevel)
		}
		if cfg.IsProduction() {
			t.Error("IsProduction should be false without PHASE_SERVICE_TOKEN")
		}
	})
}

func TestLoad_ProductionFailsClosedOnMissingSecrets(t *testing.T) {
	// Phase token set → prod mode → all required secrets must be present.
	withEnv(t, map[string]string{
		"TENET0_DATABASE_URL":   "postgres://test:test@localhost/tenet0",
		"PHASE_SERVICE_TOKEN":   "pss_service:v1:fake",
		// Deliberately omit the rest — should fail.
		"PRESIDENT_BUS_CREDENTIAL":     "",
		"COMM_MODULE_TOKEN":            "",
		"OPERATOR_DECISION_PUBKEY":     "",
		"OPERATOR_REGISTRATION_PUBKEY": "",
		"DIRECTOR_HMAC_SECRET":         "",
	}, func() {
		_, err := Load()
		if err == nil {
			t.Fatal("Load in prod mode with missing secrets should fail")
		}
		// All four missing secrets should be enumerated in the error.
		for _, want := range []string{
			"PRESIDENT_BUS_CREDENTIAL",
			"COMM_MODULE_TOKEN",
			"OPERATOR_DECISION_PUBKEY",
			"OPERATOR_REGISTRATION_PUBKEY",
			"DIRECTOR_HMAC_SECRET",
		} {
			if !strings.Contains(err.Error(), want) {
				t.Errorf("error doesn't mention missing %q: %v", want, err)
			}
		}
	})
}

func TestLoad_ProductionPasses_AllSecretsPresent(t *testing.T) {
	withEnv(t, map[string]string{
		"TENET0_DATABASE_URL":          "postgres://test:test@localhost/tenet0",
		"PHASE_SERVICE_TOKEN":          "pss_service:v1:fake",
		"PRESIDENT_BUS_CREDENTIAL":     "fake-cred",
		"COMM_MODULE_TOKEN":            "fake-token",
		"OPERATOR_DECISION_PUBKEY":     "fake-pubkey-base64",
		"OPERATOR_REGISTRATION_PUBKEY": "fake-pubkey-base64",
		"DIRECTOR_HMAC_SECRET":         "fake-hmac-secret",
	}, func() {
		cfg, err := Load()
		if err != nil {
			t.Fatalf("Load failed in prod mode with all secrets: %v", err)
		}
		if !cfg.IsProduction() {
			t.Error("IsProduction should be true with PHASE_SERVICE_TOKEN")
		}
	})
}

func TestEnvOrHelpers(t *testing.T) {
	withEnv(t, map[string]string{
		"X_STR":  "abc",
		"X_INT":  "42",
		"X_BOOL": "true",
		"X_DUR":  "5s",
	}, func() {
		if got := envOr("X_STR", "default"); got != "abc" {
			t.Errorf("envOr X_STR = %q", got)
		}
		if got := envOr("X_MISSING", "default"); got != "default" {
			t.Errorf("envOr X_MISSING fallback failed: %q", got)
		}
		if got := envIntOr("X_INT", 0); got != 42 {
			t.Errorf("envIntOr X_INT = %d", got)
		}
		if got := envIntOr("X_BAD", 99); got != 99 {
			t.Errorf("envIntOr fallback on missing failed: %d", got)
		}
		if got := envBoolOr("X_BOOL", false); !got {
			t.Errorf("envBoolOr X_BOOL = false")
		}
		if got := envDurationOr("X_DUR", 0); got != 5*time.Second {
			t.Errorf("envDurationOr X_DUR = %v", got)
		}
		if got := envDurationOr("X_MISSING", 7*time.Second); got != 7*time.Second {
			t.Errorf("envDurationOr fallback failed: %v", got)
		}
	})
}

func TestLoad_PortValidation(t *testing.T) {
	for _, tc := range []struct{ port, wantErrSubstr string }{
		{"0", "1-65535"},
		{"-1", "1-65535"},
		{"99999", "1-65535"},
	} {
		withEnv(t, map[string]string{
			"TENET0_DATABASE_URL": "postgres://test:test@localhost/tenet0",
			"PRESIDENT_PORT":      tc.port,
		}, func() {
			_, err := Load()
			if err == nil || !strings.Contains(err.Error(), tc.wantErrSubstr) {
				t.Errorf("port %q: expected %q in error, got %v", tc.port, tc.wantErrSubstr, err)
			}
		})
	}
}
