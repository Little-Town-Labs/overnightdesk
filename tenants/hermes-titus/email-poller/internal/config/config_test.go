package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func validJSON() string {
	return `{
"AGENTMAIL_API_KEY":"agentmail-test-value",
"AGENTMAIL_EMAIL_ADDRESS":"titus-operations@agentmail.to",
"AGENTMAIL_INBOX_ID":"titus-inbox",
"DATABASE_URL":"postgres://email:test@db/email",
"EMAIL_ALLOWED_SENDERS":"garyb@timelesstechs.com,austin@timelesstechs.com",
"EMAIL_ROUTE_ID":"titus",
"HERMES_API_KEY":"hermes-test-value",
"HERMES_BASE_URL":"http://hermes-titus:8642",
"HERMES_TARGET_AGENT":"hermes-titus",
"AGENTMAIL_POLLING_ENABLED":"false",
"AGENTMAIL_POLL_INTERVAL_SECONDS":"60",
"AGENTMAIL_MAX_MESSAGES_PER_CYCLE":"20",
"EMAIL_MAX_CLEAN_CLAIMS_PER_CYCLE":"10",
"HERMES_RUN_TIMEOUT_SECONDS":"900"
}`
}

func writeConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "runtime.json")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestLoadValidDisabledRouteConfig(t *testing.T) {
	configuration, err := Load(writeConfig(t, validJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if configuration.Enabled || configuration.RouteID != "titus" ||
		configuration.TargetAgent != "hermes-titus" || configuration.MaxMessages != 20 ||
		configuration.MaxCleanClaims != 10 || configuration.RunTimeout.Seconds() != 900 {
		t.Fatalf("unexpected parsed config: %#v", configuration)
	}
	if _, ok := configuration.AllowedSenders["garyb@timelesstechs.com"]; !ok {
		t.Fatal("exact allowed sender missing")
	}
}

func TestLoadRejectsUnknownKeyAndEmptySenderSet(t *testing.T) {
	unknown := strings.Replace(validJSON(), "\n}", ",\n\"EXTRA\":\"bad\"\n}", 1)
	if _, err := Load(writeConfig(t, unknown)); err == nil {
		t.Fatal("unknown key accepted")
	}
	empty := strings.Replace(validJSON(), "garyb@timelesstechs.com,austin@timelesstechs.com", "", 1)
	if _, err := Load(writeConfig(t, empty)); err == nil {
		t.Fatal("empty sender set accepted")
	}
}

func TestLoadAllowsUnconfiguredSenderOnlyWhileDisabled(t *testing.T) {
	disabled := strings.Replace(validJSON(), "garyb@timelesstechs.com,austin@timelesstechs.com", "NOT_CONFIGURED", 1)
	configuration, err := Load(writeConfig(t, disabled))
	if err != nil || configuration.Enabled || len(configuration.AllowedSenders) != 0 {
		t.Fatalf("disabled unconfigured route rejected: %#v %v", configuration, err)
	}
	enabled := strings.Replace(disabled, `"AGENTMAIL_POLLING_ENABLED":"false"`, `"AGENTMAIL_POLLING_ENABLED":"true"`, 1)
	if _, err := Load(writeConfig(t, enabled)); err == nil {
		t.Fatal("enabled unconfigured sender route accepted")
	}
}

func TestLoadRejectsRouteTargetAndHermesHostMismatch(t *testing.T) {
	wrongTarget := strings.Replace(validJSON(), `"HERMES_TARGET_AGENT":"hermes-titus"`, `"HERMES_TARGET_AGENT":"hermes-agent"`, 1)
	if _, err := Load(writeConfig(t, wrongTarget)); err == nil {
		t.Fatal("route-to-target mismatch accepted")
	}
	wrongHost := strings.Replace(validJSON(), `http://hermes-titus:8642`, `https://example.com`, 1)
	if _, err := Load(writeConfig(t, wrongHost)); err == nil {
		t.Fatal("non-private Hermes origin accepted")
	}
}

func TestLoadRejectsUnsafeBoundsAndEnabledTypos(t *testing.T) {
	fast := strings.Replace(validJSON(), `"AGENTMAIL_POLL_INTERVAL_SECONDS":"60"`, `"AGENTMAIL_POLL_INTERVAL_SECONDS":"5"`, 1)
	if _, err := Load(writeConfig(t, fast)); err == nil {
		t.Fatal("unsafe polling interval accepted")
	}
	longRun := strings.Replace(validJSON(), `"HERMES_RUN_TIMEOUT_SECONDS":"900"`, `"HERMES_RUN_TIMEOUT_SECONDS":"7200"`, 1)
	if _, err := Load(writeConfig(t, longRun)); err == nil {
		t.Fatal("unsafe run timeout accepted")
	}
	typo := strings.Replace(validJSON(), `"AGENTMAIL_POLLING_ENABLED":"false"`, `"AGENTMAIL_POLLING_ENABLED":"False"`, 1)
	if _, err := Load(writeConfig(t, typo)); err == nil {
		t.Fatal("non-canonical enabled value accepted")
	}
}
