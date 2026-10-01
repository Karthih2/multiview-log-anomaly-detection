"""Create, list, inspect and delete pipeline runs."""
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from sqlalchemy import func, select

from app.api.deps import AnyRun, AppSettings, CompletedRun, DbSession, Paging
from app.db import models
from app.db.models import SourceKind
from app.schemas.common import Page
from app.schemas.runs import RunDetail, RunOut, RunSummary
from app.services import runs as run_service

router = APIRouter(prefix="/runs", tags=["runs"])


@router.post("", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
def upload_log(file: UploadFile, db: DbSession, settings: AppSettings,
               name: Annotated[str | None, Form()] = None):
    """Upload a raw log file; the pipeline runs in the background.
    Poll GET /runs/{id} for status and stage."""
    filename = Path(file.filename or "").name
    if not filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "The upload has no file name")

    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    destination = settings.uploads_dir / f"{uuid4().hex}_{filename}"
    max_bytes = settings.max_upload_mb * 1024 * 1024
    written = 0
    with open(destination, "wb") as out:
        while chunk := file.file.read(settings.upload_chunk_bytes):
            written += len(chunk)
            if written > max_bytes:
                break
            out.write(chunk)
    if written > max_bytes or written == 0:
        destination.unlink(missing_ok=True)
        if written == 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "The uploaded file is empty")
        raise HTTPException(
            status.HTTP_413_CONTENT_TOO_LARGE,
            f"File exceeds the {settings.max_upload_mb} MB upload limit")

    run = run_service.create_run(db, name or filename, SourceKind.UPLOAD, destination)
    run_service.submit_run(run.id)
    return run


@router.get("", response_model=Page[RunOut])
def list_runs(db: DbSession, paging: Paging):
    total = db.scalar(select(func.count()).select_from(models.PipelineRun))
    items = db.scalars(
        select(models.PipelineRun).order_by(models.PipelineRun.id.desc())
        .limit(paging.limit).offset(paging.offset)).all()
    return Page(items=items, total=total, limit=paging.limit, offset=paging.offset)


@router.get("/{run_id}", response_model=RunDetail)
def get_run(run: AnyRun):
    detail = RunOut.model_validate(run).model_dump()
    return RunDetail(
        **detail, parameters=run.parameters, stage_log=run.stage_log, view_summary=run.view_summary, detectors=run.detectors,
        planned_stages=run_service.planned_stages(run.source_kind))


@router.delete("/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_run(run: AnyRun, db: DbSession):
    if run.status in (models.RunStatus.QUEUED.value, models.RunStatus.RUNNING.value):
        raise HTTPException(status.HTTP_409_CONFLICT, "Run is still in progress")
    run_service.delete_run(db, run)


@router.get("/{run_id}/summary", response_model=RunSummary)
def run_summary(run: CompletedRun, db: DbSession):
    severity_counts = dict(db.execute(
        select(models.LogEvent.severity, func.count())
        .where(models.LogEvent.run_id == run.id, models.LogEvent.is_anomaly)
        .group_by(models.LogEvent.severity)).all())
    test_metrics = db.scalar(
        select(models.EvaluationMetric.metrics)
        .where(models.EvaluationMetric.run_id == run.id, models.EvaluationMetric.scope == "test"))
    return RunSummary(
        run_id=run.id,
        total_rows=run.total_rows,
        n_anomalies=run.n_anomalies,
        anomaly_rate=run.n_anomalies / run.total_rows,
        n_incidents=run.n_incidents,
        n_templates=run.n_templates,
        time_start=run.time_start,
        time_end=run.time_end,
        severity_counts=severity_counts,
        test_metrics=test_metrics,
    )
