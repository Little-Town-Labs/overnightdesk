package policy

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/mail"
	"regexp"
	"strings"
)

const MaxReplyCharacters = 1200

var (
	commandPattern = regexp.MustCompile(`^(APPROVE|REJECT) (TITUS-[A-F0-9]{12}) ([A-Za-z0-9_-]{43})$`)
	secretPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)authorization\s*:\s*bearer\s+\S{12,}`),
		regexp.MustCompile(`(?i)\b` + "sk-or-" + `v1-[A-Za-z0-9_-]{12,}\b`),
		regexp.MustCompile(`(?i)\b` + "am" + `_[A-Za-z0-9_-]{12,}\b`),
	}
)

type ApprovalCommand struct {
	Decision string
	QueueID  string
	Token    string
}

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

func EqualAddressSets(first, second map[string]struct{}) bool {
	if len(first) != len(second) {
		return false
	}
	for value := range first {
		if _, ok := second[value]; !ok {
			return false
		}
	}
	return true
}

func QueueID(messageID string) string {
	digest := sha256.Sum256([]byte(messageID))
	return "TITUS-" + strings.ToUpper(hex.EncodeToString(digest[:6]))
}

func ClientID(kind, messageID string) string {
	digest := sha256.Sum256([]byte(kind + "\x00" + messageID))
	return "titus-" + kind + "-" + hex.EncodeToString(digest[:12])
}

func ApprovalToken(queueID, signingSecret string) (string, error) {
	if len([]byte(signingSecret)) < 32 {
		return "", errors.New("approval signing secret is too short")
	}
	mac := hmac.New(sha256.New, []byte(signingSecret))
	_, _ = mac.Write([]byte("titus-agentmail-approval-v1\x00" + queueID))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func TokenDigest(token string) string {
	digest := sha256.Sum256([]byte(token))
	return hex.EncodeToString(digest[:])
}

func ParseApprovalCommand(text string) (ApprovalCommand, bool) {
	first := ""
	for _, line := range strings.Split(text, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			first = trimmed
			break
		}
	}
	match := commandPattern.FindStringSubmatch(first)
	if len(match) != 4 {
		return ApprovalCommand{}, false
	}
	return ApprovalCommand{Decision: strings.ToLower(match[1]), QueueID: match[2], Token: match[3]}, true
}

func DraftDigest(recipient, sourceMessageID, subject, text string) string {
	digest := sha256.Sum256([]byte(recipient + "\x00" + sourceMessageID + "\x00" + subject + "\x00" + text))
	return hex.EncodeToString(digest[:])
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
