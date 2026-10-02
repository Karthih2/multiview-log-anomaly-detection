"""Database tables. One pipeline run owns every other row through ``run_id``."""
from datetime import datetime
from enum import Enum
from typing import Any

from sqlalchemy import JSON, ForeignKey, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class RunStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class SourceKind(str, Enum):
    UPLOAD = "upload"        # raw log sent through the API
    FILE = "file"            # raw log read from disk through the CLI
    ARTIFACTS = "artifacts"  # precomputed experiment outputs


# Partial-index predicate, spelled the way each database's planner matches it
# against the `is_anomaly` filter SQLAlchemy emits.
_ANOMALIES_ONLY = {"sqlite_where": text("is_anomaly = 1"), "postgresql_where": text("is_anomaly")}


def _run_fk() -> Mapped[int]:
    return mapped_column(ForeignKey("pipeline_runs.id", ondelete="CASCADE"))


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    source_kind: Mapped[str] = mapped_column(String(20))
    source_path: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=RunStatus.QUEUED.value)
    stage: Mapped[str | None] = mapped_column(String(50))
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime]
    started_at: Mapped[datetime | None]
    finished_at: Mapped[datetime | None]

    # Filled in when the run completes.
    raw_rows: Mapped[int | None]
    total_rows: Mapped[int | None]
    n_templates: Mapped[int | None]
    n_anomalies: Mapped[int | None]
    n_incidents: Mapped[int | None]
    train_end_idx: Mapped[int | None]
    val_end_idx: Mapped[int | None]
    time_start: Mapped[datetime | None]
    time_end: Mapped[datetime | None]
    # Snapshot of the pipeline parameters in effect for this run.
    parameters: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    # [{"stage": name, "started_at": iso timestamp}, ...] in the order stages began.
    stage_log: Mapped[list[dict[str, str]] | None] = mapped_column(JSON)
    # Per-view mean score, mean fusion weight and how often the view dominated a flag.
    view_summary: Mapped[dict[str, dict[str, float]] | None] = mapped_column(JSON)
    # Per view, what its detector was once fitted on this log (model, size, rows used).
    detectors: Mapped[dict[str, dict[str, Any]] | None] = mapped_column(JSON)


class LogEvent(Base):
    """One cleaned log line with everything the pipeline derived for it."""

    __tablename__ = "log_events"
    __table_args__ = (
        UniqueConstraint("run_id", "row_index"),
        # Dashboards only ever aggregate flagged rows, a small share of the table.
        # Each index leads with the column its query groups by, so the database
        # reads groups straight off the index: severity counts and the timeline...
        Index("ix_log_events_anomaly_timeline", "run_id", "severity", "time", **_ANOMALIES_ONLY),
        # ...and per-component risk.
        Index("ix_log_events_anomaly_component", "run_id", "component", "severity_score", **_ANOMALIES_ONLY),
        # ...and flagged lines grouped into kinds (same template and component).
        Index("ix_log_events_anomaly_kind", "run_id", "template_id", "component", "severity",
              "severity_score", **_ANOMALIES_ONLY),
        # Serves "most severe first" listings without a sort.
        Index(
            "ix_log_events_anomaly_rank",
            "run_id", text("severity_score DESC"), "row_index", **_ANOMALIES_ONLY,
        ),
        Index(
            "ix_log_events_incident", "run_id", "incident_id",
            sqlite_where=text("incident_id IS NOT NULL"),
            postgresql_where=text("incident_id IS NOT NULL"),
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    row_index: Mapped[int]

    timestamp: Mapped[int | None]
    time: Mapped[datetime]
    node: Mapped[str | None] = mapped_column(String(128))
    type: Mapped[str | None] = mapped_column(String(64))
    component: Mapped[str | None] = mapped_column(String(64))
    level: Mapped[str | None] = mapped_column(String(32))
    content: Mapped[str] = mapped_column(Text)
    template_id: Mapped[int]

    semantic_score: Mapped[float]
    structural_score: Mapped[float]
    temporal_score: Mapped[float]
    semantic_weight: Mapped[float]
    structural_weight: Mapped[float]
    temporal_weight: Mapped[float]
    final_score: Mapped[float]
    threshold: Mapped[float | None]
    is_anomaly: Mapped[bool]
    severity_score: Mapped[float]
    severity: Mapped[str] = mapped_column(String(16))
    incident_id: Mapped[int | None]


class Template(Base):
    __tablename__ = "templates"
    __table_args__ = (UniqueConstraint("run_id", "template_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    template_id: Mapped[int]
    template: Mapped[str] = mapped_column(Text)
    occurrences: Mapped[int]
    train_frequency: Mapped[int]


class Incident(Base):
    __tablename__ = "incidents"
    __table_args__ = (UniqueConstraint("run_id", "incident_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    incident_id: Mapped[int]
    n_anomalies: Mapped[int]
    n_distinct_templates: Mapped[int]
    template_counts: Mapped[dict[str, int]] = mapped_column(JSON)
    components_involved: Mapped[list[str]] = mapped_column(JSON)
    start_time: Mapped[datetime]
    end_time: Mapped[datetime]


class RootCauseCandidate(Base):
    __tablename__ = "root_cause_candidates"
    __table_args__ = (Index("ix_root_cause_incident", "run_id", "incident_id", "rank"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    incident_id: Mapped[int]
    rank: Mapped[int]
    component: Mapped[str] = mapped_column(String(64))
    root_cause_score: Mapped[float]
    first_occurrence: Mapped[datetime]
    in_cluster_freq: Mapped[int]
    avg_severity: Mapped[float]
    first_occurrence_priority: Mapped[float]
    cooc_centrality: Mapped[float]
    first_occurrence_priority_norm: Mapped[float]
    avg_severity_norm: Mapped[float]
    in_cluster_freq_norm: Mapped[float]
    cooc_centrality_norm: Mapped[float]


class ComponentCooccurrence(Base):
    __tablename__ = "component_cooccurrence"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    component_a: Mapped[str] = mapped_column(String(64))
    component_b: Mapped[str] = mapped_column(String(64))
    cooccurrence_count: Mapped[int]


class DriftSummary(Base):
    __tablename__ = "drift_summaries"
    __table_args__ = (UniqueConstraint("run_id", "signal"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    signal: Mapped[str] = mapped_column(String(32))
    first_flagged_row: Mapped[int | None]
    # Random-shuffle control test on the reference period (see engine/detection/drift.py).
    control_test: Mapped[dict[str, float]] = mapped_column(JSON)


class DriftWindow(Base):
    __tablename__ = "drift_windows"
    __table_args__ = (Index("ix_drift_windows_signal", "run_id", "signal", "window_start"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    signal: Mapped[str] = mapped_column(String(32))
    window_start: Mapped[int]
    window_end: Mapped[int]
    ks_stat: Mapped[float]
    p_value: Mapped[float]
    consecutive_low_p: Mapped[int]
    drift_flagged: Mapped[bool]


class EvidencePackage(Base):
    __tablename__ = "evidence_packages"
    __table_args__ = (UniqueConstraint("run_id", "row_index"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = _run_fk()
    row_index: Mapped[int]
    dominant_view: Mapped[str] = mapped_column(String(32))
    package: Mapped[dict[str, Any]] = mapped_column(JSON)



# Tables holding per-run rows, in an order that is safe to bulk-delete.
RUN_CHILD_TABLES = (
    LogEvent, Template, Incident, RootCauseCandidate, ComponentCooccurrence,
    DriftSummary, DriftWindow, EvidencePackage,
)
