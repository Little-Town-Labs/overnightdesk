package model

import (
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

var sourceTimestamp = regexp.MustCompile(`^(?:[0-9]{2,}:)?[0-5][0-9]:[0-5][0-9](?:\.[0-9]{3})?$`)
var rawHTML = regexp.MustCompile(`(?s)<\s*/?\s*[A-Za-z][^>]*>`)
var credential = regexp.MustCompile(`(?i)(authorization\s*:\s*bearer|bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:SECRET|TOKEN|API[_-]?KEY|PASSWORD)\s*[:=])`)

func ValidateBrief(brief Brief, protected []string) bool {
	if brief.SchemaVersion != "meeting-brief/v1" || !text(brief.Title, 1, 120, false, protected) || !timestamp(brief.OccurredAt) || !text(brief.Summary, 1, 2000, true, protected) || !text(brief.ProposedFollowUp, 0, 2000, true, protected) || len(brief.Participants) > 20 || len(brief.Facts) > 20 || len(brief.Decisions) > 20 || len(brief.ActionItems) > 25 || len(brief.ExternalCommitments) > 20 || len(brief.UnresolvedQuestions) > 20 || !oneOf(brief.ProjectConfidence, "unknown", "low", "medium", "high") {
		return false
	}
	if brief.ProjectHint != nil && !text(*brief.ProjectHint, 1, 100, false, protected) {
		return false
	}
	if !unique(brief.Participants, 100, protected) || !statements(brief.Facts, protected) || !statements(brief.Decisions, protected) || !statements(brief.UnresolvedQuestions, protected) {
		return false
	}
	for _, item := range brief.ActionItems {
		if !text(item.Title, 1, 200, false, protected) || !oneOf(item.Owner, "gary", "austin", "unassigned") || !date(item.DueDate) || !sourceTimestamp.MatchString(item.SourceTimestamp) || !oneOf(item.Confidence, "low", "medium", "high") {
			return false
		}
	}
	for _, item := range brief.ExternalCommitments {
		if !text(item.Title, 1, 200, false, protected) || !date(item.DueDate) || !sourceTimestamp.MatchString(item.SourceTimestamp) || !oneOf(item.Confidence, "low", "medium", "high") {
			return false
		}
	}
	return true
}

func text(value string, minimum, maximum int, multiline bool, protected []string) bool {
	if !utf8.ValidString(value) || !norm.NFC.IsNormalString(value) || len([]rune(value)) < minimum || len([]rune(value)) > maximum || (minimum > 0 && strings.TrimSpace(value) == "") || rawHTML.MatchString(value) || credential.MatchString(value) {
		return false
	}
	for _, r := range value {
		if (r >= 0x202a && r <= 0x202e) || (r >= 0x2066 && r <= 0x2069) || (unicode.IsControl(r) && !(multiline && (r == '\n' || r == '\t'))) {
			return false
		}
	}
	lower := strings.ToLower(value)
	for _, protectedValue := range protected {
		if protectedValue != "" && strings.Contains(lower, strings.ToLower(protectedValue)) {
			return false
		}
	}
	return !strings.Contains(lower, "graph.microsoft.com") && !strings.Contains(lower, "/v1.0/users/")
}
func timestamp(value string) bool {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	return err == nil && strings.HasSuffix(value, "Z") && parsed.UTC().Format(time.RFC3339Nano) == value
}
func date(value *string) bool {
	if value == nil {
		return true
	}
	parsed, err := time.Parse("2006-01-02", *value)
	return err == nil && parsed.Format("2006-01-02") == *value
}
func oneOf(value string, values ...string) bool {
	for _, candidate := range values {
		if value == candidate {
			return true
		}
	}
	return false
}
func unique(values []string, max int, protected []string) bool {
	seen := map[string]struct{}{}
	for _, value := range values {
		if !text(value, 1, max, false, protected) {
			return false
		}
		if _, ok := seen[value]; ok {
			return false
		}
		seen[value] = struct{}{}
	}
	return true
}
func statements(values []string, protected []string) bool {
	for _, value := range values {
		if !text(value, 1, 500, false, protected) {
			return false
		}
	}
	return true
}
