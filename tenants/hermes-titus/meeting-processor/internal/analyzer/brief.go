package analyzer

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const SchemaVersion = "meeting-brief/v1"

type Brief struct {
	SchemaVersion       string       `json:"schemaVersion"`
	Title               string       `json:"title"`
	OccurredAt          string       `json:"occurredAt"`
	Participants        []string     `json:"participants"`
	Summary             string       `json:"summary"`
	Facts               []string     `json:"facts"`
	Decisions           []string     `json:"decisions"`
	ActionItems         []ActionItem `json:"actionItems"`
	ExternalCommitments []Commitment `json:"externalCommitments"`
	UnresolvedQuestions []string     `json:"unresolvedQuestions"`
	ProposedFollowUp    string       `json:"proposedFollowUp"`
	ProjectHint         *string      `json:"projectHint"`
	ProjectConfidence   string       `json:"projectConfidence"`
}

type ActionItem struct {
	Title           string  `json:"title"`
	Owner           string  `json:"owner"`
	DueDate         *string `json:"dueDate"`
	SourceTimestamp string  `json:"sourceTimestamp"`
	Confidence      string  `json:"confidence"`
}

type Commitment struct {
	Title           string  `json:"title"`
	DueDate         *string `json:"dueDate"`
	SourceTimestamp string  `json:"sourceTimestamp"`
	Confidence      string  `json:"confidence"`
}

type Validated struct {
	Brief     Brief
	Canonical []byte
	Digest    string
}

type safeError struct{ code string }

func (err safeError) Error() string    { return err.code }
func (err safeError) SafeCode() string { return err.code }

func SafeCode(err error) string {
	var coded interface{ SafeCode() string }
	if errors.As(err, &coded) {
		return coded.SafeCode()
	}
	return "analyzer_unavailable"
}

var (
	vttTimestamp = regexp.MustCompile(`^(?:[0-9]{2,}:)?[0-5][0-9]:[0-5][0-9](?:\.[0-9]{3})?$`)
	rawHTML      = regexp.MustCompile(`(?s)<\s*/?\s*[A-Za-z][^>]*>`)
	credential   = regexp.MustCompile(`(?i)(authorization\s*:\s*bearer|bearer\s+[A-Za-z0-9._~+/=-]{8,}|(?:SECRET|TOKEN|API[_-]?KEY|PASSWORD)\s*[:=])`)
)

func ParseAndValidate(raw []byte, protected []string) (Validated, error) {
	if len(raw) == 0 || len(raw) > 65_536 || !utf8.Valid(raw) || bytes.IndexByte(raw, 0) >= 0 {
		return Validated{}, safeError{code: "analyzer_output_rejected"}
	}
	var brief Brief
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&brief); err != nil {
		return Validated{}, safeError{code: "analyzer_output_rejected"}
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Validated{}, safeError{code: "analyzer_output_rejected"}
	}
	if err := validateBrief(brief, protected); err != nil {
		return Validated{}, err
	}
	canonical, err := json.Marshal(brief)
	if err != nil {
		return Validated{}, safeError{code: "analyzer_output_rejected"}
	}
	digest := sha256.Sum256(canonical)
	return Validated{Brief: brief, Canonical: canonical, Digest: hex.EncodeToString(digest[:])}, nil
}

func validateBrief(brief Brief, protected []string) error {
	if brief.SchemaVersion != SchemaVersion || !validText(brief.Title, 1, 120, false, protected) ||
		!validRFC3339(brief.OccurredAt) || !validText(brief.Summary, 1, 2000, true, protected) ||
		!validText(brief.ProposedFollowUp, 0, 2000, true, protected) ||
		len(brief.Participants) > 20 || len(brief.Facts) > 20 || len(brief.Decisions) > 20 ||
		len(brief.ActionItems) > 25 || len(brief.ExternalCommitments) > 20 || len(brief.UnresolvedQuestions) > 20 ||
		!oneOf(brief.ProjectConfidence, "unknown", "low", "medium", "high") {
		return safeError{code: "analyzer_output_rejected"}
	}
	if brief.ProjectHint != nil && !validText(*brief.ProjectHint, 1, 100, false, protected) {
		return safeError{code: "analyzer_output_rejected"}
	}
	if !uniqueValid(brief.Participants, 100, protected) || !validStatements(brief.Facts, protected) ||
		!validStatements(brief.Decisions, protected) || !validStatements(brief.UnresolvedQuestions, protected) {
		return safeError{code: "analyzer_output_rejected"}
	}
	for _, item := range brief.ActionItems {
		if !validText(item.Title, 1, 200, false, protected) || !oneOf(item.Owner, "gary", "austin", "unassigned") ||
			!validDate(item.DueDate) || !vttTimestamp.MatchString(item.SourceTimestamp) || !oneOf(item.Confidence, "low", "medium", "high") {
			return safeError{code: "analyzer_output_rejected"}
		}
	}
	for _, item := range brief.ExternalCommitments {
		if !validText(item.Title, 1, 200, false, protected) || !validDate(item.DueDate) ||
			!vttTimestamp.MatchString(item.SourceTimestamp) || !oneOf(item.Confidence, "low", "medium", "high") {
			return safeError{code: "analyzer_output_rejected"}
		}
	}
	return nil
}

