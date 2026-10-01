"""Writes a PipelineResult to the database."""
import numpy as np
import pandas as pd
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db import models
from app.pipeline.experiment import view_names
from app.pipeline.result import PipelineResult

EVENT_SOURCE_COLUMNS = ["label", "timestamp", "time", "node", "type", "component",
                        "level", "content", "template_id"]


def _bulk_insert(session: Session, table, frame: pd.DataFrame, run_id: int) -> None:
    if frame.empty:
        return
    chunk_rows = get_settings().db_insert_chunk_rows
    for start in range(0, len(frame), chunk_rows):
        chunk = frame.iloc[start:start + chunk_rows]
        # Missing values (NaN / NA) must reach the database as NULL.
        chunk = chunk.astype(object).where(chunk.notna(), None)
        records = chunk.to_dict("records")
        for record in records:
            record["run_id"] = run_id
        session.execute(insert(table), records)


def _event_frame(result: PipelineResult) -> pd.DataFrame:
    frame = result.events[EVENT_SOURCE_COLUMNS].copy()
    frame.insert(0, "row_index", range(len(frame)))
    frame["semantic_score"] = result.scores.semantic
    frame["structural_score"] = result.scores.structural
    frame["temporal_score"] = result.scores.temporal
    frame["semantic_weight"] = result.weights[:, 0]
    frame["structural_weight"] = result.weights[:, 1]
    frame["temporal_weight"] = result.weights[:, 2]
    frame["final_score"] = result.final_scores
    frame["threshold"] = result.threshold
    frame["is_anomaly"] = result.is_anomaly
    frame["severity_score"] = result.severity_score
    frame["severity"] = result.severity_bucket
    frame["incident_id"] = None
    if result.rca is not None:
        frame.loc[result.rca.incident_ids.index, "incident_id"] = result.rca.incident_ids.values
    return frame


def summarise_views(scores: np.ndarray, weights: np.ndarray, is_anomaly: np.ndarray) -> dict[str, dict[str, float]]:
    """Per view: mean score and mean fusion weight (all rows and flagged rows), and
    how many flags it dominated. Dominance is score x weight, the same rule
    engine/evidence.py uses for `dominant_contributing_view`. Arrays are (n_rows, n_views)."""
    flagged_scores, flagged_weights = scores[is_anomaly], weights[is_anomaly]
    dominant = np.bincount(
        (flagged_scores * flagged_weights).argmax(axis=1), minlength=scores.shape[1]
    ) if len(flagged_scores) else np.zeros(scores.shape[1], dtype=int)

    def mean(values: np.ndarray, column: int) -> float | None:
        return float(values[:, column].mean()) if len(values) else None

    return {
        view: {
            "mean_score": mean(scores, i),
            "mean_score_flagged": mean(flagged_scores, i),
            "mean_weight": mean(weights, i),
            "mean_weight_flagged": mean(flagged_weights, i),
            "dominant_flags": int(dominant[i]),
        }
        for i, view in enumerate(view_names())
    }


def save_result(session: Session, run: models.PipelineRun, result: PipelineResult) -> None:
    _bulk_insert(session, models.LogEvent, _event_frame(result), run.id)
    _bulk_insert(session, models.Template, result.templates, run.id)

    for signal, drift in result.drift.items():
        session.add(models.DriftSummary(
            run_id=run.id, signal=signal,
            first_flagged_row=drift.first_flagged_row, control_test=drift.control_test,
        ))
        _bulk_insert(session, models.DriftWindow, drift.windows.assign(signal=signal), run.id)

    session.add_all(
        models.EvidencePackage(
            run_id=run.id, row_index=package["row_index"],
            dominant_view=package["dominant_contributing_view"], package=package,
        )
        for package in result.evidence
    )
    session.add_all(
        models.EvaluationMetric(run_id=run.id, scope=scope, metrics=metrics)
        for scope, metrics in result.metrics.items()
    )

    n_incidents = 0
    if result.rca is not None:
        signatures = result.rca.signatures.copy()
        n_incidents = len(signatures)
        for column in ("start_time", "end_time"):
            signatures[column] = pd.to_datetime(signatures[column])
        _bulk_insert(session, models.Incident, signatures, run.id)
        _bulk_insert(session, models.RootCauseCandidate, result.rca.rankings, run.id)
        _bulk_insert(session, models.ComponentCooccurrence, result.rca.cooccurrence, run.id)

    view_scores = np.stack(
        [result.scores.semantic, result.scores.structural, result.scores.temporal], axis=1)
    run.view_summary = summarise_views(view_scores, result.weights, result.is_anomaly)
    run.detectors = result.detectors
    run.raw_rows = result.raw_rows
    run.total_rows = len(result.events)
    run.n_templates = len(result.templates)
    run.n_anomalies = int(result.is_anomaly.sum())
    run.n_incidents = n_incidents
    run.train_end_idx = result.train_end_idx
    run.val_end_idx = result.val_end_idx
    run.time_start = result.events["time"].min().to_pydatetime()
    run.time_end = result.events["time"].max().to_pydatetime()
