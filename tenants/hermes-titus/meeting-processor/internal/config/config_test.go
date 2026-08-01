package config

import (
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
