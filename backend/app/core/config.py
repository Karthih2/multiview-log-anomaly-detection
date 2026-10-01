"""Runtime settings for the backend.

Every value can be overridden through an environment variable with the
``LOGSIGHT_`` prefix or through ``backend/.env`` (see ``.env.example``).
Path defaults are derived from where this package lives on disk, so nothing
here depends on a particular machine.
"""
from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="LOGSIGHT_",
        env_file=BACKEND_DIR / ".env",
        extra="ignore",
    )

    app_name: str = "LogSight API"
    api_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(default_factory=list)

    # Project root holding the experiment code (``engine/``) the pipeline reuses.
    experiment_root: Path = BACKEND_DIR.parent
    # Precomputed experiment outputs; defaults to <experiment_root>/data/processed.
    artifacts_dir: Path | None = None
    storage_dir: Path = BACKEND_DIR / "storage"
    pipeline_config_path: Path = BACKEND_DIR / "config" / "pipeline.yaml"
    # Defaults to a SQLite file inside storage_dir; point at PostgreSQL later.
    database_url: str | None = None

    max_upload_mb: int = 1024
    upload_chunk_bytes: int = 1024 * 1024
    pipeline_workers: int = 1
    db_insert_chunk_rows: int = 50_000
    page_size_default: int = 50
    page_size_max: int = 500

    @model_validator(mode="after")
    def _derive_defaults(self) -> "Settings":
        if self.artifacts_dir is None:
            self.artifacts_dir = self.experiment_root / "data" / "processed"
        if self.database_url is None:
            self.database_url = f"sqlite:///{(self.storage_dir / 'logsight.db').as_posix()}"
        return self

    @property
    def uploads_dir(self) -> Path:
        return self.storage_dir / "uploads"


@lru_cache
def get_settings() -> Settings:
    return Settings()
