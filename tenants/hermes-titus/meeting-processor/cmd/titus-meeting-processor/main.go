package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"syscall"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/config"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/graph"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/securityteam"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/state"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/titus"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/worker"
)

func main() {
	if err := execute(os.Args[1:], os.Stdout, os.Stderr); err != nil {
		if !errors.Is(err, errHealthUnhealthy) {
			_, _ = fmt.Fprintln(os.Stderr, "titus_meeting_processor=failed safe_error_code="+safeCLIError(err))
		}
		os.Exit(1)
	}
}

var errHealthUnhealthy = errors.New("health check failed")

type paths struct {
	config  string
	state   string
	health  string
	handoff string
}

func execute(args []string, stdout, stderr io.Writer) error {
	if len(args) == 0 {
		return errors.New("command_missing")
	}
	switch args[0] {
	case "run":
		configured, err := parseWorkerFlags("run", args[1:])
		if err != nil {
			return err
		}
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()
		return runContinuous(ctx, configured, stderr)
	case "run-once":
		configured, err := parseWorkerFlags("run-once", args[1:])
		if err != nil {
			return err
		}
		return runOnce(context.Background(), configured, stdout, stderr)
	case "health":
		return runHealth(args[1:], stdout)
	case "content-status":
		return runContentStatus(args[1:], stdout)
	case "init-volume":
		return initVolume(args[1:])
	default:
		return errors.New("command_invalid")
	}
}

