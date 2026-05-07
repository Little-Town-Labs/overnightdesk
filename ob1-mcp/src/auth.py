import hmac

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp


class BearerAuthMiddleware(BaseHTTPMiddleware):
    """Constant-time bearer token check on every request to the MCP app."""

    def __init__(self, app: ASGIApp, expected_token: str, allow_health: bool = True):
        super().__init__(app)
        self._expected = expected_token.encode()
        self._allow_health = allow_health

    async def dispatch(self, request, call_next):
        if self._allow_health and request.url.path == "/healthz":
            return await call_next(request)
        auth = request.headers.get("authorization", "")
        scheme, _, token = auth.partition(" ")
        if scheme.lower() != "bearer" or not hmac.compare_digest(
            token.encode(), self._expected
        ):
            return JSONResponse({"error": "unauthorized"}, status_code=401)
        return await call_next(request)
