"""Health check and configuration introspection."""
from typing import Any

from fastapi import APIRouter
from sqlalchemy import text

from app.api.deps import DbSession
from app.core.pipeline_config import load_pipeline_config

router = APIRouter(tags=["system"])


@router.get("/health")
def health(db: DbSession) -> dict[str, str]:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/config/pipeline")
def pipeline_config() -> dict[str, dict[str, Any]]:
    """Pipeline parameters in effect: experiment defaults with config overrides applied.
    The first call is slow because it loads the experiment modules."""
    return load_pipeline_config().effective()
