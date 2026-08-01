package kanban

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"regexp"
	"strings"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-filer/internal/model"
)

var safeValue = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,62}$`)

type Runner interface {
	Run(context.Context, string, ...string) ([]byte, error)
}
type ExecRunner struct{}

func (ExecRunner) Run(ctx context.Context, binary string, args ...string) ([]byte, error) {
	return exec.CommandContext(ctx, binary, args...).Output()
}

type Adapter struct {
	Binary        string
	AllowedBoards map[string]struct{}
	Runner        Runner
}

func (adapter Adapter) Create(ctx context.Context, board, title, body, key string) (string, error) {
	if adapter.Binary != "/opt/hermes/.venv/bin/hermes" || adapter.Runner == nil || !safeValue.MatchString(board) || len(title) < 1 || len([]rune(title)) > 200 || len([]rune(body)) > 2000 || !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(key) {
		return "", errors.New("kanban_request_invalid")
	}
	if _, ok := adapter.AllowedBoards[board]; !ok {
		return "", errors.New("kanban_board_denied")
	}
	args := []string{"kanban", "--board", board, "create", title, "--body", body, "--triage", "--idempotency-key", key, "--json"}
	raw, err := adapter.Runner.Run(ctx, adapter.Binary, args...)
	if err != nil {
		return "", errors.New("kanban_unavailable")
	}
	if len(raw) > 8192 {
		return "", errors.New("kanban_response_invalid")
	}
	var response struct {
		TaskID string `json:"task_id"`
	}
	if json.Unmarshal(raw, &response) != nil || !regexp.MustCompile(`^t_[A-Za-z0-9_-]{1,128}$`).MatchString(response.TaskID) {
		return "", errors.New("kanban_response_invalid")
	}
	return response.TaskID, nil
}

func ItemKey(reference, briefDigest, kind string, index int) (string, error) {
	key, err := model.FilingItemKey(reference, briefDigest, kind, index)
	if err != nil {
		return "", errors.New("kanban_request_invalid")
	}
	return key, nil
}

type Results struct {
	TriageKey  *string
	ActionKeys []string
}

func CreateTasks(ctx context.Context, adapter Adapter, reference, briefDigest string, brief model.Brief, route *model.ProjectRoute) (Results, error) {
	board := "meeting-triage"
	if route != nil {
		board = route.KanbanBoard
	}
	result := Results{ActionKeys: make([]string, 0, len(brief.ActionItems)+len(brief.ExternalCommitments))}
	if route == nil {
		key, _ := ItemKey(reference, briefDigest, "triage", 0)
		if _, err := adapter.Create(ctx, board, "Identify project for "+reference, "Approved meeting brief requires project routing. Internal tracking only. Reference: "+reference, key); err != nil {
			return Results{}, err
		}
		result.TriageKey = &key
	}
	for index, item := range brief.ActionItems {
		key, _ := ItemKey(reference, briefDigest, "action", index)
		body := fmt.Sprintf("Internal action from %s. Owner: %s. Source timestamp: %s. No external execution is authorized.", reference, item.Owner, item.SourceTimestamp)
		if _, err := adapter.Create(ctx, board, bound(item.Title, 200), body, key); err != nil {
			return Results{}, err
		}
		result.ActionKeys = append(result.ActionKeys, key)
	}
	for index, item := range brief.ExternalCommitments {
		key, _ := ItemKey(reference, briefDigest, "commitment", index)
		body := fmt.Sprintf("External commitment tracked internally from %s. Source timestamp: %s. Do not send outreach or perform external action.", reference, item.SourceTimestamp)
		if _, err := adapter.Create(ctx, board, bound("Internal follow-up: "+item.Title, 200), body, key); err != nil {
			return Results{}, err
		}
		result.ActionKeys = append(result.ActionKeys, key)
	}
	return result, nil
}

func bound(value string, maximum int) string {
	runes := []rune(strings.TrimSpace(value))
	if len(runes) > maximum {
		runes = runes[:maximum]
	}
	return string(runes)
}
