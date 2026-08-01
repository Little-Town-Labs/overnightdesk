package policy

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
)

var (
	boardPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)
	notePattern  = regexp.MustCompile(`^10-projects/[a-z0-9][a-z0-9/-]{0,159}$`)
)

type Config struct {
	Enabled         bool
	Bearer          string
	ProjectsRoot    string
	HermesBinary    string
	LedgerPath      string
	Routes          map[string]model.ProjectRoute
	ConfigDigest    string
	ProtectedValues []string
}

type runtimeDocument struct {
	Enabled             string `json:"MEETING_FILER_ENABLED"`
	Bearer              string `json:"MEETING_FILER_BEARER,omitempty"`
	ProjectsRoot        string `json:"MEETING_PROJECTS_ROOT"`
	HermesBinary        string `json:"HERMES_BINARY"`
	LedgerPath          string `json:"MEETING_FILER_LEDGER_PATH"`
	RoutesJSON          string `json:"MEETING_PROJECT_ROUTES_JSON"`
	ProtectedValuesJSON string `json:"MEETING_FILER_PROTECTED_VALUES_JSON"`
}

type routeDefinition struct {
	CanonicalProject string   `json:"canonicalProject"`
	Aliases          []string `json:"aliases"`
	NoteDirectory    string   `json:"noteDirectory"`
	KanbanBoard      string   `json:"kanbanBoard"`
}

func Load(path string) (Config, error) {
	file, err := os.Open(path)
	if err != nil {
		return Config{}, errors.New("config_unavailable")
	}
	defer file.Close()
	decoder := json.NewDecoder(io.LimitReader(file, 64*1024))
	decoder.DisallowUnknownFields()
	var raw runtimeDocument
	if decoder.Decode(&raw) != nil {
		return Config{}, errors.New("config_invalid")
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return Config{}, errors.New("config_invalid")
	}
	if raw.Enabled != "true" && raw.Enabled != "false" {
		return Config{}, errors.New("config_invalid")
	}
	root := filepath.Clean(raw.ProjectsRoot)
	ledger := filepath.Clean(raw.LedgerPath)
	if !filepath.IsAbs(root) || root == "/" || !filepath.IsAbs(raw.HermesBinary) || !filepath.IsAbs(ledger) || ledger == "/" || raw.HermesBinary != "/opt/hermes/.venv/bin/hermes" {
		return Config{}, errors.New("config_invalid")
	}
	if raw.Enabled == "false" {
		if raw.Bearer != "" || raw.ProtectedValuesJSON != "" {
			return Config{}, errors.New("config_invalid")
		}
		return Config{Enabled: false, ProjectsRoot: root, HermesBinary: raw.HermesBinary, LedgerPath: ledger, Routes: map[string]model.ProjectRoute{}}, nil
	}
	if len(raw.Bearer) < 32 || len(raw.Bearer) > 4096 || strings.ContainsAny(raw.Bearer, "\r\n") {
		return Config{}, errors.New("config_invalid")
	}
	var protectedValues []string
	protectedDecoder := json.NewDecoder(strings.NewReader(raw.ProtectedValuesJSON))
	protectedDecoder.DisallowUnknownFields()
	var protectedTrailing any
	if protectedDecoder.Decode(&protectedValues) != nil || protectedDecoder.Decode(&protectedTrailing) != io.EOF || len(protectedValues) != 2 || protectedValues[0] == "" || protectedValues[1] == "" || strings.EqualFold(protectedValues[0], protectedValues[1]) {
		return Config{}, errors.New("config_invalid")
	}
	for _, value := range protectedValues {
		if len(value) > 320 || strings.TrimSpace(value) != value || strings.ContainsAny(value, "\r\n") || !strings.Contains(value, "@") {
			return Config{}, errors.New("config_invalid")
		}
	}
	var definitions []routeDefinition
	routeDecoder := json.NewDecoder(strings.NewReader(raw.RoutesJSON))
	routeDecoder.DisallowUnknownFields()
	var routeTrailing any
	if routeDecoder.Decode(&definitions) != nil || routeDecoder.Decode(&routeTrailing) != io.EOF || len(definitions) == 0 || len(definitions) > 100 {
		return Config{}, errors.New("config_invalid")
	}
	sort.Slice(definitions, func(i, j int) bool { return definitions[i].CanonicalProject < definitions[j].CanonicalProject })
	canonical, _ := json.Marshal(definitions)
	digest := sha256.Sum256(canonical)
	digestHex := hex.EncodeToString(digest[:])
	routes := make(map[string]model.ProjectRoute, len(definitions))
	aliases := map[string]struct{}{}
	for _, definition := range definitions {
		if strings.TrimSpace(definition.CanonicalProject) == "" || len(definition.CanonicalProject) > 80 || !notePattern.MatchString(definition.NoteDirectory) || !boardPattern.MatchString(definition.KanbanBoard) || len(definition.Aliases) == 0 || len(definition.Aliases) > 20 {
			return Config{}, errors.New("config_invalid")
		}
		for _, alias := range definition.Aliases {
			normalized := NormalizeAlias(alias)
			if normalized == "" {
				return Config{}, errors.New("config_invalid")
			}
			if _, exists := aliases[normalized]; exists {
				return Config{}, errors.New("config_invalid")
			}
			aliases[normalized] = struct{}{}
		}
		if _, exists := routes[definition.CanonicalProject]; exists {
			return Config{}, errors.New("config_invalid")
		}
		routes[definition.CanonicalProject] = model.ProjectRoute{CanonicalProject: definition.CanonicalProject, NoteDirectory: definition.NoteDirectory, KanbanBoard: definition.KanbanBoard, ConfigDigest: digestHex}
	}
	return Config{Enabled: true, Bearer: raw.Bearer, ProjectsRoot: root, HermesBinary: raw.HermesBinary, LedgerPath: ledger, Routes: routes, ConfigDigest: digestHex, ProtectedValues: append([]string(nil), protectedValues...)}, nil
}

func NormalizeAlias(value string) string {
	return strings.Join(strings.Fields(strings.ToLower(value)), " ")
}

func ValidateRoute(configuration Config, route *model.ProjectRoute) (model.ProjectRoute, bool) {
	if route == nil {
		return model.ProjectRoute{KanbanBoard: "meeting-triage"}, true
	}
	want, ok := configuration.Routes[route.CanonicalProject]
	if !ok {
		return model.ProjectRoute{}, false
	}
	wantRaw, _ := json.Marshal(want)
	gotRaw, _ := json.Marshal(route)
	return want, bytes.Equal(wantRaw, gotRaw)
}
