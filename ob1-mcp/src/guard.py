"""Trust-layer guard for memory writes.

Sits between the MCP tool entry points and the embed/store path. Two checks:

1. **Rate limit** (token-bucket per bearer/tenant identity).
   Cap on `save_thought` and `supersede_thought` calls per minute and per hour.

2. **Securityteam pre-flight** (PII + secret + financial-channel guards).
   POSTs the content to the securityteam container's `/check-outbound`
   endpoint before we embed or store. If securityteam reports findings,
   the write is rejected — the worker should fix the secret at source,
   not have it silently land in long-term memory.

Guard is intentionally *fail-open* on missing config (no `SECURITYTEAM_URL`
set) — so local dev / unit tests can run without standing up the full
platform — and *fail-closed* on configured-but-broken securityteam (5xx
or transport error) so a securityteam outage doesn't quietly poison
memory.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from dataclasses import dataclass, field
from threading import Lock
from typing import Iterable

import httpx

log = logging.getLogger("ob1-mcp.guard")


class GuardRejection(RuntimeError):
    """Write was rejected by the trust layer. Message is safe to surface to caller."""


@dataclass
class _Bucket:
    """Sliding-window counter. Not a leaky bucket; simpler and exact."""

    window_seconds: int
    capacity: int
    timestamps: deque[float] = field(default_factory=deque)

    def allow(self, now: float) -> bool:
        cutoff = now - self.window_seconds
        while self.timestamps and self.timestamps[0] < cutoff:
            self.timestamps.popleft()
        if len(self.timestamps) >= self.capacity:
            return False
        self.timestamps.append(now)
        return True


class Guard:
    def __init__(
        self,
        *,
        securityteam_url: str | None,
        per_minute: int,
        per_hour: int,
        securityteam_token: str | None = None,
        client: httpx.AsyncClient | None = None,
        timeout: float = 5.0,
    ) -> None:
        self._url = securityteam_url.rstrip("/") if securityteam_url else None
        self._token = securityteam_token or None
        self._per_minute = per_minute
        self._per_hour = per_hour
        self._buckets: dict[str, tuple[_Bucket, _Bucket]] = {}
        self._buckets_lock = Lock()
        self._timeout = timeout
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._owns_client = client is None
        self._warned_no_url = False
        self._warned_no_token = False

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    def _bucket_for(self, identity: str) -> tuple[_Bucket, _Bucket]:
        with self._buckets_lock:
            existing = self._buckets.get(identity)
            if existing is None:
                existing = (
                    _Bucket(window_seconds=60, capacity=self._per_minute),
                    _Bucket(window_seconds=3600, capacity=self._per_hour),
                )
                self._buckets[identity] = existing
            return existing

    def check_quota(self, identity: str = "default") -> None:
        per_min, per_hour = self._bucket_for(identity)
        now = time.monotonic()
        with self._buckets_lock:
            if not per_min.allow(now):
                raise GuardRejection(
                    f"write rate limit exceeded: {self._per_minute}/min for '{identity}'"
                )
            if not per_hour.allow(now):
                raise GuardRejection(
                    f"write rate limit exceeded: {self._per_hour}/hour for '{identity}'"
                )

    async def check_content(self, content: str) -> None:
        if self._url is None:
            if not self._warned_no_url:
                log.warning(
                    "SECURITYTEAM_URL unset — memory writes are NOT being inspected. "
                    "Set SECURITYTEAM_URL=http://overnightdesk-securityteam:4700 in production."
                )
                self._warned_no_url = True
            return
        if self._token is None and not self._warned_no_token:
            log.warning(
                "SECURITYTEAM_TOKEN unset — securityteam will reject the request "
                "with 401 and the guard will fail-closed. Set SECURITYTEAM_TOKEN "
                "to the value of securityteam's SECURITY_SERVICE_TOKEN."
            )
            self._warned_no_token = True
        headers = {"Authorization": f"Bearer {self._token}"} if self._token else {}
        try:
            r = await self._client.post(
                f"{self._url}/check-outbound",
                json={
                    "kind": "create_draft",  # closest analog: persisting a draft of memory
                    "channel": "webhook",
                    "content": content,
                },
                headers=headers,
                timeout=self._timeout,
            )
        except httpx.HTTPError as e:
            # Fail-closed: a broken securityteam blocks writes rather than
            # silently letting unscanned content through.
            log.error("securityteam unreachable: %s", e)
            raise GuardRejection(
                "trust layer (securityteam) unreachable; refusing to write"
            ) from e
        if r.status_code >= 500:
            log.error("securityteam 5xx: %s", r.text[:200])
            raise GuardRejection("trust layer reported error; refusing to write")
        if r.status_code >= 400:
            log.error("securityteam 4xx: %s", r.text[:200])
            raise GuardRejection(f"trust layer rejected request: {r.status_code}")
        body = r.json()
        if not body.get("allowed", False):
            findings = _summarize_findings(body.get("findings") or [])
            raise GuardRejection(
                f"content blocked by trust layer: {findings or body.get('reason') or 'unspecified'}"
            )


def _summarize_findings(findings: Iterable[str]) -> str:
    items = list(findings)
    if not items:
        return ""
    if len(items) <= 3:
        return "; ".join(items)
    return "; ".join(items[:3]) + f"; (+{len(items) - 3} more)"
