package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/analyzer"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/approval"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/config"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/custody"
	meetingemail "github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/email"
	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/filer"
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
	config     string
	state      string
	briefState string
	custodyDir string
	health     string
	handoff    string
}

type runtimeResources struct {
	processor worker.Processor
	discovery *state.Store
	briefs    *state.BriefStore
	review    http.Handler
}

func (resources *runtimeResources) close() {
	if resources.briefs != nil {
		_ = resources.briefs.Close()
	}
	if resources.discovery != nil {
		_ = resources.discovery.Close()
	}
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
	case "retention-sweep":
		return runRetentionSweep(args[1:], stdout)
	case "reset-brief-record":
		return resetBriefRecord(args[1:])
	case "init-volume":
		return initVolume(args[1:])
	default:
		return errors.New("command_invalid")
	}
}

func resetBriefRecord(args []string) error {
	flags := flag.NewFlagSet("reset-brief-record", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	path := "/data/meeting-brief-state.json"
	key := ""
	flags.StringVar(&path, "brief-state", path, "private meeting brief state")
	flags.StringVar(&key, "ref", key, "internal SHA-256 record key")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || path == "" || key == "" {
		return errors.New("arguments_invalid")
	}
	store, err := state.OpenBrief(path)
	if err != nil {
		return err
	}
	defer store.Close()
	return store.ResetBlockedBrief(key, time.Now().UTC())
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
	flags.StringVar(&configured.briefState, "brief-state", "/data/meeting-brief-state.json", "private meeting brief state")
	flags.StringVar(&configured.custodyDir, "custody-dir", "/data/raw-transcript-custody", "encrypted transcript custody")
	flags.StringVar(&configured.health, "health", "/data/health.json", "safe health")
	flags.StringVar(&configured.handoff, "handoff", "/data/handoff.json", "safe handoff")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 {
		return paths{}, errors.New("arguments_invalid")
	}
	if configured.config == "" || configured.state == "" || configured.briefState == "" || configured.custodyDir == "" || configured.health == "" || configured.handoff == "" {
		return paths{}, errors.New("arguments_invalid")
	}
	return configured, nil
}

func runOnce(ctx context.Context, paths paths, stdout, stderr io.Writer) error {
	resources, err := buildProcessor(paths, stderr)
	if err != nil {
		return err
	}
	defer resources.close()
	result, err := resources.processor.RunOnce(ctx)
	if err != nil {
		return errors.New("cycle_failed")
	}
	_, err = fmt.Fprintf(stdout, "titus_meeting_processor_cycle=healthy streams=%d new_count=%d known_count=%d content_attempted=%t content_processed=%t\n", result.Streams, result.NewCount, result.KnownCount, result.ContentAttempted, result.ContentProcessed)
	return err
}

func runContinuous(ctx context.Context, paths paths, stderr io.Writer) error {
	resources, err := buildProcessor(paths, stderr)
	if err != nil {
		return err
	}
	defer resources.close()
	runCtx, cancel := context.WithCancel(ctx)
	defer cancel()
	var server *http.Server
	serverErrors := make(chan error, 1)
	if resources.review != nil {
		server = &http.Server{Addr: ":8080", Handler: resources.review, ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 10 * time.Second, WriteTimeout: 10 * time.Second, IdleTimeout: 30 * time.Second, MaxHeaderBytes: 8 << 10}
		listener, listenErr := net.Listen("tcp", server.Addr)
		if listenErr != nil {
			return errors.New("review_server_unavailable")
		}
		go func() {
			<-runCtx.Done()
			shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = server.Shutdown(shutdown)
		}()
		go func() {
			if serveErr := server.Serve(listener); serveErr != nil && !errors.Is(serveErr, http.ErrServerClosed) {
				_, _ = fmt.Fprintln(stderr, "titus_meeting_review=failed safe_error_code=review_server_unavailable")
				serverErrors <- serveErr
			}
		}()
	}
	workerErrors := make(chan error, 1)
	go func() {
		workerErrors <- worker.RunLoop(runCtx, resources.processor, time.Duration(resources.processor.Config.PollIntervalSeconds)*time.Second)
	}()
	select {
	case <-ctx.Done():
		cancel()
		<-workerErrors
		return nil
	case <-serverErrors:
		cancel()
		<-workerErrors
		return errors.New("review_server_unavailable")
	case err = <-workerErrors:
		if errors.Is(err, context.Canceled) {
			return nil
		}
		return errors.New("cycle_failed")
	}
}

func buildProcessor(paths paths, stderr io.Writer) (*runtimeResources, error) {
	runtimeConfig, err := config.Load(paths.config)
	if err != nil {
		return nil, errors.New("config_invalid")
	}
	store, err := state.Open(paths.state)
	if err != nil {
		return nil, errors.New(state.ErrorCode(err))
	}
	resources := &runtimeResources{discovery: store}
	httpClient := graph.NewHTTPClient(30 * time.Second)
	tokens, err := graph.NewTokenSource(runtimeConfig.TenantID, runtimeConfig.ClientID, runtimeConfig.ClientSecret, httpClient)
	if err != nil {
		resources.close()
		return nil, errors.New("config_invalid")
	}
	graphClient := graph.NewClient(tokens, httpClient)
	processor := worker.Processor{
		Config: runtimeConfig, Store: store, Fetcher: graphClient,
		HealthPath: paths.health, HandoffPath: paths.handoff, Events: stderr,
	}
	if runtimeConfig.MeetingBriefEnabled {
		lifecycleMu := &sync.Mutex{}
		briefs, briefErr := state.OpenBrief(paths.briefState)
		if briefErr != nil {
			resources.close()
			return nil, errors.New(state.ErrorCode(briefErr))
		}
		resources.briefs = briefs
		ring, ringErr := custody.ParseKeyRing(runtimeConfig.MeetingCustodyKeysJSON, runtimeConfig.MeetingCustodyActiveKeyID)
		routes, routeErr := analyzer.ParseRoutesJSON(runtimeConfig.MeetingProjectRoutesJSON)
		securityClient, securityErr := securityteam.NewClient(runtimeConfig.SecurityTeamBaseURL, runtimeConfig.SecurityServiceToken, &http.Client{Timeout: 30 * time.Second})
		titusClient, titusErr := titus.NewMeetingBriefClient(runtimeConfig.HermesBaseURL, runtimeConfig.HermesAPIKey, &http.Client{Timeout: 60 * time.Second})
		mailClient, mailErr := meetingemail.NewClient(runtimeConfig.SecurityTeamBaseURL, runtimeConfig.SecurityServiceToken, meetingemail.AgentMailOrigin, runtimeConfig.MeetingAgentMailAPIKey, runtimeConfig.MeetingAgentMailInboxID, [2]string{runtimeConfig.MeetingGaryEmail, runtimeConfig.MeetingAustinEmail}, &http.Client{Timeout: 30 * time.Second})
		review, reviewErr := approval.NewHandlerWithMutex(briefs, runtimeConfig.MeetingReviewBearer, runtimeConfig.MeetingReviewSigningSecret, runtimeConfig.MeetingGaryEmail, runtimeConfig.MeetingAustinEmail, time.Now, lifecycleMu)
		if ringErr != nil || routeErr != nil || securityErr != nil || titusErr != nil || mailErr != nil || reviewErr != nil {
			resources.close()
			return nil, errors.New("config_invalid")
		}
		processor.Content = graphClient
		processor.Scanner = securityClient
		processor.Briefs = briefs
		processor.Custody = custody.Manager{Dir: paths.custodyDir, Ring: ring}
		processor.Analyzer = titusClient
		processor.Mailer = mailClient
		processor.Recorder = graphClient
		processor.Routes = routes
		processor.LifecycleMu = lifecycleMu
		resources.review = review
		if runtimeConfig.MeetingFilingEnabled {
			filerClient, filerErr := filer.NewClient(runtimeConfig.MeetingFilerBaseURL, runtimeConfig.MeetingFilerBearer, &http.Client{Timeout: 60 * time.Second})
			if filerErr != nil {
				resources.close()
				return nil, errors.New("config_invalid")
			}
			processor.Filer = filerClient
		}
	} else if runtimeConfig.ContentEnabled {
		securityClient, securityErr := securityteam.NewClient(runtimeConfig.SecurityTeamBaseURL, runtimeConfig.SecurityServiceToken, &http.Client{Timeout: 30 * time.Second})
		if securityErr != nil {
			resources.close()
			return nil, errors.New("config_invalid")
		}
		titusClient, titusErr := titus.NewMarkdownClient(runtimeConfig.HermesBaseURL, runtimeConfig.HermesAPIKey, &http.Client{Timeout: 180 * time.Second})
		if titusErr != nil {
			resources.close()
			return nil, errors.New("config_invalid")
		}
		processor.Content = graphClient
		processor.Scanner = securityClient
		processor.Analyzer = titusClient
	}
	resources.processor = processor
	return resources, nil
}

func runRetentionSweep(args []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("retention-sweep", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	configPath, briefPath, custodyDir := "/run/secrets/runtime.json", "/data/meeting-brief-state.json", "/data/raw-transcript-custody"
	flags.StringVar(&configPath, "config", configPath, "runtime configuration")
	flags.StringVar(&briefPath, "brief-state", briefPath, "private meeting brief state")
	flags.StringVar(&custodyDir, "custody-dir", custodyDir, "encrypted transcript custody")
	if err := flags.Parse(args); err != nil || flags.NArg() != 0 || configPath == "" || briefPath == "" || custodyDir == "" {
		return errors.New("arguments_invalid")
	}
	// Retention intentionally does not load processing credentials. Ciphertext
	// expiry and orphan cleanup must remain operable after feature rollback.
	if _, err := os.Stat(configPath); err != nil {
		return errors.New("config_invalid")
	}
	briefs, err := state.OpenBrief(briefPath)
	if err != nil {
		return errors.New(state.ErrorCode(err))
	}
	defer briefs.Close()
	doc := briefs.Document()
	keys := make([]string, 0)
	records := make([]custody.Record, 0)
	for key, record := range doc.Records {
		if record.Custody != nil {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		records = append(records, *doc.Records[key].Custody)
	}
	result := (custody.Manager{Dir: custodyDir}).Sweep(records)
	for index, key := range keys {
		record := doc.Records[key]
		value := result.Records[index]
		record.Custody = &value
		record.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
		doc.Records[key] = record
	}
	if err := briefs.Commit(doc); err != nil {
		return errors.New(state.ErrorCode(err))
	}
	if result.Blocked {
		return errors.New("retention_blocked")
	}
	_, err = fmt.Fprintf(stdout, "titus_meeting_retention=healthy records=%d\n", len(records))
	return err
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
		"review_server_unavailable": true,
		"retention_blocked":         true,
		"volume_unavailable":        true, "output_unavailable": true, "health_invalid": true,
	}
	if err != nil && allowed[err.Error()] {
		return err.Error()
	}
	return "internal_error"
}
