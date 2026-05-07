import httpx

from .config import Config


class OpenRouterClient:
    def __init__(self, cfg: Config):
        self._cfg = cfg
        self._client = httpx.AsyncClient(
            base_url=cfg.openrouter_base,
            headers={
                "Authorization": f"Bearer {cfg.openrouter_api_key}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    async def embed(self, text: str) -> list[float]:
        text = text[:8000]
        r = await self._client.post(
            "/embeddings",
            json={"model": self._cfg.embedding_model, "input": text},
        )
        r.raise_for_status()
        data = r.json()
        return data["data"][0]["embedding"]

    async def aclose(self) -> None:
        await self._client.aclose()
