# Contract: SecurityTeam Stateless Inbound Scan

`POST http://overnightdesk-securityteam:4700/scan-inbound`

Authentication uses `Authorization: Bearer <SECURITY_SERVICE_TOKEN>`. The
client rejects redirects and uses a bounded request and response.

```json
{
  "source": "api",
  "contentType": "text",
  "body": "<bounded WebVTT>",
  "subject": "Titus meeting transcript <internal-reference>",
  "messageId": "<internal-reference>",
  "metadata": {
    "provider": "microsoft_graph",
    "artifact_type": "transcript",
    "organizer_slot": "organizer_1"
  },
  "approvalMode": "block"
}
```

`approvalMode` is optional and defaults to `queue`, preserving current clients.
With `block`, any outcome that would require approval returns `status=blocked`
and MUST NOT call `ApprovalQueueAdapter.enqueue`.

The meeting processor accepts only:

```json
{
  "status": "safe",
  "content": "<non-empty screened wrapper>",
  "metadata": {
    "source": "api",
    "quarantineDecision": "allow"
  }
}
```

Blocked, pending, content-bearing blocked responses, source mismatch, unknown
fields required for trust, oversized bodies, non-200 status, redirects, and
malformed JSON fail closed before Titus.
