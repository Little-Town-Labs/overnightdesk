// Package config loads Director Runtime configuration from environment
// variables. Phase.dev secrets are injected by the container at startup as
// regular environment variables, so this package treats them identically.
//
// Mirrors the engine pattern at /mnt/f/overnightdesk-engine/internal/shared/
// config/config.go — same envOr/envIntOr/envBoolOr/envDurationOr helpers,
// same fail-closed contract when PHASE_SERVICE_TOKEN is set.
//
// Per-binary additions (e.g. bus-watcher's COMM_MODULE_URL, audit-self-
// checker's AUDIT_CYCLE_INTERVAL) live in each binary's own config package
// or directly in main.go — this shared package only handles vars common to
// every Director Runtime binary.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the Director Runtime's shared runtime configuration.
type Config struct {
	// Postgres connection (DSN form: postgres://user:pass@host:port/db?sslmode=...)
	// Used by every binary that talks to the Tenet-0 Postgres instance
	// (which is most of them). Passed to pgxpool.New.
	DatabaseURL string

	// Logging
	LogLevel string

	// HTTP server (used by daemons that expose /healthz + /metrics).
	// MCP servers ignore Port — they speak stdio.
	Port        int
	BindAddress string

	// Phase.dev integration (optional in dev, required in prod).
	// Presence of PhaseServiceToken triggers the fail-closed secret
	// enforcement in Load.
	PhaseServiceToken string
	PhaseAppName      string
	PhaseEnvName      string

	// REQUIRED-IN-PROD secrets. Each name maps to the Phase.dev path layout
	// from research.md §Credential Management Strategy.

	// PresidentBusCredential: Feature 49 FR-2a credential authorizing
	// publishes under the `president.*` namespace. One per Director, but
	// the President's is the only one needed by the runtime itself.
	PresidentBusCredential string

	// CommModuleToken: bearer token for POST /v1/inject/zero (RES-2).
	CommModuleToken string

	// OperatorDecisionPubkey: Ed25519 verifying key for operator-signed
	// decisions (security T4). Base64-encoded.
	OperatorDecisionPubkey string

	// OperatorRegistrationPubkey: Ed25519 verifying key for reserved-
	// namespace Director registration manifests (security T3).
	OperatorRegistrationPubkey string

	// DirectorHmacSecret: shared secret used to bind subagent identity to
	// each MCP call (security §3 / RES research §MCP Server Auth).
	DirectorHmacSecret string

	// Timeouts
	GracefulShutdownTimeout time.Duration
}

// Load reads configuration from environment variables, validates it, and
// returns a populated Config. In dev (PHASE_SERVICE_TOKEN unset), missing
// secrets default to empty — callers must check IsProduction before assuming
// secrets are populated. In prod, all required secrets MUST be present and
// Load fails closed.
func Load() (*Config, error) {
	cfg := &Config{
		DatabaseURL:                 os.Getenv("TENET0_DATABASE_URL"),
		LogLevel:                    envOr("LOG_LEVEL", "info"),
		Port:                        envIntOr("PRESIDENT_PORT", 9201),
		BindAddress:                 envOr("BIND_ADDRESS", "0.0.0.0"),
		PhaseServiceToken:           os.Getenv("PHASE_SERVICE_TOKEN"),
		PhaseAppName:                os.Getenv("PHASE_APP_NAME"),
		PhaseEnvName:                os.Getenv("PHASE_ENV_NAME"),
		PresidentBusCredential:      os.Getenv("PRESIDENT_BUS_CREDENTIAL"),
		CommModuleToken:             os.Getenv("COMM_MODULE_TOKEN"),
		OperatorDecisionPubkey:      os.Getenv("OPERATOR_DECISION_PUBKEY"),
		OperatorRegistrationPubkey:  os.Getenv("OPERATOR_REGISTRATION_PUBKEY"),
		DirectorHmacSecret:          os.Getenv("DIRECTOR_HMAC_SECRET"),
		GracefulShutdownTimeout:     envDurationOr("GRACEFUL_SHUTDOWN_TIMEOUT", 15*time.Second),
	}

	// Port range. PRESIDENT_PORT applies to daemons; MCPs ignore it but
	// the validation runs uniformly so misconfiguration surfaces clearly.
	if cfg.Port < 1 || cfg.Port > 65535 {
		return nil, fmt.Errorf("PRESIDENT_PORT must be 1-65535, got %d", cfg.Port)
	}

	// DSN required for everyone; Phase mode or not.
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("TENET0_DATABASE_URL is required")
	}
	if !strings.HasPrefix(cfg.DatabaseURL, "postgres://") &&
		!strings.HasPrefix(cfg.DatabaseURL, "postgresql://") {
		return nil, fmt.Errorf("TENET0_DATABASE_URL must use postgres:// or postgresql:// scheme")
	}

	// Production secrets enforcement: if Phase is configured, all required
	// secrets must be present. Protects against silently-missing prod
	// secrets per Constitution Principle 2 (Security as Feature).
	if cfg.PhaseServiceToken != "" {
		var missing []string
		if cfg.PresidentBusCredential == "" {
			missing = append(missing, "PRESIDENT_BUS_CREDENTIAL")
		}
		if cfg.CommModuleToken == "" {
			missing = append(missing, "COMM_MODULE_TOKEN")
		}
		if cfg.OperatorDecisionPubkey == "" {
			missing = append(missing, "OPERATOR_DECISION_PUBKEY")
		}
		if cfg.OperatorRegistrationPubkey == "" {
			missing = append(missing, "OPERATOR_REGISTRATION_PUBKEY")
		}
		if cfg.DirectorHmacSecret == "" {
			missing = append(missing, "DIRECTOR_HMAC_SECRET")
		}
		if len(missing) > 0 {
			return nil, fmt.Errorf(
				"phase mode active but secrets missing: %s",
				strings.Join(missing, ", "),
			)
		}
	}

	return cfg, nil
}

// IsProduction reports whether the runtime is operating with Phase.dev
// secrets injected (i.e., not in local dev). Useful for code paths that
// should be more cautious in prod (e.g., disable demo-mode shortcuts).
func (c *Config) IsProduction() bool {
	return c.PhaseServiceToken != ""
}

// envOr returns the env var if set and non-empty, else fallback.
func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// envIntOr returns the env var parsed as int, or fallback if missing or
// unparseable. Silent fallback on parse error matches engine convention.
func envIntOr(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

// envBoolOr returns the env var parsed as bool, or fallback. Accepts the
// strings strconv.ParseBool understands ("true", "1", "yes", etc.).
func envBoolOr(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

// envDurationOr returns the env var parsed via time.ParseDuration, or
// fallback if missing or unparseable.
func envDurationOr(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil {
		return fallback
	}
	return d
}
