"""Incidents, root-cause candidates, co-occurrence, and drift."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import CompletedRun, DbSession, Paging
from app.db.models import (ComponentCooccurrence, DriftSummary, DriftWindow,
                           Incident, LogEvent, RootCauseCandidate)
from app.schemas.analysis import (ClusterIncident, CooccurrenceOut, RootCauseCluster, DriftSignalOut, IncidentDetail,
                                  IncidentOut, RootCauseCount)
from app.schemas.common import Page

router = APIRouter(prefix="/runs/{run_id}", tags=["analysis"])

TOP_RANK = 1
SEVERITY_ORDER = ("LOW", "MEDIUM", "HIGH", "CRITICAL")


def _peak_severities(db, run_id: int, incident_ids: list[int]) -> dict[int, str]:
    """The most severe level among each incident's flagged lines."""
    rows = db.execute(
        select(LogEvent.incident_id, LogEvent.severity)
        .where(LogEvent.run_id == run_id, LogEvent.is_anomaly, LogEvent.incident_id.in_(incident_ids))
        .group_by(LogEvent.incident_id, LogEvent.severity)).all()
    peak: dict[int, str] = {}
    for incident_id, severity in rows:
        if severity in SEVERITY_ORDER and (
                incident_id not in peak or SEVERITY_ORDER.index(severity) > SEVERITY_ORDER.index(peak[incident_id])):
            peak[incident_id] = severity
    return peak


def _top_candidates(run_id: int):
    return (RootCauseCandidate.run_id == run_id, RootCauseCandidate.rank == TOP_RANK)


@router.get("/incidents", response_model=Page[IncidentOut])
def list_incidents(run: CompletedRun, db: DbSession, paging: Paging):
    """Incident cards, largest first, each with its top-ranked root-cause candidate."""
    total = db.scalar(select(func.count()).select_from(Incident).where(Incident.run_id == run.id))
    incidents = db.scalars(
        select(Incident).where(Incident.run_id == run.id)
        .order_by(Incident.n_anomalies.desc(), Incident.incident_id)
        .limit(paging.limit).offset(paging.offset)).all()
    top = dict(db.execute(
        select(RootCauseCandidate.incident_id, RootCauseCandidate.component)
        .where(*_top_candidates(run.id),
               RootCauseCandidate.incident_id.in_([i.incident_id for i in incidents]))).all())
    peak = _peak_severities(db, run.id, [i.incident_id for i in incidents])
    items = [
        IncidentOut.model_validate(incident).model_copy(
            update={"top_root_cause": top.get(incident.incident_id),
                    "peak_severity": peak.get(incident.incident_id)})
        for incident in incidents
    ]
    return Page(items=items, total=total, limit=paging.limit, offset=paging.offset)


@router.get("/incidents/{incident_id}", response_model=IncidentDetail)
def get_incident(incident_id: int, run: CompletedRun, db: DbSession):
    incident = db.scalar(
        select(Incident).where(Incident.run_id == run.id, Incident.incident_id == incident_id))
    if incident is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Incident {incident_id} not found in run {run.id}")
    candidates = db.scalars(
        select(RootCauseCandidate)
        .where(RootCauseCandidate.run_id == run.id, RootCauseCandidate.incident_id == incident_id)
        .order_by(RootCauseCandidate.rank)).all()
    return IncidentDetail(
        **IncidentOut.model_validate(incident).model_dump(exclude={"top_root_cause", "peak_severity"}),
        top_root_cause=candidates[0].component if candidates else None,
        peak_severity=_peak_severities(db, run.id, [incident_id]).get(incident_id),
        template_counts=incident.template_counts,
        root_cause_candidates=candidates,
    )


@router.get("/root-causes", response_model=list[RootCauseCount])
def root_cause_summary(run: CompletedRun, db: DbSession):
    """How often each component was ranked the most likely root cause of an incident."""
    count = func.count()
    rows = db.execute(
        select(RootCauseCandidate.component, count)
        .where(*_top_candidates(run.id))
        .group_by(RootCauseCandidate.component)
        .order_by(count.desc())).all()
    return [RootCauseCount(component=c, times_ranked_root_cause=n) for c, n in rows]


@router.get("/root-cause-clusters", response_model=list[RootCauseCluster])
def root_cause_clusters(run: CompletedRun, db: DbSession, members: int = 8):
    """Incidents grouped by their most likely root-cause component, largest cluster first."""
    rows = db.execute(
        select(RootCauseCandidate, Incident)
        .join(Incident, (Incident.run_id == RootCauseCandidate.run_id)
              & (Incident.incident_id == RootCauseCandidate.incident_id))
        .where(*_top_candidates(run.id))).all()
    groups: dict[str, list] = {}
    for candidate, incident in rows:
        groups.setdefault(candidate.component, []).append((candidate, incident))
    clusters = []
    for component, pairs in groups.items():
        incidents = sorted((i for _, i in pairs), key=lambda i: (-i.n_anomalies, i.incident_id))
        together: dict[str, int] = {}
        for incident in incidents:
            for other in incident.components_involved:
                if other != component:
                    together[other] = together.get(other, 0) + 1
        clusters.append(RootCauseCluster(
            component=component,
            n_incidents=len(incidents),
            n_anomalies=sum(i.n_anomalies for i in incidents),
            avg_root_cause_score=sum(c.root_cause_score for c, _ in pairs) / len(pairs),
            avg_severity=sum(c.avg_severity for c, _ in pairs) / len(pairs),
            first_time=min(i.start_time for i in incidents),
            last_time=max(i.end_time for i in incidents),
            co_components=[name for name, _ in sorted(together.items(), key=lambda kv: (-kv[1], kv[0]))[:4]],
            incidents=[ClusterIncident(incident_id=i.incident_id, start_time=i.start_time, n_anomalies=i.n_anomalies)
                       for i in incidents[:members]],
        ))
    return sorted(clusters, key=lambda c: (-c.n_incidents, -c.n_anomalies, c.component))


@router.get("/cooccurrence", response_model=list[CooccurrenceOut])
def component_cooccurrence(run: CompletedRun, db: DbSession):
    return db.scalars(
        select(ComponentCooccurrence).where(ComponentCooccurrence.run_id == run.id)
        .order_by(ComponentCooccurrence.cooccurrence_count.desc())).all()


@router.get("/drift", response_model=list[DriftSignalOut])
def drift(run: CompletedRun, db: DbSession):
    """KS drift windows per signal, with the control test on the reference period."""
    summaries = db.scalars(
        select(DriftSummary).where(DriftSummary.run_id == run.id).order_by(DriftSummary.signal)).all()
    signals = []
    for summary in summaries:
        windows = db.scalars(
            select(DriftWindow)
            .where(DriftWindow.run_id == run.id, DriftWindow.signal == summary.signal)
            .order_by(DriftWindow.window_start)).all()
        flagged_time = None
        if summary.first_flagged_row is not None:
            flagged_time = db.scalar(select(LogEvent.time).where(
                LogEvent.run_id == run.id, LogEvent.row_index == summary.first_flagged_row))
        signals.append(DriftSignalOut(
            signal=summary.signal, first_flagged_row=summary.first_flagged_row,
            first_flagged_time=flagged_time,
            control_test=summary.control_test, windows=windows))
    return signals

