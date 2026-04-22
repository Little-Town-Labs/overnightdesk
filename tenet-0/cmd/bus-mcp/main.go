// Package main is the entry point for tenet0-bus-mcp.
//
// This binary wraps shared/bus-go behind an MCP server so Director subagents
// can publish/query/walk-causality on the Feature 49 event bus without
// linking the bus client themselves. See spec FR-1 + plan §The 6 MCP Servers.
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/overnightdesk/tenet-0/internal/bus"
	"github.com/overnightdesk/tenet-0/internal/shared/config"
	"github.com/overnightdesk/tenet-0/internal/shared/mcp"
	"github.com/overnightdesk/tenet-0/internal/shared/pgxutil"
)

const binaryName = "tenet0-bus-mcp"

func main() {
	healthcheck := flag.Bool("healthcheck", false, "probe DB connectivity and exit (RES-4 subprocess healthcheck contract)")
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

// runHealthcheck loads config, opens a short-lived pool, pings it, and
// exits 0/1. RES-4 contract — healthcheck-poller invokes `<binary>
// --healthcheck` as a subprocess and records the exit code.
func runHealthcheck(logger *slog.Logger) int {
	cfg, err := config.Load()
	if err != nil {
		logger.Error("healthcheck: config", "error", err)
		return 1
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pool, err := pgxutil.New(ctx, cfg.DatabaseURL, "bus-mcp-healthcheck")
	if err != nil {
		logger.Error("healthcheck: pool", "error", err)
		return 1
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		logger.Error("healthcheck: ping", "error", err)
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

	// bus-mcp runs under the President Director's bus credential: the
	// Director runtime is the thing holding the Phase-injected credential
	// and brokering publishes on its subagents' behalf.
	handler, err := bus.New(bus.Config{
		Department:  "president",
		Credential:  cfg.PresidentBusCredential,
		PostgresURL: cfg.DatabaseURL,
		HMACSecret:  []byte(cfg.DirectorHmacSecret),
		Logger:      logger,
	})
	if err != nil {
		return fmt.Errorf("bus handler: %w", err)
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

	logger.Info(binaryName+": serving stdio")
	if err := srv.Run(ctx); err != nil {
		return fmt.Errorf("serve: %w", err)
	}
	logger.Info(binaryName + ": shutdown clean")
	return nil
}