func validStatements(values []string, protected []string) bool {
	for _, value := range values {
		if !validText(value, 1, 500, false, protected) {
			return false
		}
	}
	return true
}

func uniqueValid(values []string, maximum int, protected []string) bool {
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if !validText(value, 1, maximum, false, protected) {
			return false
		}
		if _, duplicate := seen[value]; duplicate {
			return false
		}
		seen[value] = struct{}{}
	}
	return true
}

func validText(value string, minimum, maximum int, multiline bool, protected []string) bool {
	if !utf8.ValidString(value) || !norm.NFC.IsNormalString(value) {
		return false
	}
	length := utf8.RuneCountInString(value)
	if length < minimum || length > maximum || (minimum > 0 && strings.TrimSpace(value) == "") || rawHTML.MatchString(value) || credential.MatchString(value) {
		return false
	}
	for _, character := range value {
		if isBidiControl(character) || (unicode.IsControl(character) && !(multiline && (character == '\n' || character == '\t'))) {
			return false
		}
	}
	lower := strings.ToLower(value)
	for _, secret := range protected {
		if secret != "" && strings.Contains(lower, strings.ToLower(secret)) {
			return false
		}
	}
	return !strings.Contains(lower, "graph.microsoft.com") && !strings.Contains(lower, "/v1.0/users/")
}

func isBidiControl(character rune) bool {
	return (character >= 0x202a && character <= 0x202e) || (character >= 0x2066 && character <= 0x2069)
}

func validRFC3339(value string) bool {
	parsed, err := time.Parse(time.RFC3339Nano, value)
	return err == nil && strings.HasSuffix(value, "Z") && parsed.UTC().Format(time.RFC3339Nano) == value
}

func validDate(value *string) bool {
	if value == nil {
		return true
	}
	parsed, err := time.Parse("2006-01-02", *value)
	return err == nil && parsed.Format("2006-01-02") == *value
}

func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}

type ProjectRoute struct {
	CanonicalProject string   `json:"canonicalProject"`
	Aliases          []string `json:"aliases"`
	NoteDirectory    string   `json:"noteDirectory"`
	KanbanBoard      string   `json:"kanbanBoard"`
	ConfigDigest     string   `json:"configDigest"`
}

func MatchRoute(brief Brief, routes []ProjectRoute) *ProjectRoute {
	if brief.ProjectHint == nil || brief.ProjectConfidence != "high" {
		return nil
	}
	hint := normalizeAlias(*brief.ProjectHint)
	var match *ProjectRoute
	for index := range routes {
		for _, alias := range routes[index].Aliases {
			if normalizeAlias(alias) == hint {
				if match != nil {
					return nil
				}
				copy := routes[index]
				copy.Aliases = append([]string(nil), routes[index].Aliases...)
				match = &copy
			}
		}
	}
	return match
}

func normalizeAlias(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(value)), " ")
}

func RenderMarkdown(reference string, brief Brief) string {
	var output strings.Builder
	fmt.Fprintf(&output, "# %s\n\nReference: `%s`\n\n", escapeMarkdown(brief.Title), reference)
	fmt.Fprintf(&output, "Occurred at: %s\n\n", brief.OccurredAt)
	writeList(&output, "Participants", brief.Participants)
	output.WriteString("## Source-derived summary\n\n")
	output.WriteString(escapeMarkdown(brief.Summary) + "\n\n")
	writeList(&output, "Source-derived facts", brief.Facts)
	writeList(&output, "Source-derived decisions", brief.Decisions)
	output.WriteString("## Internal action items\n\n")
	if len(brief.ActionItems) == 0 {
		output.WriteString("- None.\n\n")
	} else {
		for _, item := range brief.ActionItems {
			due := "not stated"
			if item.DueDate != nil {
				due = *item.DueDate
			}
			fmt.Fprintf(&output, "- %s — owner: %s; due: %s; source: %s; confidence: %s\n", escapeMarkdown(item.Title), displayOwner(item.Owner), due, item.SourceTimestamp, item.Confidence)
		}
		output.WriteString("\n")
	}
	output.WriteString("## External commitments (internal tracking only)\n\n")
	if len(brief.ExternalCommitments) == 0 {
		output.WriteString("- None.\n\n")
	} else {
		for _, item := range brief.ExternalCommitments {
			due := "not stated"
			if item.DueDate != nil {
				due = *item.DueDate
			}
			fmt.Fprintf(&output, "- %s — due: %s; source: %s; confidence: %s\n", escapeMarkdown(item.Title), due, item.SourceTimestamp, item.Confidence)
		}
		output.WriteString("\n")
	}
	writeList(&output, "Source-derived unresolved questions", brief.UnresolvedQuestions)
	output.WriteString("## Draft proposal - not performed\n\n")
	if brief.ProposedFollowUp == "" {
		output.WriteString("None.\n")
	} else {
		output.WriteString(escapeMarkdown(brief.ProposedFollowUp) + "\n")
	}
	return output.String()
}

