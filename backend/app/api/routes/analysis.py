"""Incidents, root-cause candidates, co-occurrence, and drift."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.deps import CompletedRun, DbSession, Paging
from app.db.models import (ComponentCooccurrence, DriftSummary, DriftWindow,
                           Incident, RootCauseCandidate)
from app.schemas.analysis import (CooccurrenceOut, DriftSignalOut, IncidentDetail,
                                  IncidentOut, RootCauseCount)
from app.schemas.common import Page

router = APIRouter(prefix="/runs/{run_id}", tags=["analysis"])

TOP_RANK = 1


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
    items = [
        IncidentOut.model_validate(incident).model_copy(
            update={"top_root_cause": top.get(incident.incident_id)})
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
        **IncidentOut.model_validate(incident).model_dump(exclude={"top_root_cause"}),
        top_root_cause=candidates[0].component if candidates else None,
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
        signals.append(DriftSignalOut(
            signal=summary.signal, first_flagged_row=summary.first_flagged_row,
            control_test=summary.control_test, windows=windows))
    return signals

