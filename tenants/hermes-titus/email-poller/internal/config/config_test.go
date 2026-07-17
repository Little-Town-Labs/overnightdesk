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
"AGENTMAIL_EMAIL_ADDRESS":"titus@example.agentmail.to",
"AGENTMAIL_INBOX_ID":"titus-inbox",
"HERMES_DEFAULT_MODEL":"provider/model",
"OPENROUTER_API_KEY":"openrouter-test-value",
"AGENTMAIL_POLLING_ENABLED":"false",
"AGENTMAIL_POLL_INTERVAL_SECONDS":"60",
"AGENTMAIL_AUTO_REPLY_ALLOWED_SENDERS":"garyb@timelesstechs.com,austin@timelesstechs.com",
"AGENTMAIL_APPROVAL_ALLOWED_SENDERS":"garyb@timelesstechs.com,austin@timelesstechs.com",
"AGENTMAIL_MAX_MESSAGES_PER_CYCLE":"20",
"AGENTMAIL_APPROVAL_SIGNING_SECRET":"` + strings.Repeat("s", 32) + `"
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

func TestLoadValidDisabledConfig(t *testing.T) {
	config, err := Load(writeConfig(t, validJSON()))
	if err != nil {
		t.Fatal(err)
	}
	if config.Enabled || config.Interval.Seconds() != 60 || config.MaxMessages != 20 {
		t.Fatalf("unexpected parsed config: %#v", config)
	}
}

func TestLoadRejectsUnknownOrBroadenedPolicy(t *testing.T) {
	unknown := strings.Replace(validJSON(), "\n}", ",\n\"EXTRA\":\"bad\"\n}", 1)
	if _, err := Load(writeConfig(t, unknown)); err == nil {
		t.Fatal("unknown key accepted")
	}
	broadened := strings.Replace(validJSON(), "garyb@timelesstechs.com,austin@timelesstechs.com", "all@example.net", 1)
	if _, err := Load(writeConfig(t, broadened)); err == nil {
		t.Fatal("broadened automatic policy accepted")
	}
}

func TestLoadRejectsShortSecretAndBounds(t *testing.T) {
	short := strings.Replace(validJSON(), strings.Repeat("s", 32), "short", 1)
	if _, err := Load(writeConfig(t, short)); err == nil {
		t.Fatal("short signing secret accepted")
	}
	fast := strings.Replace(validJSON(), `"60"`, `"5"`, 1)
	if _, err := Load(writeConfig(t, fast)); err == nil {
		t.Fatal("unsafe polling interval accepted")
	}
}
