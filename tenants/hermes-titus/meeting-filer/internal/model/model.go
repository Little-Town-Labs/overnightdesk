package model

import "encoding/json"

type FilingInput struct {
	SchemaVersion string          `json:"schemaVersion"`
	Reference     string          `json:"reference"`
	ApprovedBy    string          `json:"approvedBy"`
	ApprovedAt    string          `json:"approvedAt"`
	BriefDigest   string          `json:"briefDigest"`
	Brief         json.RawMessage `json:"brief"`
	ProjectRoute  *ProjectRoute   `json:"projectRoute"`
}

type ProjectRoute struct {
	CanonicalProject string `json:"canonicalProject"`
	NoteDirectory    string `json:"noteDirectory"`
	KanbanBoard      string `json:"kanbanBoard"`
	ConfigDigest     string `json:"configDigest"`
}

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

type FilingResult struct {
	SchemaVersion    string   `json:"schemaVersion"`
	Reference        string   `json:"reference"`
	RequestDigest    string   `json:"requestDigest"`
	NoteRelativePath string   `json:"noteRelativePath"`
	NoteDigest       string   `json:"noteDigest"`
	NoteKey          string   `json:"noteKey"`
	Board            string   `json:"board"`
	TriageTaskKey    *string  `json:"triageTaskKey"`
	ActionTaskKeys   []string `json:"actionTaskKeys"`
	FiledAt          string   `json:"filedAt"`
}
