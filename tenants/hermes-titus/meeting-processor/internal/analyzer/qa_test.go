package analyzer

import (
	"encoding/json"
	"strings"
	"testing"
)

func validQAFixture(t *testing.T, status string, attempts int) ([]byte, Validated, QABinding) {
	t.Helper()
	briefRaw, err := json.Marshal(validBrief())
	if err != nil {
		t.Fatal(err)
	}
	child, err := ParseAndValidate(briefRaw, nil)
	if err != nil {
		t.Fatal(err)
	}
	binding := QABinding{MeetingReference: "MB-ABCDEFGHIJKL", Attempt: 1, SourceDigest: strings.Repeat("a", 64), DelegationCount: attempts}
	var raw []byte
	if status == QAPass {
		raw = []byte(`{"schemaVersion":"meeting-qa/v1","status":"QA_PASS","meetingReference":"MB-ABCDEFGHIJKL","attempt":1,"sourceDigest":"` + strings.Repeat("a", 64) + `","draftAttempts":` + string(rune('0'+attempts)) + `,"qaReviews":` + string(rune('0'+attempts)) + `,"brief":` + string(briefRaw) + `}`)
	} else {
		raw = []byte(`{"schemaVersion":"meeting-qa/v1","status":"QA_BLOCKED","meetingReference":"MB-ABCDEFGHIJKL","attempt":1,"sourceDigest":"` + strings.Repeat("a", 64) + `","draftAttempts":` + string(rune('0'+attempts)) + `,"qaReviews":` + string(rune('0'+attempts)) + `,"safeReasonCode":"remediation_exhausted"}`)
	}
	return raw, child, binding
}

func TestParseQAEnvelopeBindsPassToMeetingAttemptSourceAndLatestLunaDraft(t *testing.T) {
	raw, child, binding := validQAFixture(t, QAPass, 1)
	result, err := ParseQAEnvelope(raw, binding, nil, &child)
	if err != nil {
		t.Fatal(err)
	}
	if result.Status != QAPass || result.Validated == nil || result.Validated.Digest != child.Digest {
		t.Fatalf("unexpected result: %#v", result)
	}

	fixtures := map[string]func(*QABinding, *Validated){
		"meeting": func(value *QABinding, _ *Validated) { value.MeetingReference = "MB-ZBCDEFGHIJKL" },
		"attempt": func(value *QABinding, _ *Validated) { value.Attempt = 2 },
		"source":  func(value *QABinding, _ *Validated) { value.SourceDigest = strings.Repeat("b", 64) },
		"count":   func(value *QABinding, _ *Validated) { value.DelegationCount = 2 },
		"draft": func(_ *QABinding, value *Validated) {
			changed := validBrief()
			changed.Summary = "A different draft."
			encoded, _ := json.Marshal(changed)
			*value, _ = ParseAndValidate(encoded, nil)
		},
	}
	for name, mutate := range fixtures {
		t.Run(name, func(t *testing.T) {
			changedBinding, changedChild := binding, child
			mutate(&changedBinding, &changedChild)
			if _, err := ParseQAEnvelope(raw, changedBinding, nil, &changedChild); SafeCode(err) != "qa_output_rejected" {
				t.Fatalf("mismatch accepted: %v", err)
			}
		})
	}
}

func TestParseQAEnvelopeAcceptsBoundedBlockWithoutEmailBrief(t *testing.T) {
	raw, _, binding := validQAFixture(t, QABlocked, 2)
	result, err := ParseQAEnvelope(raw, binding, nil, nil)
	if err != nil || result.Status != QABlocked || result.SafeReasonCode != "remediation_exhausted" || result.Validated != nil {
		t.Fatalf("result=%#v err=%v", result, err)
	}
}

func TestParseQAEnvelopeRejectsUnknownMalformedAndUnsafeValues(t *testing.T) {
	raw, child, binding := validQAFixture(t, QAPass, 1)
	fixtures := [][]byte{
		append(append([]byte(nil), raw[:len(raw)-1]...), []byte(`,"extra":true}`)...),
		[]byte(`{"schemaVersion":"meeting-qa/v1","status":"QA_PASS"}`),
		[]byte("```json\n" + string(raw) + "\n```"),
		[]byte(strings.Replace(string(raw), `"qaReviews":1`, `"qaReviews":2`, 1)),
		[]byte(strings.Replace(string(raw), `"status":"QA_PASS"`, `"status":"QA_BLOCKED"`, 1)),
	}
	for index, fixture := range fixtures {
		if _, err := ParseQAEnvelope(fixture, binding, nil, &child); SafeCode(err) != "qa_output_rejected" {
			t.Fatalf("fixture %d accepted: %v", index, err)
		}
	}
	if _, err := ParseQAEnvelope(raw, binding, []string{"Client planning"}, &child); SafeCode(err) != "qa_output_rejected" {
		t.Fatalf("protected value accepted: %v", err)
	}
}
