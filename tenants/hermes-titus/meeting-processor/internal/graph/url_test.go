package graph

import (
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Little-Town-Labs/overnightdesk/tenants/hermes-titus/meeting-processor/internal/testfixture"
)

func TestInitialURLIsOrganizerAndTypeScoped(t *testing.T) {
	start := time.Date(2026, 7, 25, 12, 0, 0, 0, time.UTC)
	for _, artifactType := range []ArtifactType{Transcript, Recording} {
		raw, err := InitialDeltaURL(testfixture.OrganizerOne, artifactType, start)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.HasPrefix(raw, "https://graph.microsoft.com/v1.0/users/"+testfixture.OrganizerOne+"/onlineMeetings/") || !strings.Contains(raw, "startDateTime=2026-07-25T12:00:00Z") {
			t.Fatalf("unexpected initial URL shape for %s", artifactType)
		}
		if err := ValidateDeltaURL(raw, testfixture.OrganizerOne, artifactType, true); err != nil {
			t.Fatal(err)
		}
	}
}

func TestValidateContinuationRejectsBoundaryChanges(t *testing.T) {
	valid := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?$skipToken=opaque"
	if err := ValidateDeltaURL(valid, testfixture.OrganizerOne, Transcript, false); err != nil {
		t.Fatal(err)
	}
	cases := []string{
		strings.Replace(valid, "https", "http", 1),
		strings.Replace(valid, "graph.microsoft.com", "evil.example", 1),
		strings.Replace(valid, testfixture.OrganizerOne, testfixture.OrganizerTwo, 1),
		strings.Replace(valid, "getAllTranscripts", "getAllRecordings", 1),
		strings.Replace(valid, "$skipToken", "redirect", 1),
		valid + "&$top=100",
		valid + "#fragment",
		"https://graph.microsoft.com.evil.example/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?$skipToken=opaque",
	}
	for _, raw := range cases {
		if err := ValidateDeltaURL(raw, testfixture.OrganizerOne, Transcript, false); err == nil {
			t.Fatalf("expected rejection for %q", raw)
		}
	}
}

func TestValidateContinuationAcceptsProviderReturnedTokenSpellings(t *testing.T) {
	base := "https://graph.microsoft.com/v1.0/users/" + testfixture.OrganizerOne + "/onlineMeetings/getAllTranscripts(meetingOrganizerUserId='" + testfixture.OrganizerOne + "')/delta?"
	for _, query := range []string{"skipToken=next", "deltaToken=done"} {
		if err := ValidateDeltaURL(base+query, testfixture.OrganizerOne, Transcript, false); err != nil {
			t.Fatalf("provider continuation %q rejected: %v", query, err)
		}
	}
}

func TestSafeHTTPClientRejectsRedirects(t *testing.T) {
	client := NewHTTPClient(30 * time.Second)
	if err := client.CheckRedirect(&http.Request{}, []*http.Request{{}}); err == nil {
		t.Fatal("expected redirects to be rejected")
	}
	if MaxResponseBytes != 4<<20 || MaxRoundArtifactBytes != 8<<20 || MaxRoundArtifacts != 2500 || MaxPages != 100 {
		t.Fatal("provider bounds changed")
	}
}
