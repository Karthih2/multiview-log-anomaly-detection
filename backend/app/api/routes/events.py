"""Anomaly timeline, per-component risk, flagged events, evidence and templates."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import case, func, select

from app.api.deps import CompletedRun, DbSession, Paging
from app.db.models import EvidencePackage, LogEvent, Template
from app.schemas.common import Page
from app.schemas.events import (AnomalyKind, ComponentRisk, EventDetail, EventOut, EvidenceOut,
                                ScoreBucket, TemplateOut, TimeBucket, TimelinePoint)

router = APIRouter(prefix="/runs/{run_id}", tags=["events"])


def _anomalies(run_id: int):
    return (LogEvent.run_id == run_id, LogEvent.is_anomaly)


def _time_bucket(db: DbSession, bucket: TimeBucket):
    """SQL expression that truncates an event's time to the start of its day or hour."""
    if bucket is TimeBucket.DAY:
        return func.date(LogEvent.time)
    if db.get_bind().dialect.name == "sqlite":
        return func.strftime("%Y-%m-%d %H:00", LogEvent.time)
    return func.to_char(LogEvent.time, "YYYY-MM-DD HH24:00")


@router.get("/timeline", response_model=list[TimelinePoint])
def anomaly_timeline(run: CompletedRun, db: DbSession, bucket: TimeBucket = TimeBucket.DAY):
    """Flagged anomalies per day (or per hour, for short logs) and severity."""
    day = _time_bucket(db, bucket)
    # Grouped severity-first to follow ix_log_events_anomaly_timeline; the few
    # hundred resulting rows are put in date order here instead of in SQL.
    rows = db.execute(
        select(day, LogEvent.severity, func.count())
        .where(*_anomalies(run.id))
        .group_by(LogEvent.severity, day)).all()
    points = [TimelinePoint(date=str(d), severity=severity, count=count) for d, severity, count in rows]
    return sorted(points, key=lambda point: (point.date, point.severity))


# A finished run never changes, so its slices are computed once per process.
_SCORE_CACHE: dict[tuple[int, int], list[ScoreBucket]] = {}


