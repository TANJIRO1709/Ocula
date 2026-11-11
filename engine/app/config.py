"""Engine settings (environment variables or a .env file)."""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: str = "development"
    # Shared secret the Node gateway sends in the X-Engine-Key header. Empty = open (local dev only).
    engine_api_key: str = ""

    # Optional LLM — the deterministic rule-based fallback is used when provider is "none".
    llm_provider: str = "none"  # none | openai | anthropic | openai_compatible
    llm_model: str = "gpt-4o-mini"
    llm_api_key: str | None = None
    llm_base_url: str | None = None
    llm_timeout_s: float = 20.0


@lru_cache
def get_settings() -> Settings:
    return Settings()
