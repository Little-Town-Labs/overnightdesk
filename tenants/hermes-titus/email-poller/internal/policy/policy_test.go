package policy

import (
	"strings"
	"testing"
)

func TestNormalizeAddress(t *testing.T) {
	tests := []struct {
		input string
		want  string
		ok    bool
	}{
		{"Gary Brown <GaryB@TimelessTechs.com>", "garyb@timelesstechs.com", true},
		{`"garyb@timelesstechs.com" <attacker@example.net>`, "attacker@example.net", true},
		{"gary@example.net, attacker@example.net", "", false},
		{"Gary <gary@example.net>\r\nBcc: bad@example.net", "", false},
		{"not-an-address", "", false},
	}
	for _, test := range tests {
		got, ok := NormalizeAddress(test.input)
		if got != test.want || ok != test.ok {
			t.Fatalf("NormalizeAddress(%q)=(%q,%v), want (%q,%v)", test.input, got, ok, test.want, test.ok)
		}
	}
}

func TestAddressSetRequiresBareNormalizedAddresses(t *testing.T) {
	got, err := ParseAddressSet("garyb@timelesstechs.com,austin@timelesstechs.com")
	if err != nil || len(got) != 2 {
		t.Fatalf("valid set failed: %v", err)
	}
	if _, err := ParseAddressSet("Gary <garyb@timelesstechs.com>"); err == nil {
		t.Fatal("display-name address must be rejected in configuration")
	}
}

func TestQueueTokenAndCommand(t *testing.T) {
	queue := QueueID("private-message-id")
	if !strings.HasPrefix(queue, "TITUS-") || strings.Contains(strings.ToLower(queue), "private") {
		t.Fatalf("unsafe queue id: %s", queue)
	}
	token, err := ApprovalToken(queue, strings.Repeat("s", 32))
	if err != nil || len(token) != 43 {
		t.Fatalf("token failed: %v", err)
	}
	command, ok := ParseApprovalCommand("\nAPPROVE " + queue + " " + token + "\nquoted")
	if !ok || command.Decision != "approve" || command.QueueID != queue {
		t.Fatalf("valid command rejected: %#v", command)
	}
	if _, ok := ParseApprovalCommand("> APPROVE " + queue + " " + token); ok {
		t.Fatal("quoted command accepted")
	}
}

func TestDraftDigestBindsAllFields(t *testing.T) {
	base := DraftDigest("outside@example.net", "m-1", "Re: Question", "Hello")
	if base == DraftDigest("other@example.net", "m-1", "Re: Question", "Hello") ||
		base == DraftDigest("outside@example.net", "m-2", "Re: Question", "Hello") ||
		base == DraftDigest("outside@example.net", "m-1", "Changed", "Hello") ||
		base == DraftDigest("outside@example.net", "m-1", "Re: Question", "Changed") {
		t.Fatal("draft digest did not bind all immutable fields")
	}
}

func TestValidateReplyAndAutomatedHeaders(t *testing.T) {
	if got, ok := ValidateReply("  Hello Gary.\n\nTitus  "); !ok || got != "Hello Gary.\n\nTitus" {
		t.Fatalf("valid reply rejected: %q", got)
	}
	for _, value := range []string{"", strings.Repeat("x", 1201), "Authorization: Bearer abcdefghijklmnop", "sk-or-v1-abcdefghijklmnop"} {
		if _, ok := ValidateReply(value); ok {
			t.Fatalf("unsafe reply accepted: %q", value)
		}
	}
	if !IsAutomated(map[string]string{"Auto-Submitted": "auto-replied"}) ||
		!IsAutomated(map[string]string{"Precedence": "bulk"}) ||
		IsAutomated(map[string]string{"Auto-Submitted": "no"}) {
		t.Fatal("automatic message policy failed")
	}
}
