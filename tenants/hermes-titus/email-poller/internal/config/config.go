package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	"overnightdesk/titus-email-poller/internal/policy"
)

type routeDefinition struct {
	address string
	target  string
}

var routes = map[string]routeDefinition{
	"titus":   {address: "titus-operations@agentmail.to", target: "hermes-titus"},
	"agent":   {address: "acerockstar@agentmail.to", target: "hermes-agent"},
	"walter":  {address: "acerockstar@agentmail.to", target: "hermes-walter"},
	"mitchel": {address: "thediamondguy@agentmail.to", target: "hermes-mitchel"},
}

type Config struct {
	AgentMailAPIKey string
	InboxAddress    string
	InboxID         string
	DatabaseURL     string
	AllowedSenders  map[string]struct{}
	RouteID         string
	HermesAPIKey    string
	HermesBaseURL   string
	TargetAgent     string
	Enabled         bool
	Interval        time.Duration
	MaxMessages     int
	MaxCleanClaims  int
	RunTimeout      time.Duration
}

type rawConfig struct {
	AgentMailAPIKey string `json:"AGENTMAIL_API_KEY"`
	InboxAddress    string `json:"AGENTMAIL_EMAIL_ADDRESS"`
	InboxID         string `json:"AGENTMAIL_INBOX_ID"`
	DatabaseURL     string `json:"DATABASE_URL"`
	AllowedSenders  string `json:"EMAIL_ALLOWED_SENDERS"`
	RouteID         string `json:"EMAIL_ROUTE_ID"`
	HermesAPIKey    string `json:"HERMES_API_KEY"`
	HermesBaseURL   string `json:"HERMES_BASE_URL"`
	TargetAgent     string `json:"HERMES_TARGET_AGENT"`
	Enabled         string `json:"AGENTMAIL_POLLING_ENABLED"`
	Interval        string `json:"AGENTMAIL_POLL_INTERVAL_SECONDS"`
	MaxMessages     string `json:"AGENTMAIL_MAX_MESSAGES_PER_CYCLE"`
	MaxCleanClaims  string `json:"EMAIL_MAX_CLEAN_CLAIMS_PER_CYCLE"`
	RunTimeout      string `json:"HERMES_RUN_TIMEOUT_SECONDS"`
}

func Load(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, err
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
	decoder.DisallowUnknownFields()
	var raw rawConfig
	if err := decoder.Decode(&raw); err != nil {
		return Config{}, fmt.Errorf("decode config: %w", err)
	}
	if decoder.Decode(&struct{}{}) != io.EOF {
		return Config{}, errors.New("config has trailing JSON")
	}
	return raw.validate()
}

func (raw rawConfig) validate() (Config, error) {
	if hasEmpty(raw.AgentMailAPIKey, raw.InboxID, raw.DatabaseURL, raw.AllowedSenders,
		raw.RouteID, raw.HermesAPIKey, raw.HermesBaseURL, raw.TargetAgent) {
		return Config{}, errors.New("required runtime setting is empty")
	}
	definition, ok := routes[raw.RouteID]
	if !ok || definition.target != raw.TargetAgent {
		return Config{}, errors.New("email route does not match target agent")
	}
	inboxAddress, ok := policy.NormalizeAddress(raw.InboxAddress)
	if !ok || inboxAddress != definition.address {
		return Config{}, errors.New("email route does not match inbox address")
	}
	if err := validateDatabaseURL(raw.DatabaseURL); err != nil {
		return Config{}, err
	}
	if err := validateHermesURL(raw.HermesBaseURL, raw.TargetAgent); err != nil {
		return Config{}, err
	}
	enabled, err := parseBool(raw.Enabled)
	if err != nil {
		return Config{}, err
	}
	allowed := make(map[string]struct{})
	if raw.AllowedSenders != "NOT_CONFIGURED" {
		allowed, err = policy.ParseAddressSet(raw.AllowedSenders)
		if err != nil || len(allowed) == 0 {
			return Config{}, errors.New("allowed sender set is invalid")
		}
	} else if enabled {
		return Config{}, errors.New("enabled route requires an exact allowed sender")
	}
	interval, err := parseBounded(raw.Interval, 30, 300, "poll interval")
	if err != nil {
		return Config{}, err
	}
	maxMessages, err := parseBounded(raw.MaxMessages, 1, 20, "message limit")
	if err != nil {
		return Config{}, err
	}
	maxClaims, err := parseBounded(raw.MaxCleanClaims, 1, 20, "clean claim limit")
	if err != nil {
		return Config{}, err
	}
	runTimeout, err := parseBounded(raw.RunTimeout, 60, 3600, "Hermes run timeout")
	if err != nil {
		return Config{}, err
	}
	return Config{
		AgentMailAPIKey: raw.AgentMailAPIKey, InboxAddress: inboxAddress,
		InboxID: raw.InboxID, DatabaseURL: raw.DatabaseURL,
		AllowedSenders: allowed, RouteID: raw.RouteID,
		HermesAPIKey: raw.HermesAPIKey, HermesBaseURL: strings.TrimRight(raw.HermesBaseURL, "/"),
		TargetAgent: raw.TargetAgent, Enabled: enabled,
		Interval: time.Duration(interval) * time.Second, MaxMessages: maxMessages,
		MaxCleanClaims: maxClaims, RunTimeout: time.Duration(runTimeout) * time.Second,
	}, nil
}

func hasEmpty(values ...string) bool {
	for _, value := range values {
		if strings.TrimSpace(value) == "" {
			return true
		}
	}
	return false
}

func validateDatabaseURL(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil || (parsed.Scheme != "postgres" && parsed.Scheme != "postgresql") || parsed.Host == "" {
		return errors.New("database URL is invalid")
	}
	return nil
}

func validateHermesURL(raw, target string) error {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "http" || parsed.Hostname() != target ||
		parsed.Port() != "8642" || parsed.Path != "" || parsed.RawQuery != "" || parsed.User != nil {
		return errors.New("Hermes base URL must use the private target on port 8642")
	}
	return nil
}

func parseBool(raw string) (bool, error) {
	if raw != "true" && raw != "false" {
		return false, errors.New("polling enabled must be true or false")
	}
	return strconv.ParseBool(raw)
}

func parseBounded(raw string, minimum, maximum int, name string) (int, error) {
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be between %d and %d", name, minimum, maximum)
	}
	return value, nil
}
