import asyncio
import contextlib
import logging

import uvicorn
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Mount, Route

from .auth import BearerAuthMiddleware
from .config import load
from .db import Store
from .embeddings import OpenRouterClient
from .server import build

log = logging.getLogger("ob1-mcp")


async def _run() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s"
    )
    cfg = load()
    store = Store(cfg)
    embed = OpenRouterClient(cfg)
    await store.open()

    mcp = build(cfg, store, embed)
    mcp_app = mcp.streamable_http_app()

    async def healthz(_request):
        try:
            await store.stats()
            return JSONResponse({"status": "ok"})
        except Exception as e:
            log.exception("healthz failed")
            return JSONResponse({"status": "degraded", "error": str(e)}, status_code=503)

    @contextlib.asynccontextmanager
    async def lifespan(_app):
        # Forward mcp_app's lifespan so its session manager runs.
        async with mcp_app.router.lifespan_context(mcp_app):
            yield

    app = Starlette(
        routes=[
            Route("/healthz", healthz, methods=["GET"]),
            Mount("/mcp", app=mcp_app),
        ],
        lifespan=lifespan,
    )
    app.add_middleware(BearerAuthMiddleware, expected_token=cfg.mcp_access_key)

    config = uvicorn.Config(
        app, host=cfg.host, port=cfg.port, log_level="info", access_log=True
    )
    server = uvicorn.Server(config)
    log.info("ob1-mcp listening on %s:%s", cfg.host, cfg.port)
    try:
        await server.serve()
    finally:
        await embed.aclose()
        await store.close()


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
