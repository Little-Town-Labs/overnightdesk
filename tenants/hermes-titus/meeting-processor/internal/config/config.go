package config

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"regexp"
	"strings"
	"unicode"
)

const (
	PollIntervalSeconds  = 300
	InitialLookbackHours = 168
)

var uuidPattern = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$`)

type Organizer struct {
	Slot   string
	UserID string
}

type Config struct {
	TenantID             string
	ClientID             string
	ClientSecret         string
	Organizers           [2]Organizer
	PollIntervalSeconds  int
	InitialLookbackHours int
	ContentEnabled       bool
	SecurityTeamBaseURL  string
	SecurityServiceToken string
	HermesBaseURL        string
	HermesAPIKey         string
}

type runtimeDocument struct {
	TenantID             string `json:"MSGRAPH_TENANT_ID"`
	ClientID             string `json:"MSGRAPH_CLIENT_ID"`
	ClientSecret         string `json:"MSGRAPH_CLIENT_SECRET"`
	OrganizerUserIDs     string `json:"MSGRAPH_ORGANIZER_USER_IDS"`
	PollIntervalSeconds  string `json:"MSGRAPH_POLL_INTERVAL_SECONDS"`
	InitialLookbackHours string `json:"MSGRAPH_INITIAL_LOOKBACK_HOURS"`
	ContentEnabled       string `json:"TRANSCRIPT_CONTENT_ENABLED,omitempty"`
	SecurityTeamBaseURL  string `json:"SECURITYTEAM_BASE_URL,omitempty"`
	SecurityServiceToken string `json:"SECURITY_SERVICE_TOKEN,omitempty"`
	HermesBaseURL        string `json:"HERMES_BASE_URL,omitempty"`
	HermesAPIKey         string `json:"HERMES_API_KEY,omitempty"`
	TranscriptMaxBytes   string `json:"TRANSCRIPT_MAX_BYTES,omitempty"`
	SecurityMaxBytes     string `json:"SECURITYTEAM_MAX_RESPONSE_BYTES,omitempty"`
	TitusMaxOutputBytes  string `json:"TITUS_MAX_OUTPUT_BYTES,omitempty"`
}

func Load(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, errors.New("runtime configuration unavailable")
	}
	defer file.Close()

	decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
	decoder.DisallowUnknownFields()
	var raw runtimeDocument
	if err := decoder.Decode(&raw); err != nil {
		return Config{}, errors.New("runtime configuration invalid")
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Config{}, errors.New("runtime configuration has trailing data")
	}

	if !uuidPattern.MatchString(raw.TenantID) || !uuidPattern.MatchString(raw.ClientID) {
		return Config{}, errors.New("runtime identity configuration invalid")
	}
	if len(raw.ClientSecret) < 20 || len(raw.ClientSecret) > 4096 || strings.IndexFunc(raw.ClientSecret, unicode.IsControl) >= 0 {
		return Config{}, errors.New("runtime credential configuration invalid")
	}
	ids := strings.Split(raw.OrganizerUserIDs, ",")
	if len(ids) != 2 || ids[0] == ids[1] {
		return Config{}, errors.New("runtime organizer configuration invalid")
	}
	for _, id := range ids {
		if id != strings.TrimSpace(id) || !uuidPattern.MatchString(id) {
			return Config{}, errors.New("runtime organizer configuration invalid")
		}
	}
	if raw.PollIntervalSeconds != fmt.Sprint(PollIntervalSeconds) || raw.InitialLookbackHours != fmt.Sprint(InitialLookbackHours) {
		return Config{}, errors.New("runtime scheduling configuration invalid")
	}
	contentValues := []string{raw.ContentEnabled, raw.SecurityTeamBaseURL, raw.SecurityServiceToken, raw.HermesBaseURL, raw.HermesAPIKey, raw.TranscriptMaxBytes, raw.SecurityMaxBytes, raw.TitusMaxOutputBytes}
	contentEnabled := raw.ContentEnabled == "true"
	if raw.ContentEnabled == "" {
		for _, value := range contentValues[1:] {
			if value != "" {
				return Config{}, errors.New("runtime content configuration invalid")
			}
		}
	} else if !contentEnabled || raw.SecurityTeamBaseURL != "http://overnightdesk-securityteam:4700" || raw.HermesBaseURL != "http://hermes-titus:8642" ||
		len(raw.SecurityServiceToken) < 32 || len(raw.SecurityServiceToken) > 4096 || strings.IndexFunc(raw.SecurityServiceToken, unicode.IsControl) >= 0 ||
		len(raw.HermesAPIKey) < 32 || len(raw.HermesAPIKey) > 4096 || strings.IndexFunc(raw.HermesAPIKey, unicode.IsControl) >= 0 ||
		raw.TranscriptMaxBytes != "1000000" || raw.SecurityMaxBytes != "1250000" || raw.TitusMaxOutputBytes != "65536" {
		return Config{}, errors.New("runtime content configuration invalid")
	}

	return Config{
		TenantID:     raw.TenantID,
		ClientID:     raw.ClientID,
		ClientSecret: raw.ClientSecret,
		Organizers: [2]Organizer{
			{Slot: "organizer_1", UserID: ids[0]},
			{Slot: "organizer_2", UserID: ids[1]},
		},
		PollIntervalSeconds:  PollIntervalSeconds,
		InitialLookbackHours: InitialLookbackHours,
		ContentEnabled:       contentEnabled, SecurityTeamBaseURL: raw.SecurityTeamBaseURL,
		SecurityServiceToken: raw.SecurityServiceToken, HermesBaseURL: raw.HermesBaseURL, HermesAPIKey: raw.HermesAPIKey,
	}, nil
}
