"""Exact-route service authentication for Production Guardian task intake."""
from __future__ import annotations

import hmac
import math
import os
from collections import Counter
from typing import Optional

from hermes_cli.dashboard_auth import (
    DashboardAuthProvider,
    LoginStart,
    Session,
    TokenPrincipal,
)

CREATE_ROUTE = "/api/plugins/platform-task-intake/tasks"
RESOLVE_ROUTE = "/api/plugins/platform-task-intake/resolve"
MIN_CHARS = 43
MIN_DISTINCT = 16
MIN_BITS = 128.0
LAST_SKIP_REASON = ""


def _shannon_bits(value: str) -> float:
    if not value:
        return 0.0
    counts = Counter(value)
    length = len(value)
    return length * -sum(
        (count / length) * math.log2(count / length)
        for count in counts.values()
    )


def assess_secret_strength(secret: str) -> Optional[str]:
    if len(secret) < MIN_CHARS:
        return f"secret too short: {len(secret)} chars"
    if len(set(secret)) < MIN_DISTINCT:
        return "secret has too few distinct characters"
    if _shannon_bits(secret) < MIN_BITS:
        return "secret entropy is below 128 bits"
    return None


class PlatformTaskIntakeSecretProvider(DashboardAuthProvider):
    name = "platform-task-intake-secret"
    display_name = "Production Guardian task intake"
    supports_token = True
    supports_session = False

    def __init__(self, *, secret: str) -> None:
        reason = assess_secret_strength(secret)
        if reason:
            raise ValueError(reason)
        self._secret = secret

    def verify_token(self, *, token: str) -> Optional[TokenPrincipal]:
        if token and hmac.compare_digest(
            token.encode("utf-8"), self._secret.encode("utf-8")
        ):
            return TokenPrincipal(
                principal="production-guardian",
                provider=self.name,
                scopes=("platform-task-intake",),
            )
        return None

    def start_login(self, *, redirect_uri: str) -> LoginStart:
        raise NotImplementedError

    def complete_login(
        self, *, code: str, state: str, code_verifier: str, redirect_uri: str
    ) -> Session:
        raise NotImplementedError

    def verify_session(self, *, access_token: str) -> Optional[Session]:
        return None

    def refresh_session(self, *, refresh_token: str) -> Session:
        raise NotImplementedError

    def revoke_session(self, *, refresh_token: str) -> None:
        return None


def register(ctx) -> None:
    global LAST_SKIP_REASON
    secret = os.environ.get("PLATFORM_TASK_INTAKE_TOKEN", "").strip()
    if not secret:
        LAST_SKIP_REASON = "PLATFORM_TASK_INTAKE_TOKEN is not set"
        return
    reason = assess_secret_strength(secret)
    if reason:
        LAST_SKIP_REASON = reason
        return
    ctx.register_dashboard_auth_provider(
        PlatformTaskIntakeSecretProvider(secret=secret)
    )
    from hermes_cli.dashboard_auth.token_auth import register_token_route

    register_token_route(CREATE_ROUTE)
    register_token_route(RESOLVE_ROUTE)
    LAST_SKIP_REASON = ""
