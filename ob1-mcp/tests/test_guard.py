"""Unit tests for the trust-layer guard.

Covers:
  * rate limit (per-minute, per-hour) is sliding-window correct
  * unset SECURITYTEAM_URL is bypass + warning
  * securityteam allowed=true → ok
  * securityteam allowed=false → GuardRejection with findings summary
  * 5xx and transport error → GuardRejection (fail-closed)
"""

from __future__ import annotations

import httpx
import pytest

from src.guard import Guard, GuardRejection


def _mock_transport(handler):
    return httpx.MockTransport(handler)


@pytest.mark.asyncio
async def test_quota_per_minute_limit():
    g = Guard(securityteam_url=None, per_minute=3, per_hour=100)
    g.check_quota()
    g.check_quota()
    g.check_quota()
    with pytest.raises(GuardRejection, match="3/min"):
        g.check_quota()
    await g.aclose()


@pytest.mark.asyncio
async def test_quota_isolated_per_identity():
    g = Guard(securityteam_url=None, per_minute=1, per_hour=100)
    g.check_quota("tenant-a")
    g.check_quota("tenant-b")  # different bucket
    with pytest.raises(GuardRejection):
        g.check_quota("tenant-a")
    await g.aclose()


@pytest.mark.asyncio
async def test_unset_url_is_bypass(caplog):
    g = Guard(securityteam_url=None, per_minute=10, per_hour=100)
    await g.check_content("anything")
    await g.check_content("more")
    # Warning logged exactly once.
    msgs = [r.message for r in caplog.records if r.name == "ob1-mcp.guard"]
    assert sum("SECURITYTEAM_URL unset" in m for m in msgs) == 1
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_allowed_true():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"allowed": True, "content": "clean"})

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(
        securityteam_url="http://test", per_minute=10, per_hour=100, client=client
    )
    await g.check_content("hello")  # no raise
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_allowed_false_raises_with_findings():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "allowed": False,
                "findings": ["Secret: openrouter_key (1)", "PII: email (2)"],
                "redactedContent": "redacted",
                "reason": "Content contains sensitive data",
            },
        )

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(securityteam_url="http://test", per_minute=10, per_hour=100, client=client)
    with pytest.raises(GuardRejection) as exc:
        await g.check_content("my email is x@y.com and key sk-or-v1-...")
    msg = str(exc.value)
    assert "openrouter_key" in msg or "PII: email" in msg
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_5xx_fails_closed():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, text="upstream down")

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(securityteam_url="http://test", per_minute=10, per_hour=100, client=client)
    with pytest.raises(GuardRejection, match="trust layer reported error"):
        await g.check_content("anything")
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_transport_error_fails_closed():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("nope", request=request)

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(securityteam_url="http://test", per_minute=10, per_hour=100, client=client)
    with pytest.raises(GuardRejection, match="unreachable"):
        await g.check_content("anything")
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_sends_bearer_token_when_configured():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"allowed": True})

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(
        securityteam_url="http://test",
        securityteam_token="tok-abc123",
        per_minute=10,
        per_hour=100,
        client=client,
    )
    await g.check_content("hello")
    assert captured["auth"] == "Bearer tok-abc123"
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_omits_auth_header_when_token_unset():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["auth"] = request.headers.get("authorization")
        return httpx.Response(200, json={"allowed": True})

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(
        securityteam_url="http://test", per_minute=10, per_hour=100, client=client
    )
    await g.check_content("hello")
    assert captured["auth"] is None
    await g.aclose()


@pytest.mark.asyncio
async def test_securityteam_request_payload_shape():
    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        import json

        captured["url"] = str(request.url)
        captured["body"] = json.loads(request.content)
        return httpx.Response(200, json={"allowed": True})

    client = httpx.AsyncClient(transport=_mock_transport(handler))
    g = Guard(
        securityteam_url="http://overnightdesk-securityteam:4700",
        per_minute=10,
        per_hour=100,
        client=client,
    )
    await g.check_content("hello world")
    assert captured["url"].endswith("/check-outbound")
    assert captured["body"]["content"] == "hello world"
    assert captured["body"]["kind"] in {
        "send_email",
        "send_tweet",
        "post_public",
        "create_draft",
        "delete_file",
        "commit_push",
    }
    await g.aclose()
