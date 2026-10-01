"""Shared request dependencies."""
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db import models
from app.db.session import get_db

DbSession = Annotated[Session, Depends(get_db)]
AppSettings = Annotated[Settings, Depends(get_settings)]


def get_run(run_id: int, db: DbSession) -> models.PipelineRun:
    run = db.get(models.PipelineRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Run {run_id} not found")
    return run


def get_completed_run(run: Annotated[models.PipelineRun, Depends(get_run)]) -> models.PipelineRun:
    if run.status != models.RunStatus.COMPLETED.value:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Run {run.id} has no results yet (status: {run.status})")
    return run


AnyRun = Annotated[models.PipelineRun, Depends(get_run)]
CompletedRun = Annotated[models.PipelineRun, Depends(get_completed_run)]


@dataclass
class Pagination:
    limit: int
    offset: int


def get_pagination(
    settings: AppSettings,
    limit: Annotated[int | None, Query(ge=1)] = None,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> Pagination:
    limit = settings.page_size_default if limit is None else limit
    if limit > settings.page_size_max:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"limit must not exceed {settings.page_size_max}")
    return Pagination(limit=limit, offset=offset)


Paging = Annotated[Pagination, Depends(get_pagination)]
