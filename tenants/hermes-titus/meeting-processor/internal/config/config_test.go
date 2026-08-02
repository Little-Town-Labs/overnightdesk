package config

import (
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "runtime.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func meetingRuntimeJSON() string {
	key := base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{7}, 32))
	extra := `,
  "MEETING_BRIEF_ENABLED": "true",
  "MEETING_RAW_CUSTODY_ACTIVE_KEY_ID": "key-2026-08",
  "MEETING_RAW_CUSTODY_KEYS_JSON": "{\"key-2026-08\":\"` + key + `\"}",
  "MEETING_PROJECT_ROUTES_JSON": "[{\"canonicalProject\":\"OvernightDesk\",\"aliases\":[\"overnightdesk\"],\"noteDirectory\":\"10-projects/overnightdesk\",\"kanbanBoard\":\"overnightdesk\"}]",
  "MEETING_AGENTMAIL_API_KEY": "mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm",
  "MEETING_AGENTMAIL_INBOX_ID": "titus-operations@agentmail.to",
  "MEETING_GARY_EMAIL": "gary@example.com",
  "MEETING_AUSTIN_EMAIL": "austin@example.com",
  "MEETING_REVIEW_BEARER": "rrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrr",
  "MEETING_REVIEW_SIGNING_SECRET": "ssssssssssssssssssssssssssssssss",
  "MEETING_RECORDING_MAX_BYTES": "2147483648"`
	return strings.Replace(testfixture.RuntimeContentJSON(), "\n}", extra+"\n}", 1)
}

func TestLoadValidAssignsStableOrganizerSlots(t *testing.T) {
	cfg, err := Load(writeConfig(t, testfixture.RuntimeJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Organizers[0].Slot != "organizer_1" || cfg.Organizers[1].Slot != "organizer_2" {
		t.Fatalf("unexpected slots: %#v", cfg.Organizers)
	}
	if cfg.PollIntervalSeconds != 300 || cfg.InitialLookbackHours != 168 {
		t.Fatalf("unexpected bounds: %#v", cfg)
	}
}

func TestLoadContentConfigurationIsAllOrNothingAndFixedOrigin(t *testing.T) {
	cfg, err := Load(writeConfig(t, testfixture.RuntimeContentJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if !cfg.ContentEnabled || cfg.SecurityTeamBaseURL != "http://overnightdesk-securityteam:4700" || cfg.HermesBaseURL != "http://hermes-titus:8642" {
		t.Fatalf("unexpected content config: %#v", cfg)
	}
	for _, body := range []string{
		strings.Replace(testfixture.RuntimeContentJSON(), "http://hermes-titus:8642", "https://evil.example", 1),
		strings.Replace(testfixture.RuntimeContentJSON(), `"HERMES_API_KEY": "h`+testfixture.ClientSecret+`",`+"\n", "", 1),
		strings.Replace(testfixture.RuntimeContentJSON(), `"TRANSCRIPT_CONTENT_ENABLED": "true"`, `"TRANSCRIPT_CONTENT_ENABLED": "false"`, 1),
	} {
		if _, err := Load(writeConfig(t, body)); err == nil {
			t.Fatal("invalid content configuration accepted")
		}
	}
}

func TestLoadRejectsUnknownMissingAndTrailingJSON(t *testing.T) {
	cases := []string{
		strings.Replace(testfixture.RuntimeJSON(), "\n}", ",\n  \"EXTRA\": \"no\"\n}", 1),
		strings.Replace(testfixture.RuntimeJSON(), "  \"MSGRAPH_CLIENT_ID\": \""+testfixture.ClientID+"\",\n", "", 1),
		testfixture.RuntimeJSON() + " {}",
	}
	for _, body := range cases {
		if _, err := Load(writeConfig(t, body)); err == nil {
			t.Fatal("expected invalid configuration")
		}
	}
}

func TestLoadRejectsInvalidIdentityOrganizerAndBounds(t *testing.T) {
	cases := []string{
		strings.Replace(testfixture.RuntimeJSON(), testfixture.TenantID, "not-a-uuid", 1),
		strings.Replace(testfixture.RuntimeJSON(), testfixture.OrganizerTwo, testfixture.OrganizerOne, 1),
		strings.Replace(testfixture.RuntimeJSON(), testfixture.OrganizerOne+","+testfixture.OrganizerTwo, testfixture.OrganizerOne, 1),
		strings.Replace(testfixture.RuntimeJSON(), "\"300\"", "\"301\"", 1),
		strings.Replace(testfixture.RuntimeJSON(), "\"168\"", "\"0\"", 1),
		strings.Replace(testfixture.RuntimeJSON(), testfixture.ClientSecret, "short", 1),
		strings.Replace(testfixture.RuntimeJSON(), testfixture.ClientSecret, testfixture.ClientSecret+"\\n", 1),
	}
	for _, body := range cases {
		if _, err := Load(writeConfig(t, body)); err == nil {
			t.Fatal("expected invalid configuration")
		}
	}
}

func TestErrorsDoNotContainProtectedValues(t *testing.T) {
	body := strings.Replace(testfixture.RuntimeJSON(), "\"300\"", "\"301\"", 1)
	_, err := Load(writeConfig(t, body))
	if err == nil {
		t.Fatal("expected error")
	}
	for _, protected := range []string{testfixture.TenantID, testfixture.ClientID, testfixture.ClientSecret, testfixture.OrganizerOne, testfixture.OrganizerTwo} {
		if strings.Contains(err.Error(), protected) {
			t.Fatal("error exposed protected configuration")
		}
	}
}

func TestLoadMeetingBriefAndFilingGatesAreIndependent(t *testing.T) {
	configuration, err := Load(writeConfig(t, meetingRuntimeJSON()))
	if err != nil || !configuration.MeetingBriefEnabled || configuration.MeetingFilingEnabled || configuration.MeetingRecordingMaxBytes != 2<<30 {
		t.Fatalf("configuration=%#v err=%v", configuration, err)
	}
	filing := strings.Replace(meetingRuntimeJSON(), "\n}", `,
  "MEETING_FILING_ENABLED": "true",
  "MEETING_FILER_BASE_URL": "http://titus-meeting-filer:8090",
  "MEETING_FILER_BEARER": "ffffffffffffffffffffffffffffffff"
}`, 1)
	configuration, err = Load(writeConfig(t, filing))
	if err != nil || !configuration.MeetingFilingEnabled {
		t.Fatalf("filing configuration rejected: %#v %v", configuration, err)
	}
	credentialWithoutGate := strings.Replace(testfixture.RuntimeContentJSON(), "\n}", `,
  "MEETING_RAW_CUSTODY_ACTIVE_KEY_ID": "key-2026-08"
}`, 1)
	if _, err := Load(writeConfig(t, credentialWithoutGate)); err == nil {
		t.Fatal("meeting credential accepted without activation gate")
	}
	legacyAnalyzer := strings.Replace(meetingRuntimeJSON(), "\n}", `,
  "MEETING_ANALYZER_API_KEY": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}`, 1)
	if _, err := Load(writeConfig(t, legacyAnalyzer)); err == nil {
		t.Fatal("retired analyzer credential accepted")
	}
}
