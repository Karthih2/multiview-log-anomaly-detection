from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.common import OrmModel


class RunOut(OrmModel):
    id: int
    name: str
    source_kind: str
    status: str
    stage: str | None
    error: str | None
    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None
    raw_rows: int | None
    total_rows: int | None
    n_templates: int | None
    n_anomalies: int | None
    n_incidents: int | None
    train_end_idx: int | None
    val_end_idx: int | None
    time_start: datetime | None
    time_end: datetime | None


class StageEntry(BaseModel):
    stage: str
    started_at: datetime


class RunDetail(RunOut):
    parameters: dict[str, Any] | None
    # Every stage this run goes through, in order; stage_log holds the ones begun so far.
    planned_stages: list[str]
    stage_log: list[StageEntry] | None
    view_summary: dict[str, dict[str, float | None]] | None
    detectors: dict[str, dict[str, Any]] | None


class RunSummary(BaseModel):
    """Headline numbers for the dashboard header."""
    run_id: int
    total_rows: int
    n_anomalies: int
    anomaly_rate: float
    n_incidents: int
    n_templates: int
    time_start: datetime
    time_end: datetime
    severity_counts: dict[str, int]
    test_metrics: dict[str, Any] | None