func runContentStatus(args []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("content-status", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	path := ""
	flags.StringVar(&path, "health", "/data/health.json", "safe health")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || path == "" {
		return errors.New("arguments_invalid")
	}
	content, err := worker.ReadContentHealth(path)
	if err != nil {
		return errors.New("health_invalid")
	}
	_, err = fmt.Fprintf(stdout, "titus_meeting_content_enabled=%t pending=%d processed=%d blocked=%d retryable_error=%d\n", content.Enabled, content.Pending, content.Processed, content.Blocked, content.RetryableError)
	if err != nil {
		return errors.New("output_unavailable")
	}
	return nil
}

func parseWorkerFlags(name string, args []string) (paths, error) {
	flags := flag.NewFlagSet(name, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	configured := paths{}
	flags.StringVar(&configured.config, "config", "/run/secrets/runtime.json", "runtime configuration")
	flags.StringVar(&configured.state, "state", "/data/state.json", "private state")
	flags.StringVar(&configured.health, "health", "/data/health.json", "safe health")
	flags.StringVar(&configured.handoff, "handoff", "/data/handoff.json", "safe handoff")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 {
		return paths{}, errors.New("arguments_invalid")
	}
	if configured.config == "" || configured.state == "" || configured.health == "" || configured.handoff == "" {
		return paths{}, errors.New("arguments_invalid")
	}
	return configured, nil
}

func runOnce(ctx context.Context, paths paths, stdout, stderr io.Writer) error {
	processor, store, err := buildProcessor(paths, stderr)
	if err != nil {
		return err
	}
	defer store.Close()
	result, err := processor.RunOnce(ctx)
	if err != nil {
		return errors.New("cycle_failed")
	}
	_, err = fmt.Fprintf(stdout, "titus_meeting_processor_cycle=healthy streams=%d new_count=%d known_count=%d content_attempted=%t content_processed=%t\n", result.Streams, result.NewCount, result.KnownCount, result.ContentAttempted, result.ContentProcessed)
	return err
}

func runContinuous(ctx context.Context, paths paths, stderr io.Writer) error {
	processor, store, err := buildProcessor(paths, stderr)
	if err != nil {
		return err
	}
	defer store.Close()
	err = worker.RunLoop(ctx, processor, time.Duration(processor.Config.PollIntervalSeconds)*time.Second)
	if errors.Is(err, context.Canceled) {
		return nil
	}
	return errors.New("cycle_failed")
}

func buildProcessor(paths paths, stderr io.Writer) (worker.Processor, *state.Store, error) {
	runtimeConfig, err := config.Load(paths.config)
	if err != nil {
		return worker.Processor{}, nil, errors.New("config_invalid")
	}
	store, err := state.Open(paths.state)
	if err != nil {
		return worker.Processor{}, nil, errors.New(state.ErrorCode(err))
	}
	httpClient := graph.NewHTTPClient(30 * time.Second)
	tokens, err := graph.NewTokenSource(runtimeConfig.TenantID, runtimeConfig.ClientID, runtimeConfig.ClientSecret, httpClient)
	if err != nil {
		store.Close()
		return worker.Processor{}, nil, errors.New("config_invalid")
	}
	graphClient := graph.NewClient(tokens, httpClient)
	processor := worker.Processor{
		Config: runtimeConfig, Store: store, Fetcher: graphClient,
		HealthPath: paths.health, HandoffPath: paths.handoff, Events: stderr,
	}
	if runtimeConfig.ContentEnabled {
		securityClient, securityErr := securityteam.NewClient(runtimeConfig.SecurityTeamBaseURL, runtimeConfig.SecurityServiceToken, &http.Client{Timeout: 30 * time.Second})
		if securityErr != nil {
			store.Close()
			return worker.Processor{}, nil, errors.New("config_invalid")
		}
		titusClient, titusErr := titus.NewClient(runtimeConfig.HermesBaseURL, runtimeConfig.HermesAPIKey, &http.Client{Timeout: 180 * time.Second})
		if titusErr != nil {
			store.Close()
			return worker.Processor{}, nil, errors.New("config_invalid")
		}
		processor.Content = graphClient
		processor.Scanner = securityClient
		processor.Analyzer = titusClient
	}
	return processor, store, nil
}

func runHealth(args []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("health", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	path := ""
	maxAgeRaw := "10m"
	flags.StringVar(&path, "health", "/data/health.json", "safe health")
	flags.StringVar(&maxAgeRaw, "max-age", "10m", "maximum age")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || path == "" {
		return errors.New("arguments_invalid")
	}
	maxAge, err := time.ParseDuration(maxAgeRaw)
	if err != nil || maxAge <= 0 || maxAge > 24*time.Hour {
		return errors.New("arguments_invalid")
	}
	status := worker.HealthStatus(path, time.Now().UTC(), maxAge)
	if _, err := fmt.Fprintf(stdout, "titus_meeting_processor=%s\n", status); err != nil {
		return errors.New("output_unavailable")
	}
	if status != "healthy" {
		return errHealthUnhealthy
	}
	return nil
}

func initVolume(args []string) error {
	flags := flag.NewFlagSet("init-volume", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	path, uidRaw, gidRaw := "", "", ""
	flags.StringVar(&path, "path", "/data", "volume path")
	flags.StringVar(&uidRaw, "uid", "10003", "worker uid")
	flags.StringVar(&gidRaw, "gid", "10003", "worker gid")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 {
		return errors.New("arguments_invalid")
	}
	clean := filepath.Clean(path)
	uid, uidErr := strconv.Atoi(uidRaw)
	gid, gidErr := strconv.Atoi(gidRaw)
	if !filepath.IsAbs(clean) || clean == "/" || uidErr != nil || gidErr != nil || uid < 1 || gid < 1 {
		return errors.New("arguments_invalid")
	}
	if err := os.MkdirAll(clean, 0o700); err != nil {
		return errors.New("volume_unavailable")
	}
	if err := os.Chmod(clean, 0o700); err != nil {
		return errors.New("volume_unavailable")
	}
	if err := os.Chown(clean, uid, gid); err != nil {
		return errors.New("volume_unavailable")
	}
	return nil
}

func safeCLIError(err error) string {
	allowed := map[string]bool{
		"command_missing": true, "command_invalid": true, "arguments_invalid": true,
		"config_invalid": true, "state_invalid": true, "state_unavailable": true,
		"state_lock_busy": true, "cycle_failed": true,
		"volume_unavailable": true, "output_unavailable": true, "health_invalid": true,
	}
	if err != nil && allowed[err.Error()] {
		return err.Error()
	}
	return "internal_error"
}
