package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"overnightdesk/titus-email-poller/internal/config"
	"overnightdesk/titus-email-poller/internal/state"
	"overnightdesk/titus-email-poller/internal/store"
	"overnightdesk/titus-email-poller/internal/transport"
	"overnightdesk/titus-email-poller/internal/worker"
)

const (
	agentMailBaseURL = "https://api.agentmail.to/v0"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "titus-email-poller:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	if len(arguments) == 0 {
		return fmt.Errorf("command required: run, run-once, initialize, health, or init-volume")
	}
	switch arguments[0] {
	case "health":
		return healthCommand(arguments[1:])
	case "init-volume":
		return initVolumeCommand(arguments[1:])
	case "run", "run-once", "initialize":
		return workerCommand(arguments[0], arguments[1:])
	default:
		return fmt.Errorf("unknown command %q", arguments[0])
	}
}

func workerCommand(command string, arguments []string) error {
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	configPath := flags.String("config", "/run/secrets/runtime.json", "read-only runtime JSON")
	statePath := flags.String("state", "/data/state.json", "durable state path")
	healthPath := flags.String("health", "/data/health.json", "health path")
	replayMessageID := flags.String("replay-message-id", "", "leave one inbound message pending during initialization")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	configuration, err := config.Load(*configPath)
	if err != nil {
		return fmt.Errorf("load configuration: %w", err)
	}
	stateStore, err := state.Open(*statePath)
	if err != nil {
		return fmt.Errorf("open state: %w", err)
	}
	var repository store.Repository
	if configuration.Enabled {
		postgres, err := store.Open(context.Background(), configuration.DatabaseURL)
		if err != nil {
			return fmt.Errorf("open intake database: %w", err)
		}
		defer postgres.Close()
		repository = postgres
	}
	agentmail := transport.NewAgentMailClient(agentMailBaseURL, configuration.AgentMailAPIKey, configuration.InboxID, 15*time.Second)
	hermes := transport.NewHermesClient(configuration.HermesBaseURL, configuration.HermesAPIKey, configuration.RunTimeout)
	if configuration.Enabled {
		if err := hermes.CheckCapabilities(); err != nil {
			return fmt.Errorf("check Hermes capabilities: %w", err)
		}
	}
	poller := worker.New(configuration, stateStore, repository, agentmail, hermes, *healthPath)
	if command == "initialize" {
		if configuration.Enabled {
			return fmt.Errorf("initialization requires polling disabled")
		}
		result, err := poller.Initialize(*replayMessageID)
		return printResult(result, err)
	}
	if command == "run-once" {
		result, err := poller.RunOnce()
		return printResult(result, err)
	}
	return runLoop(poller, configuration.Interval)
}

func runLoop(poller *worker.Worker, interval time.Duration) error {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if _, err := poller.RunOnce(); err != nil {
			fmt.Fprintln(os.Stderr, "titus-email-poller: cycle failed")
		}
		select {
		case <-stop:
			return nil
		case <-ticker.C:
		}
	}
}

func healthCommand(arguments []string) error {
	flags := flag.NewFlagSet("health", flag.ContinueOnError)
	healthPath := flags.String("health", "/data/health.json", "health path")
	maximumAge := flags.Duration("max-age", 180*time.Second, "maximum enabled heartbeat age")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	healthy, status := worker.Health(*healthPath, time.Now(), *maximumAge)
	fmt.Println("titus_email_poller=" + status)
	if !healthy {
		return fmt.Errorf("unhealthy")
	}
	return nil
}

func initVolumeCommand(arguments []string) error {
	flags := flag.NewFlagSet("init-volume", flag.ContinueOnError)
	path := flags.String("path", "/data", "volume mount path")
	uid := flags.Int("uid", 10002, "runtime uid")
	gid := flags.Int("gid", 10002, "runtime gid")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if err := os.MkdirAll(*path, 0o700); err != nil {
		return err
	}
	if err := os.Chown(*path, *uid, *gid); err != nil {
		return err
	}
	return os.Chmod(*path, 0o700)
}

func printResult(result worker.Result, err error) error {
	if err != nil {
		return err
	}
	raw, marshalErr := json.Marshal(result)
	if marshalErr != nil {
		return marshalErr
	}
	fmt.Println(string(raw))
	return nil
}