func displayOwner(owner string) string {
	switch owner {
	case "gary":
		return "Gary"
	case "austin":
		return "Austin"
	case "unassigned":
		return "Unassigned"
	default:
		return owner
	}
}

func writeList(output *strings.Builder, heading string, values []string) {
	fmt.Fprintf(output, "## %s\n\n", heading)
	if len(values) == 0 {
		output.WriteString("- None.\n\n")
		return
	}
	for _, value := range values {
		fmt.Fprintf(output, "- %s\n", escapeMarkdown(value))
	}
	output.WriteString("\n")
}

func escapeMarkdown(value string) string {
	value = html.UnescapeString(value)
	replacer := strings.NewReplacer("\\", "\\\\", "`", "\\`", "*", "\\*", "_", "\\_", "[", "\\[", "]", "\\]", "<", "&lt;", ">", "&gt;")
	return replacer.Replace(value)
}

func CanonicalRouteDigest(routes []ProjectRoute) (string, error) {
	copy := append([]ProjectRoute(nil), routes...)
	sort.Slice(copy, func(i, j int) bool { return copy[i].CanonicalProject < copy[j].CanonicalProject })
	type canonicalRoute struct {
		CanonicalProject string   `json:"canonicalProject"`
		Aliases          []string `json:"aliases"`
		NoteDirectory    string   `json:"noteDirectory"`
		KanbanBoard      string   `json:"kanbanBoard"`
	}
	canonical := make([]canonicalRoute, 0, len(copy))
	for _, route := range copy {
		canonical = append(canonical, canonicalRoute{CanonicalProject: route.CanonicalProject, Aliases: route.Aliases, NoteDirectory: route.NoteDirectory, KanbanBoard: route.KanbanBoard})
	}
	raw, err := json.Marshal(canonical)
	if err != nil {
		return "", err
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), nil
}

func ParseRoutesJSON(raw string) ([]ProjectRoute, error) {
	if raw == "" || len(raw) > 64*1024 {
		return nil, safeError{code: "analyzer_route_config_invalid"}
	}
	type definition struct {
		CanonicalProject string   `json:"canonicalProject"`
		Aliases          []string `json:"aliases"`
		NoteDirectory    string   `json:"noteDirectory"`
		KanbanBoard      string   `json:"kanbanBoard"`
	}
	var definitions []definition
	decoder := json.NewDecoder(strings.NewReader(raw))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&definitions) != nil || len(definitions) == 0 || len(definitions) > 100 {
		return nil, safeError{code: "analyzer_route_config_invalid"}
	}
	routes := make([]ProjectRoute, 0, len(definitions))
	seenProjects := map[string]struct{}{}
	seenAliases := map[string]struct{}{}
	for _, value := range definitions {
		if !validText(value.CanonicalProject, 1, 80, false, nil) || len(value.Aliases) == 0 || len(value.Aliases) > 20 ||
			!regexp.MustCompile(`^10-projects/[a-z0-9][a-z0-9/-]{0,159}$`).MatchString(value.NoteDirectory) ||
			!regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`).MatchString(value.KanbanBoard) {
			return nil, safeError{code: "analyzer_route_config_invalid"}
		}
		if _, exists := seenProjects[value.CanonicalProject]; exists {
			return nil, safeError{code: "analyzer_route_config_invalid"}
		}
		seenProjects[value.CanonicalProject] = struct{}{}
		for _, alias := range value.Aliases {
			normalized := normalizeAlias(alias)
			if normalized == "" {
				return nil, safeError{code: "analyzer_route_config_invalid"}
			}
			if _, exists := seenAliases[normalized]; exists {
				return nil, safeError{code: "analyzer_route_config_invalid"}
			}
			seenAliases[normalized] = struct{}{}
		}
		routes = append(routes, ProjectRoute{CanonicalProject: value.CanonicalProject, Aliases: append([]string(nil), value.Aliases...), NoteDirectory: value.NoteDirectory, KanbanBoard: value.KanbanBoard})
	}
	digest, err := CanonicalRouteDigest(routes)
	if err != nil {
		return nil, safeError{code: "analyzer_route_config_invalid"}
	}
	for index := range routes {
		routes[index].ConfigDigest = digest
	}
	return routes, nil
}
