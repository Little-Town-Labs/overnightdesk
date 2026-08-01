package policy

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func runtimeJSON(enabled bool) string {
	bearer := ""
	protected := ""
	if enabled {
		bearer = strings.Repeat("b", 32)
		protected = `,"MEETING_FILER_PROTECTED_VALUES_JSON":"[\"gary@example.com\",\"austin@example.com\"]"`
	}
	return `{"MEETING_FILER_ENABLED":"` + map[bool]string{true: "true", false: "false"}[enabled] + `","MEETING_FILER_BEARER":"` + bearer + `","MEETING_PROJECTS_ROOT":"/projects","HERMES_BINARY":"/opt/hermes/.venv/bin/hermes","MEETING_FILER_LEDGER_PATH":"/data/ledger.json","MEETING_PROJECT_ROUTES_JSON":"[{\"canonicalProject\":\"OvernightDesk\",\"aliases\":[\"overnightdesk\",\"od\"],\"noteDirectory\":\"10-projects/overnightdesk\",\"kanbanBoard\":\"overnightdesk\"}]"` + protected + `}`
}

func writeConfig(t *testing.T, body string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "runtime.json")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadComputesFrozenRoutesAndOmitsBearerWhileDisabled(t *testing.T) {
	configuration, err := Load(writeConfig(t, runtimeJSON(true)))
	if err != nil || !configuration.Enabled || len(configuration.ConfigDigest) != 64 || configuration.Routes["OvernightDesk"].ConfigDigest != configuration.ConfigDigest || len(configuration.ProtectedValues) != 2 {
		t.Fatalf("config=%#v err=%v", configuration, err)
	}
	disabled, err := Load(writeConfig(t, runtimeJSON(false)))
	if err != nil || disabled.Enabled || disabled.Bearer != "" {
		t.Fatalf("disabled=%#v err=%v", disabled, err)
	}
}

func TestLoadRejectsDuplicateAliasesUnsafeRoutesAndCredentialDrift(t *testing.T) {
	for _, body := range []string{
		strings.Replace(runtimeJSON(true), `\"od\"`, `\"overnightdesk\"`, 1),
		strings.Replace(runtimeJSON(true), `10-projects/overnightdesk`, `../escape`, 1),
		strings.Replace(runtimeJSON(false), `"MEETING_FILER_BEARER":""`, `"MEETING_FILER_BEARER":"`+strings.Repeat("b", 32)+`"`, 1),
		strings.Replace(runtimeJSON(true), `[\"gary@example.com\",\"austin@example.com\"]`, `[\"gary@example.com\",\"GARY@example.com\"]`, 1),
		strings.Replace(runtimeJSON(true), `[\"gary@example.com\",\"austin@example.com\"]`, `[\"gary@example.com\",\"austin@example.com\"] true`, 1),
	} {
		if _, err := Load(writeConfig(t, body)); err == nil {
			t.Fatalf("invalid config accepted: %s", body)
		}
	}
}
