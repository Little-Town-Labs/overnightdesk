// Package main is the entry point for tenet0-constitution-mcp.
//
// Wraps Feature 49's constitution evaluator + the Feature 50
// memory_access_matrix loader behind an MCP server so Director subagents can
// ask "is this event constitutional?" / "does it need approval?" /
// "what's the active blanket-authorization list?" without linking the bus
// client or the YAML loader themselves. See spec FR-13/14 + plan §The 6 MCP
// Servers.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/overnightdesk/tenet-0/internal/constitution"
	"github.com/overnightdesk/tenet-0/internal/shared/config"
	sharedconst "github.com/overnightdesk/tenet-0/internal/shared/constitution"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
)

const binaryName = "tenet0-constitution-mcp"

// Paths to the on-disk constitution artifacts. Bind-mounted into the tenet-0
// image at fixed locations; overridable via env for dev/tests.
var (
	defaultConstitutionMDPath   = "/etc/tenet-0/constitution.md"
	defaultConstitutionYAMLPath = "/etc/tenet-0/constitution-rules.yaml"
)

func constitutionMDPath() string {
	if v := os.Getenv("CONSTITUTION_MD_PATH"); v != "" {
		return v
	}
	return defaultConstitutionMDPath
}

func constitutionYAMLPath() string {
	if v := os.Getenv("CONSTITUTION_YAML_PATH"); v != "" {
		return v
	}
	return defaultConstitutionYAMLPath
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "validate YAML parses + constitution.md readable, exit 0/1 (RES-4 contract)")
	flag.Parse()

	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))

	if *healthcheck {
		os.Exit(runHealthcheck(logger))
	}

	if err := run(logger); err != nil {
		logger.Error(binaryName+": fatal", "error", err)
		os.Exit(1)
	}
}

// runHealthcheck validates the two constitution files without touching
// Postgres or the bus. RES-4 contract — healthcheck-poller invokes the
// binary with --healthcheck as a subprocess and records the exit code.
func runHealthcheck(logger *slog.Logger) int {
	if _, err := config.Load(); err != nil {
		logger.Error("healthcheck: config", "error", err)
		return 1
	}
	mdPath := constitutionMDPath()
	yamlPath := constitutionYAMLPath()

	if _, err := os.Stat(mdPath); err != nil {
		logger.Error("healthcheck: constitution.md", "path", mdPath, "error", err)
		return 1
	}
	if _, err := sharedconst.LoadFromFile(yamlPath); err != nil {
		logger.Error("healthcheck: constitution yaml", "path", yamlPath, "error", err)
		return 1
	}
	return 0
}

// run wires the handler + mcp server and serves stdio until signalled.
func run(logger *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}

	handler, err := constitution.New(constitution.Config{
		PostgresURL:          cfg.DatabaseURL,
		ConstitutionMDPath:   constitutionMDPath(),
		ConstitutionYAMLPath: constitutionYAMLPath(),
		Department:           "president",
		Credential:           cfg.PresidentBusCredential,
		Logger:               logger,
	})
	if err != nil {
		return fmt.Errorf("constitution handler: %w", err)
	}
	defer handler.Close()

	srv := mcp.NewServer(binaryName, "0.1.0", logger)
	if srv == nil {
		return fmt.Errorf("mcp: NewServer returned nil")
	}
	if err := handler.RegisterTools(srv); err != nil {
		return fmt.Errorf("register tools: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	logger.Info(binaryName + ": serving stdio")
	if err := srv.Run(ctx); err != nil {
		return fmt.Errorf("serve: %w", err)
	}
	logger.Info(binaryName + ": shutdown clean")
	return nil
}
