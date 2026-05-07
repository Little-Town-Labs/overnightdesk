import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Config:
    database_url: str
    openrouter_api_key: str
    mcp_access_key: str
    embedding_model: str = "openai/text-embedding-3-small"
    embedding_dims: int = 1536
    host: str = "0.0.0.0"
    port: int = 3000
    openrouter_base: str = "https://openrouter.ai/api/v1"


def load() -> Config:
    def req(name: str) -> str:
        v = os.environ.get(name)
        if not v:
            raise RuntimeError(f"{name} env var required")
        return v

    db_url = os.environ.get("DATABASE_URL") or _assemble_db_url(req)

    # Per platform convention: Gary's services read OPENROUTER_API_KEY_GARY.
    # Plain OPENROUTER_API_KEY accepted as transitional fallback.
    or_key = (
        os.environ.get("OPENROUTER_API_KEY_GARY")
        or os.environ.get("OPENROUTER_API_KEY")
        or _missing("OPENROUTER_API_KEY_GARY")
    )

    return Config(
        database_url=db_url,
        openrouter_api_key=or_key,
        mcp_access_key=req("MCP_ACCESS_KEY"),
        embedding_model=os.environ.get("EMBEDDING_MODEL", "openai/text-embedding-3-small"),
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "3000")),
    )


def _missing(name: str):
    raise RuntimeError(f"{name} env var required")


def _assemble_db_url(req) -> str:
    from urllib.parse import quote_plus

    user = os.environ.get("DB_USER", "ace_app")
    pw = quote_plus(req("ACE_APP_PASSWORD"))
    host = os.environ.get("DB_HOST", "tenet0-postgres")
    port = os.environ.get("DB_PORT", "5432")
    name = os.environ.get("DB_NAME", "tenet0")
    return f"postgresql://{user}:{pw}@{host}:{port}/{name}"
