from datetime import datetime
from typing import Any

from pydantic import BaseModel

from app.schemas.common import OrmModel


class RootCauseCandidateOut(OrmModel):
    rank: int
    component: str
    root_cause_score: float
    first_occurrence: datetime
    in_cluster_freq: int
    avg_severity: float
    first_occurrence_priority: float
    cooc_centrality: float
    first_occurrence_priority_norm: float
    avg_severity_norm: float
    in_cluster_freq_norm: float
    cooc_centrality_norm: float


class IncidentOut(OrmModel):
    incident_id: int
    n_anomalies: int
    n_distinct_templates: int
    components_involved: list[str]
    start_time: datetime
    end_time: datetime
    top_root_cause: str | None = None


class IncidentDetail(IncidentOut):
    template_counts: dict[str, int]
    root_cause_candidates: list[RootCauseCandidateOut]


class RootCauseCount(BaseModel):
    component: str
    times_ranked_root_cause: int


class CooccurrenceOut(OrmModel):
    component_a: str
    component_b: str
    cooccurrence_count: int


class DriftWindowOut(OrmModel):
    window_start: int
    window_end: int
    ks_stat: float
    p_value: float
    consecutive_low_p: int
    drift_flagged: bool


class DriftSignalOut(BaseModel):
    signal: str
    first_flagged_row: int | None
    control_test: dict[str, float]
    windows: list[DriftWindowOut]


class MetricOut(OrmModel):
    scope: str
    metrics: dict[str, Any]
