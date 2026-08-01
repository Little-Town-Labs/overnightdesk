package model

import (
	"encoding/json"
	"os"
	"testing"
)

func parityBrief() Brief {
	due := "2026-08-08"
	hint := "OvernightDesk"
	return Brief{
		SchemaVersion: "meeting-brief/v1", Title: "Client planning", OccurredAt: "2026-08-01T12:00:00Z",
		Participants: []string{"Gary", "Client"}, Summary: "Discussed the next milestone.",
		Facts: []string{"The client requested a draft."}, Decisions: []string{"Use the approved review flow."},
		ActionItems:         []ActionItem{{Title: "Prepare draft", Owner: "gary", DueDate: &due, SourceTimestamp: "01:02.003", Confidence: "high"}},
		ExternalCommitments: []Commitment{{Title: "Track the promised response internally", SourceTimestamp: "02:03", Confidence: "medium"}},
		UnresolvedQuestions: []string{"Which format is preferred?"}, ProposedFollowUp: "Draft an internal response for review.",
		ProjectHint: &hint, ProjectConfidence: "high",
	}
}

func TestCommittedValidationParityFixtures(t *testing.T) {
	type fixture struct {
		Name      string   `json:"name"`
		Field     string   `json:"field"`
		Value     string   `json:"value"`
		Protected []string `json:"protected"`
		Valid     bool     `json:"valid"`
	}
	raw, err := os.ReadFile("../../../meeting-brief-contract/validation-parity.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []fixture
	if json.Unmarshal(raw, &fixtures) != nil || len(fixtures) == 0 {
		t.Fatal("validation parity fixture is invalid")
	}
	for _, test := range fixtures {
		t.Run(test.Name, func(t *testing.T) {
			brief := parityBrief()
			brief.Facts = append([]string(nil), brief.Facts...)
			brief.ActionItems = append([]ActionItem(nil), brief.ActionItems...)
			switch test.Field {
			case "none":
			case "title":
				brief.Title = test.Value
			case "summary":
				brief.Summary = test.Value
			case "fact":
				brief.Facts[0] = test.Value
			case "actionTimestamp":
				brief.ActionItems[0].SourceTimestamp = test.Value
			default:
				t.Fatalf("unknown fixture field %q", test.Field)
			}
			if got := ValidateBrief(brief, test.Protected); got != test.Valid {
				t.Fatalf("valid=%t got=%t", test.Valid, got)
			}
		})
	}
}
