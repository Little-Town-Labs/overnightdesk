package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"time"

	"overnightdesk/titus-email-poller/internal/policy"
)

var ApprovedAddresses = map[string]struct{}{
	"garyb@timelesstechs.com":  {},
	"austin@timelesstechs.com": {},
}

type Config struct {
	AgentMailAPIKey string
	InboxAddress    string
	InboxID         string
	Model           string
	OpenRouterKey   string
	Enabled         bool
	Interval        time.Duration
	TrustedSenders  map[string]struct{}
	Approvers       map[string]struct{}
	MaxMessages     int
	SigningSecret   string
}

type rawConfig struct {
	AgentMailAPIKey string `json:"AGENTMAIL_API_KEY"`
	InboxAddress    string `json:"AGENTMAIL_EMAIL_ADDRESS"`
	InboxID         string `json:"AGENTMAIL_INBOX_ID"`
	Model           string `json:"HERMES_DEFAULT_MODEL"`
	OpenRouterKey   string `json:"OPENROUTER_API_KEY"`
	Enabled         string `json:"AGENTMAIL_POLLING_ENABLED"`
	Interval        string `json:"AGENTMAIL_POLL_INTERVAL_SECONDS"`
	TrustedSenders  string `json:"AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS"`
	Approvers       string `json:"AGENTMAIL_APPROVAL_ALLOWED_SENDERS"`
	MaxMessages     string `json:"AGENTMAIL_MAX_MESSAGES_PER_CYCLE"`
	SigningSecret   string `json:"AGENTMAIL_APPROVAL_SIGNING_SECRET"`
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
	if raw.AgentMailAPIKey == "" || raw.InboxID == "" || raw.Model == "" || raw.OpenRouterKey == "" {
		return Config{}, errors.New("required provider setting is empty")
	}
	inboxAddress, ok := policy.NormalizeAddress(raw.InboxAddress)
	if !ok {
		return Config{}, errors.New("AgentMail inbox address is invalid")
	}
	enabled, err := strconv.ParseBool(raw.Enabled)
	if err != nil || (raw.Enabled != "true" && raw.Enabled != "false") {
		return Config{}, errors.New("polling enabled must be true or false")
	}
	interval, err := parseBounded(raw.Interval, 30, 300, "poll interval")
	if err != nil {
		return Config{}, err
	}
	maximum, err := parseBounded(raw.MaxMessages, 1, 20, "message limit")
	if err != nil {
		return Config{}, err
	}
	trusted, err := exactSet(raw.TrustedSenders, "trusted sender set")
	if err != nil {
		return Config{}, err
	}
	approvers, err := exactSet(raw.Approvers, "approver set")
	if err != nil {
		return Config{}, err
	}
	if len([]byte(raw.SigningSecret)) < 32 {
		return Config{}, errors.New("approval signing secret is too short")
	}
	return Config{
		AgentMailAPIKey: raw.AgentMailAPIKey, InboxAddress: inboxAddress,
		InboxID: raw.InboxID, Model: raw.Model, OpenRouterKey: raw.OpenRouterKey,
		Enabled: enabled, Interval: time.Duration(interval) * time.Second,
		TrustedSenders: trusted, Approvers: approvers, MaxMessages: maximum,
		SigningSecret: raw.SigningSecret,
	}, nil
}

func parseBounded(raw string, minimum, maximum int, name string) (int, error) {
	value, err := strconv.Atoi(raw)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("%s must be between %d and %d", name, minimum, maximum)
	}
	return value, nil
}

func exactSet(raw, name string) (map[string]struct{}, error) {
	values, err := policy.ParseAddressSet(raw)
	if err != nil || !policy.EqualAddressSets(values, ApprovedAddresses) {
		return nil, fmt.Errorf("%s must match approved addresses", name)
	}
	return values, nil
}
