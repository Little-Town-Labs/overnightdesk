package testfixture

import "fmt"

const (
	TenantID     = "11111111-1111-4111-8111-111111111111"
	ClientID     = "22222222-2222-4222-8222-222222222222"
	OrganizerOne = "33333333-3333-4333-8333-333333333333"
	OrganizerTwo = "44444444-4444-4444-8444-444444444444"
	ClientSecret = "fixture-secret-value-with-safe-length"
)

func RuntimeJSON() string {
	return fmt.Sprintf(`{
  "MSGRAPH_TENANT_ID": %q,
  "MSGRAPH_CLIENT_ID": %q,
  "MSGRAPH_CLIENT_SECRET": %q,
  "MSGRAPH_ORGANIZER_USER_IDS": %q,
  "MSGRAPH_POLL_INTERVAL_SECONDS": "300",
  "MSGRAPH_INITIAL_LOOKBACK_HOURS": "168"
}`, TenantID, ClientID, ClientSecret, OrganizerOne+","+OrganizerTwo)
}

func RuntimeContentJSON() string {
	base := RuntimeJSON()
	return base[:len(base)-2] + fmt.Sprintf(`,
  "TRANSCRIPT_CONTENT_ENABLED": "true",
  "SECURITYTEAM_BASE_URL": "http://overnightdesk-securityteam:4700",
  "SECURITY_SERVICE_TOKEN": %q,
  "HERMES_BASE_URL": "http://hermes-titus:8642",
  "HERMES_API_KEY": %q,
  "TRANSCRIPT_MAX_BYTES": "1000000",
  "SECURITYTEAM_MAX_RESPONSE_BYTES": "1250000",
  "TITUS_MAX_OUTPUT_BYTES": "65536"
}`, "s"+ClientSecret, "h"+ClientSecret)
}

func DeltaPage(artifactID, meetingID, createdAt, nextLink, deltaLink string) string {
	return fmt.Sprintf(`{
  "value": [{"id": %q, "meetingId": %q, "createdDateTime": %q,
    "contentCorrelationId": "ignored", "transcriptContentUrl": "https://invalid.example/content"}],
  "@odata.nextLink": %q,
  "@odata.deltaLink": %q
}`, artifactID, meetingID, createdAt, nextLink, deltaLink)
}
