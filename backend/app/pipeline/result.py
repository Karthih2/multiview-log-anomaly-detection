"""In-memory outcome of a pipeline run, before it is written to the database."""
from dataclasses import dataclass, field
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class ViewScores:
    """Per-row anomaly scores, one array per view, in the experiment's view order."""
    semantic: np.ndarray
    structural: np.ndarray
    temporal: np.ndarray


@dataclass
class DriftSignal:
    windows: pd.DataFrame
    first_flagged_row: int | None
    control_test: dict[str, float]


@dataclass
class RootCauseAnalysis:
    incident_ids: pd.Series          # index = event row index, value = incident id
    signatures: pd.DataFrame
    cooccurrence: pd.DataFrame
    rankings: pd.DataFrame


@dataclass
class PipelineResult:
    events: pd.DataFrame             # cleaned + parsed log lines, chronological, RangeIndex
    templates: pd.DataFrame          # template_id, template, occurrences, train_frequency
    train_end_idx: int
    val_end_idx: int
    scores: ViewScores
    weights: np.ndarray              # shape (n_rows, 3)
    final_scores: np.ndarray
    is_anomaly: np.ndarray
    severity_score: np.ndarray
    severity_bucket: np.ndarray
    threshold: np.ndarray | None = None
    raw_rows: int | None = None
    # Facts read off each view's fitted detector; None when results were imported.
    detectors: dict[str, dict[str, Any]] | None = None
    drift: dict[str, DriftSignal] = field(default_factory=dict)
    evidence: list[dict[str, Any]] = field(default_factory=list)
    rca: RootCauseAnalysis | None = None
    metrics: dict[str, dict[str, Any]] = field(default_factory=dict)