@router.get("/score-timeline", response_model=list[ScoreBucket])
def score_timeline(run: CompletedRun, db: DbSession, points: int = 120):
    """The log cut into equal slices by line order (lines are time-sorted): worst fused
    score, mean cutoff and flagged count per slice, for the headline score chart."""
    points = max(10, min(points, 400))
    if (run.id, points) in _SCORE_CACHE:
        return _SCORE_CACHE[run.id, points]
    total = run.total_rows or 1
    slot = (LogEvent.row_index * points // total).label("slot")
    rows = db.execute(
        select(slot, func.min(LogEvent.row_index), func.min(LogEvent.time), func.max(LogEvent.final_score),
               func.avg(LogEvent.threshold), func.sum(case((LogEvent.is_anomaly, 1), else_=0)))
        .where(LogEvent.run_id == run.id).group_by(slot).order_by(slot)).all()
    buckets = [ScoreBucket(row_start=start, time=time, max_score=top, mean_threshold=cut, n_anomalies=int(n or 0))
               for _, start, time, top, cut, n in rows]
    _SCORE_CACHE[run.id, points] = buckets
    return buckets


# Typical normal-line score per view, once per finished run.
_BASELINE_CACHE: dict[int, dict[str, float]] = {}


@router.get("/baseline", response_model=dict[str, float])
def view_baseline(run: CompletedRun, db: DbSession):
    """Average score of each view over the lines that were not flagged: the reference point
    the Shapley attribution of a flagged line is measured against."""
    if run.id not in _BASELINE_CACHE:
        row = db.execute(
            select(func.avg(LogEvent.semantic_score), func.avg(LogEvent.structural_score),
                   func.avg(LogEvent.temporal_score))
            .where(LogEvent.run_id == run.id, LogEvent.is_anomaly.is_(False))).one()
        if row[0] is None:  # every line was flagged: fall back to all lines
            row = db.execute(
                select(func.avg(LogEvent.semantic_score), func.avg(LogEvent.structural_score),
                       func.avg(LogEvent.temporal_score)).where(LogEvent.run_id == run.id)).one()
        _BASELINE_CACHE[run.id] = dict(zip(("semantic", "structural", "temporal"), (float(v or 0) for v in row)))
    return _BASELINE_CACHE[run.id]


@router.get("/components", response_model=list[ComponentRisk])
def component_risk(run: CompletedRun, db: DbSession):
    """Anomaly count and mean severity score per component, busiest first."""
    count = func.count()
    rows = db.execute(
        select(LogEvent.component, count, func.avg(LogEvent.severity_score))
        .where(*_anomalies(run.id))
        .group_by(LogEvent.component)
        .order_by(count.desc())).all()
    return [ComponentRisk(component=c, anomaly_count=n, avg_severity_score=avg) for c, n, avg in rows]


@router.get("/anomalies", response_model=Page[EventOut])
def list_anomalies(run: CompletedRun, db: DbSession, paging: Paging,
                   severity: str | None = None, component: str | None = None,
                   incident_id: int | None = None):
    """Flagged events, most severe first."""
    filters = list(_anomalies(run.id))
    if severity is not None:
        filters.append(LogEvent.severity == severity)
    if component is not None:
        filters.append(LogEvent.component == component)
    if incident_id is not None:
        filters.append(LogEvent.incident_id == incident_id)

    total = db.scalar(select(func.count()).select_from(LogEvent).where(*filters))
    items = db.scalars(
        select(LogEvent).where(*filters)
        .order_by(LogEvent.severity_score.desc(), LogEvent.row_index)
        .limit(paging.limit).offset(paging.offset)).all()
    return Page(items=items, total=total, limit=paging.limit, offset=paging.offset)


@router.get("/anomaly-kinds", response_model=Page[AnomalyKind])
def list_anomaly_kinds(run: CompletedRun, db: DbSession, paging: Paging,
                       severity: str | None = None, component: str | None = None,
                       incident_id: int | None = None):
    """Flagged events grouped by template and component, most severe kind first.
    Each kind carries its line count and its single most severe line."""
    filters = list(_anomalies(run.id))
    if severity is not None:
        filters.append(LogEvent.severity == severity)
    if component is not None:
        filters.append(LogEvent.component == component)
    if incident_id is not None:
        filters.append(LogEvent.incident_id == incident_id)

    worst = func.max(LogEvent.severity_score)
    kinds = (select(LogEvent.template_id, LogEvent.component, func.count().label("lines"), worst.label("worst"))
             .where(*filters).group_by(LogEvent.template_id, LogEvent.component))
    total = db.scalar(select(func.count()).select_from(kinds.subquery()))
    rows = db.execute(
        kinds.order_by(worst.desc(), LogEvent.template_id).limit(paging.limit).offset(paging.offset)).all()

    items = []
    for template_id, kind_component, lines, _ in rows:
        same_component = (LogEvent.component.is_(None) if kind_component is None
                          else LogEvent.component == kind_component)
        event = db.scalars(
            select(LogEvent).where(*filters, LogEvent.template_id == template_id, same_component)
            .order_by(LogEvent.severity_score.desc(), LogEvent.row_index).limit(1)).one()
        items.append(AnomalyKind(lines=lines, event=event))
    return Page(items=items, total=total, limit=paging.limit, offset=paging.offset)


@router.get("/events/{row_index}", response_model=EventDetail)
def get_event(row_index: int, run: CompletedRun, db: DbSession):
    """One log line with its template and, if one was built, its evidence package."""
    event = db.scalar(select(LogEvent).where(LogEvent.run_id == run.id, LogEvent.row_index == row_index))
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Event {row_index} not found in run {run.id}")
    template = db.scalar(
        select(Template.template).where(Template.run_id == run.id, Template.template_id == event.template_id))
    evidence = db.scalar(
        select(EvidencePackage).where(EvidencePackage.run_id == run.id, EvidencePackage.row_index == row_index))
    detail = EventOut.model_validate(event).model_dump()
    return EventDetail(**detail, template=template, evidence=evidence)


@router.get("/evidence", response_model=Page[EvidenceOut])
def list_evidence(run: CompletedRun, db: DbSession, paging: Paging):
    filters = (EvidencePackage.run_id == run.id,)
    total = db.scalar(select(func.count()).select_from(EvidencePackage).where(*filters))
    items = db.scalars(
        select(EvidencePackage).where(*filters).order_by(EvidencePackage.id)
        .limit(paging.limit).offset(paging.offset)).all()
    return Page(items=items, total=total, limit=paging.limit, offset=paging.offset)


@router.get("/templates", response_model=Page[TemplateOut])
def list_templates(run: CompletedRun, db: DbSession, paging: Paging):
    """Mined templates, most frequent first."""
    filters = (Template.run_id == run.id,)
    total = db.scalar(select(func.count()).select_from(Template).where(*filters))
    items = db.scalars(
        select(Template).where(*filters).order_by(Template.occurrences.desc())
        .limit(paging.limit).offset(paging.offset)).all()
    return Page(items=items, total=total, limit=paging.limit, offset=paging.offset)
