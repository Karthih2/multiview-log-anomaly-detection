from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel

from app.schemas.common import OrmModel


class EventOut(OrmModel):
    row_index: int
    time: datetime
    node: str | None
    type: str | None
    component: str | None
    level: str | None
    content: str
    template_id: int
    semantic_score: float
    structural_score: float
    temporal_score: float
    semantic_weight: float
    structural_weight: float
    temporal_weight: float
    final_score: float
    threshold: float | None
    is_anomaly: bool
    severity_score: float
    severity: str
    incident_id: int | None


class AnomalyKind(BaseModel):
    """Flagged lines sharing a template and component."""
    lines: int
    # The most severe line of the kind.
    event: EventOut


class EvidenceOut(OrmModel):
    row_index: int
    dominant_view: str
    package: dict[str, Any]


class EventDetail(EventOut):
    template: str | None
    evidence: EvidenceOut | None


class TimeBucket(str, Enum):
    DAY = "day"
    HOUR = "hour"


class TimelinePoint(BaseModel):
    # Start of the bucket: "YYYY-MM-DD" for days, "YYYY-MM-DD HH:00" for hours.
    date: str
    severity: str
    count: int


class ComponentRisk(BaseModel):
    component: str | None
    anomaly_count: int
    avg_severity_score: float


class TemplateOut(OrmModel):
    template_id: int
    template: str
    occurrences: int
    train_frequency: int
