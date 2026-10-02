"""Loads the outputs the experiment already wrote to ``data/processed``.

The expensive stages (parsing, features, per-view scoring, fusion, threshold,
drift) are read from disk as the experiment saved them. Root-cause analysis is
cheap and depends on the anomaly flags, so it is recomputed from those flags
to stay consistent with them.
"""
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.pipeline_config import PipelineConfig
from app.pipeline import stages
from app.pipeline.result import DriftSignal, PipelineResult, ViewScores
from app.pipeline.runner import StageCallback

# Stage names reported through on_stage, in execution order.
ARTIFACT_STAGES = ("load_artifacts", "root_cause")

# File names are the ones the experiment scripts in ../engine write.
PARSED_EVENTS = "bgl_parsed.parquet"
STRUCTURAL_FEATURES = "structural_features.parquet"
SPLIT_INDICES = "split_indices.json"
EVIDENCE_SAMPLE = "evidence_sample.json"
DRIFT_FINDINGS = "drift_findings.json"
ARRAYS = {
    "semantic": "semantic_anomaly_scores.npy",
    "structural": "structural_anomaly_scores.npy",
    "temporal": "temporal_anomaly_scores.npy",
    "final": "final_anomaly_scores.npy",
    "weights": "fusion_weights.npy",
    "is_anomaly": "is_anomaly.npy",
    "severity_score": "severity_score.npy",
    "severity_bucket": "severity_bucket.npy",
}
# signal name -> (windows file, key prefix inside drift_findings.json)
DRIFT_SIGNALS = {
    "embedding": ("drift_embedding.parquet", "embedding"),
    "template_frequency": ("drift_frequency.parquet", "template_freq"),
}
EVENT_COLUMNS = ["timestamp", "time", "node", "type", "component", "level",
                 "content", "template_id", "template"]


def _read_json(path: Path) -> Any:
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _load_drift(directory: Path) -> dict[str, DriftSignal]:
    findings_path = directory / DRIFT_FINDINGS
    if not findings_path.exists():
        return {}
    findings = _read_json(findings_path)
    drift = {}
    for signal, (windows_file, prefix) in DRIFT_SIGNALS.items():
        drift[signal] = DriftSignal(
            windows=pd.read_parquet(directory / windows_file),
            first_flagged_row=findings[f"{prefix}_drift_first_flagged_row"],
            control_test=findings[f"{prefix}_control_test"],
        )
    return drift


def load_artifacts(directory: Path, cfg: PipelineConfig, on_stage: StageCallback) -> PipelineResult:
    on_stage("load_artifacts")
    df = pd.read_parquet(directory / PARSED_EVENTS, columns=EVENT_COLUMNS)
    split = _read_json(directory / SPLIT_INDICES)
    train_frequency = pd.read_parquet(
        directory / STRUCTURAL_FEATURES, columns=["template_global_freq"])["template_global_freq"].values
    arrays = {name: np.load(directory / filename) for name, filename in ARRAYS.items()}

    misaligned = {name: len(a) for name, a in arrays.items() if len(a) != len(df)}
    if misaligned or len(train_frequency) != len(df):
        raise ValueError(f"Artifacts are not row-aligned with {PARSED_EVENTS} ({len(df)} rows): {misaligned}")

    templates = stages.template_table(df, train_frequency)
    is_anomaly = arrays["is_anomaly"]

    evidence_path = directory / EVIDENCE_SAMPLE
    evidence = _read_json(evidence_path) if evidence_path.exists() else []
    # Keep only packages for rows the current flags still mark as anomalous.
    evidence = [p for p in evidence if is_anomaly[p["row_index"]]]

    on_stage("root_cause")
    rca = stages.analyse_root_cause(df, is_anomaly, arrays["severity_score"], cfg)

    return PipelineResult(
        events=df,
        templates=templates,
        train_end_idx=split["train_end_idx"],
        val_end_idx=split["val_end_idx"],
        scores=ViewScores(arrays["semantic"], arrays["structural"], arrays["temporal"]),
        weights=arrays["weights"],
        final_scores=arrays["final"],
        is_anomaly=is_anomaly,
        severity_score=arrays["severity_score"],
        severity_bucket=arrays["severity_bucket"],
        drift=_load_drift(directory),
        evidence=evidence,
        rca=rca,
    )
