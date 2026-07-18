package policy

import (
	"errors"
	"net/mail"
	"regexp"
	"strings"
)

const MaxReplyCharacters = 1200

var (
	secretPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)authorization\s*:\s*bearer\s+\S{12,}`),
		regexp.MustCompile(`(?i)\b` + "sk-or-" + `v1-[A-Za-z0-9_-]{12,}\b`),
		regexp.MustCompile(`(?i)\b` + "am" + `_[A-Za-z0-9_-]{12,}\b`),
	}
)

func NormalizeAddress(value string) (string, bool) {
	if value == "" || strings.ContainsAny(value, "\r\n") {
		return "", false
	}
	addresses, err := mail.ParseAddressList(value)
	if err != nil || len(addresses) != 1 || addresses[0].Address == "" {
		return "", false
	}
	address := strings.ToLower(addresses[0].Address)
	parts := strings.Split(address, "@")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" || strings.Contains(address, "..") {
		return "", false
	}
	return address, true
}

func ParseAddressSet(raw string) (map[string]struct{}, error) {
	result := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		candidate := strings.TrimSpace(item)
		normalized, ok := NormalizeAddress(candidate)
		if !ok || candidate != normalized {
			return nil, errors.New("address set requires bare normalized mailboxes")
		}
		result[normalized] = struct{}{}
	}
	if len(result) == 0 {
		return nil, errors.New("address set is empty")
	}
	return result, nil
}

func ValidateReply(value string) (string, bool) {
	value = strings.TrimSpace(strings.ReplaceAll(value, "\x00", ""))
	if value == "" || len([]rune(value)) > MaxReplyCharacters {
		return "", false
	}
	for _, pattern := range secretPatterns {
		if pattern.MatchString(value) {
			return "", false
		}
	}
	return value, true
}

// BoundText limits external text by Unicode code points without splitting a
// UTF-8 sequence. Callers still apply their own semantic validation.
func BoundText(value string, maximum int) string {
	if maximum < 1 {
		return ""
	}
	runes := []rune(value)
	if len(runes) <= maximum {
		return value
	}
	return string(runes[:maximum])
}

func IsAutomated(headers map[string]string) bool {
	normalized := make(map[string]string, len(headers))
	for key, value := range headers {
		normalized[strings.ToLower(key)] = strings.ToLower(strings.TrimSpace(value))
	}
	if value := normalized["auto-submitted"]; value != "" && value != "no" {
		return true
	}
	switch normalized["precedence"] {
	case "bulk", "junk", "list":
		return true
	}
	for _, key := range []string{"x-autoreply", "x-autorespond", "x-auto-response-suppress"} {
		if _, ok := normalized[key]; ok {
			return true
		}
	}
	return false
}
