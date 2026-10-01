"""Run lifecycle: create, execute in the background, delete."""
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from sqlalchemy import delete, select, text, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.pipeline_config import load_pipeline_config
from app.db import models
from app.db.models import RunStatus, SourceKind
from app.db.session import new_session
from app.pipeline.artifacts import ARTIFACT_STAGES, load_artifacts
from app.pipeline.runner import PIPELINE_STAGES, run_pipeline
from app.services.persistence import save_result

logger = logging.getLogger(__name__)

PERSIST_STAGE = "persist"


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


@lru_cache
def _executor() -> ThreadPoolExecutor:
    return ThreadPoolExecutor(max_workers=get_settings().pipeline_workers, thread_name_prefix="pipeline")


def planned_stages(source_kind: str) -> list[str]:
    """Every stage a run of this kind goes through, in order."""
    stages = ARTIFACT_STAGES if source_kind == SourceKind.ARTIFACTS.value else PIPELINE_STAGES
    return [*stages, PERSIST_STAGE]


def create_run(session: Session, name: str, source_kind: SourceKind, source_path: Path) -> models.PipelineRun:
    run = models.PipelineRun(
        name=name, source_kind=source_kind.value, source_path=str(source_path),
        status=RunStatus.QUEUED.value, created_at=_now(),
    )
    session.add(run)
    session.commit()
    return run


def submit_run(run_id: int) -> None:
    """Queue the run on the background worker; returns immediately."""
    _executor().submit(execute_run, run_id)


def execute_run(run_id: int) -> None:
    """Run the pipeline for an existing run row and store the outcome on it."""
    with new_session() as session:
        run = session.get(models.PipelineRun, run_id)

        def on_stage(stage: str) -> None:
            logger.info("run %s: %s", run_id, stage)
            run.stage = stage
            run.stage_log = [*(run.stage_log or []), {"stage": stage, "started_at": _now().isoformat()}]
            session.commit()

        try:
            cfg = load_pipeline_config()
            run.status = RunStatus.RUNNING.value
            run.started_at = _now()
            run.parameters = cfg.effective()
            session.commit()

            source = Path(run.source_path)
            if run.source_kind == SourceKind.ARTIFACTS.value:
                result = load_artifacts(source, cfg, on_stage)
            else:
                result = run_pipeline(source, cfg, on_stage)

            on_stage(PERSIST_STAGE)
            save_result(session, run, result)
            # Refresh planner statistics so the new rows are queried through the right indexes.
            session.execute(text("ANALYZE"))
            run.status = RunStatus.COMPLETED.value
            run.stage = None
        except Exception as exc:
            logger.exception("run %s failed", run_id)
            session.rollback()
            run.status = RunStatus.FAILED.value
            run.error = "".join(traceback.format_exception_only(type(exc), exc)).strip()
        run.finished_at = _now()
        session.commit()


def delete_run(session: Session, run: models.PipelineRun) -> None:
    for table in models.RUN_CHILD_TABLES:
        session.execute(delete(table).where(table.run_id == run.id))
    session.delete(run)
    session.commit()
    if run.source_kind == SourceKind.UPLOAD.value:
        Path(run.source_path).unlink(missing_ok=True)


def fail_interrupted_runs() -> None:
    """Runs left queued/running by a previous process can never finish; mark them failed."""
    unfinished = (RunStatus.QUEUED.value, RunStatus.RUNNING.value)
    with new_session() as session:
        interrupted = session.scalars(
            select(models.PipelineRun.id).where(models.PipelineRun.status.in_(unfinished))).all()
        if interrupted:
            session.execute(
                update(models.PipelineRun)
                .where(models.PipelineRun.id.in_(interrupted))
                .values(status=RunStatus.FAILED.value, finished_at=_now(),
                        error="Interrupted: the server stopped before this run finished."))
            session.commit()
