"""Pipeline stages.

Every stage calls the experiment functions in ``../engine`` unchanged. Where the
experiment only wired functions together inside an ``if __name__ ==
"__main__"`` block, that wiring is reproduced here step for step and the
source file is named in the docstring.
"""
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from app.core.pipeline_config import PipelineConfig
from app.pipeline.experiment import fn, section_fn
from app.pipeline.result import DriftSignal, RootCauseAnalysis, ViewScores

# Guards a zero range in min-max scaling; same value the experiment uses inline.
_RANGE_EPSILON = 1e-9
COOCCURRENCE_COLUMNS = ["component_a", "component_b", "cooccurrence_count"]


def _min_max(values: np.ndarray) -> np.ndarray:
    return (values - values.min()) / (values.max() - values.min() + _RANGE_EPSILON)


def ingest(path: Path) -> tuple[pd.DataFrame, int]:
    """engine/ingest.py: raw file -> cleaned, chronologically sorted frame."""
    raw = fn("engine.ingest:load_bgl")(str(path))
    df = fn("engine.ingest:clean")(raw)
    if df.empty:
        raise ValueError("No valid log lines found; the file does not match the expected log format.")
    return df, len(raw)


def parse(df: pd.DataFrame) -> pd.DataFrame:
    """engine/parse.py: Drain3 template mining."""
    return fn("engine.parse:parse_logs")(df)


def split(df: pd.DataFrame, cfg: PipelineConfig) -> tuple[int, int]:
    """engine/detection/split.py: chronological train/val/test boundaries."""
    train, val, _ = section_fn("split")(df, **cfg.overrides("split"))
    return len(train), len(train) + len(val)


def template_table(df: pd.DataFrame, train_frequency: np.ndarray) -> pd.DataFrame:
    """One row per template_id, using the last (most generalised) template text,
    the same choice engine/features/semantic.py makes before embedding."""
    grouped = df.groupby("template_id")
    table = pd.DataFrame({
        "template": grouped["template"].last(),
        "occurrences": grouped.size(),
        "train_frequency": pd.Series(train_frequency, index=df.index).groupby(df["template_id"]).first(),
    })
    return table.reset_index()


def build_features(df: pd.DataFrame, train_end_idx: int, cfg: PipelineConfig):
    """engine/features/*: the three views."""
    embeddings = section_fn("semantic_features")(df, **cfg.overrides("semantic_features"))
    structural = fn("engine.features.structural:build_structural_features")(df, train_end_idx=train_end_idx)
    temporal = section_fn("temporal_features")(df, **cfg.overrides("temporal_features"))
    return embeddings, structural, temporal


def score_semantic(embeddings: np.ndarray, train_end_idx: int, cfg: PipelineConfig):
    """engine/detection/semantic_scoring.py. Returns the scores and the fitted prototypes."""
    kmeans = section_fn("semantic_scoring")(embeddings[:train_end_idx], **cfg.overrides("semantic_scoring"))
    scores = fn("engine.detection.semantic_scoring:semantic_anomaly_score")(embeddings, kmeans)
    return scores, kmeans


def score_structural(structural: pd.DataFrame, train_end_idx: int, cfg: PipelineConfig):
    """engine/detection/structural_scoring.py. Returns the scores and both fitted detectors."""
    encode = fn("engine.detection.structural_scoring:encode_structural")
    x_train, encoder = encode(structural.iloc[:train_end_idx], fit=True)
    x_full, _ = encode(structural, encoder=encoder, fit=False)
    iso, lof = section_fn("structural_scoring")(x_train, **cfg.overrides("structural_scoring"))
    return fn("engine.detection.structural_scoring:structural_anomaly_score")(x_full, iso, lof), iso, lof


def score_temporal(df: pd.DataFrame, temporal: pd.DataFrame, train_end_idx: int,
                   cfg: PipelineConfig):
    """engine/detection/temporal_scoring.py (__main__ wiring): HMM sequence score
    and rolling z-score of event frequency, each min-max scaled, then averaged.
    Returns the scores and the fitted HMM."""
    unique_ids = np.unique(df["template_id"].values)
    id_map = {tid: i for i, tid in enumerate(unique_ids)}
    mapped_ids = df["template_id"].map(id_map).values

    model = section_fn("temporal_hmm")(mapped_ids[:train_end_idx], **cfg.overrides("temporal_hmm"))
    seq_scores = section_fn("temporal_sequence")(mapped_ids, model, **cfg.overrides("temporal_sequence"))
    seq_scores = np.nan_to_num(seq_scores, nan=0.0, posinf=0.0, neginf=0.0)
    freq_z = section_fn("temporal_frequency")(temporal["rolling_freq"], **cfg.overrides("temporal_frequency"))

    return (_min_max(seq_scores) + _min_max(np.abs(freq_z))) / 2, model


def describe_detectors(df: pd.DataFrame, embeddings: np.ndarray, train_end_idx: int,
                       kmeans, iso, lof, hmm_model) -> dict[str, dict[str, Any]]:
    """What each view's detector actually was once fitted on this log. Every value
    is read off the fitted object or the data, so the record cannot drift from the run."""
    similarity = fn("engine.detection.semantic_scoring:cosine_similarity")
    frequency = section_fn("temporal_frequency")
    return {
        "semantic": {
            "templates_embedded": int(df["template_id"].nunique()),
            "embedding_dimensions": int(embeddings.shape[1]),
            "prototype_model": type(kmeans).__name__,
            "prototypes": int(kmeans.n_clusters),
            "distance": similarity.__name__,
            "fitted_on_rows": int(train_end_idx),
        },
        "structural": {
            "global_model": type(iso).__name__,
            "trees": len(iso.estimators_),
            "local_model": type(lof).__name__,
            "neighbours": int(lof.n_neighbors_),
            "local_model_fitted_on_rows": int(lof.n_samples_fit_),
            "encoded_features": int(iso.n_features_in_),
            "fitted_on_rows": int(train_end_idx),
        },
        "temporal": {
            "sequence_model": type(hmm_model).__name__,
            "hidden_states": int(hmm_model.n_components),
            "distinct_templates_in_training": int(hmm_model.n_features),
            "training_iterations": int(hmm_model.monitor_.iter),
            "frequency_signal": frequency.__name__,
            "fitted_on_rows": int(train_end_idx),
        },
    }


def fuse(scores: ViewScores, embeddings: np.ndarray, kmeans, structural: pd.DataFrame,
         temporal: pd.DataFrame, cfg: PipelineConfig) -> tuple[np.ndarray, np.ndarray]:
    """engine/detection/reliability.py (__main__ wiring): reliability -> softmax
    weights -> static quality multiplier -> weighted sum. Reuses the prototypes
    fitted for semantic scoring instead of refitting an identical KMeans."""
    sem_rel = section_fn("reliability_semantic")(
        embeddings, kmeans.cluster_centers_, **cfg.overrides("reliability_semantic"))
    struct_rel = fn("engine.detection.reliability:structural_reliability")(structural)
    temp_rel = section_fn("reliability_temporal")(temporal, **cfg.overrides("reliability_temporal"))

    reliabilities = np.stack([sem_rel, struct_rel, temp_rel], axis=1)
    weights = fn("engine.detection.reliability:softmax_weights")(reliabilities)
    weights = fn("engine.detection.reliability:apply_quality_multiplier")(weights)

    stacked = np.stack([scores.semantic, scores.structural, scores.temporal], axis=1)
    return fn("engine.detection.reliability:fuse_scores")(stacked, weights), weights


def threshold_and_severity(final_scores: np.ndarray, temporal: pd.DataFrame,
                           structural: pd.DataFrame, cfg: PipelineConfig):
    """engine/detection/threshold.py: rolling MAD threshold, then severity."""
    threshold, is_anomaly = section_fn("threshold")(final_scores, **cfg.overrides("threshold"))
    severity_score, severity_bucket = fn("engine.detection.threshold:compute_severity")(
        final_scores, is_anomaly, temporal, structural)
    return threshold, is_anomaly, severity_score, severity_bucket


def monitor_drift(embeddings: np.ndarray, structural: pd.DataFrame, train_end_idx: int,
                  cfg: PipelineConfig) -> dict[str, DriftSignal]:
    """engine/detection/drift.py (__main__ wiring): KS drift on two signals, each
    with its random-shuffle control test on the reference period."""
    reference_centroid = embeddings[:train_end_idx].mean(axis=0)
    signals = {
        "embedding": fn("engine.detection.drift:embedding_centroid_distance")(embeddings, reference_centroid),
        "template_frequency": structural["template_global_freq"].values,
    }
    drift = {}
    for name, values in signals.items():
        reference = values[:train_end_idx]
        control = section_fn("drift_control")(reference, **cfg.overrides("drift_control"))
        windows, first_flagged = section_fn("drift_windows")(reference, values, **cfg.overrides("drift_windows"))
        drift[name] = DriftSignal(
            windows=windows,
            first_flagged_row=None if first_flagged is None else int(first_flagged),
            control_test={k: float(v) for k, v in control.items()},
        )
    return drift


def build_evidence(df: pd.DataFrame, embeddings: np.ndarray, scores: ViewScores,
                   final_scores: np.ndarray, weights: np.ndarray, is_anomaly: np.ndarray,
                   severity_score: np.ndarray, severity_bucket: np.ndarray,
                   cfg: PipelineConfig) -> list[dict[str, Any]]:
    """engine/evidence.py: one evidence package per selected anomaly, most severe first."""
    anomaly_idx = np.where(is_anomaly)[0]
    ordered = anomaly_idx[np.argsort(-severity_score[anomaly_idx], kind="stable")]
    max_packages = cfg.backend("evidence")["max_packages"]
    if max_packages is not None:
        ordered = ordered[:max_packages]

    build = fn("engine.evidence:build_evidence_package")
    template_ids = df["template_id"].values
    packages = [
        build(int(idx), df, embeddings, scores.semantic, scores.structural, scores.temporal,
              final_scores, weights, is_anomaly, severity_bucket, template_ids)
        for idx in ordered
    ]
    # Round-trip through JSON so numpy scalars become plain values, as the experiment does on save.
    return json.loads(json.dumps(packages, default=str))


def analyse_root_cause(df: pd.DataFrame, is_anomaly: np.ndarray, severity_score: np.ndarray,
                       cfg: PipelineConfig) -> RootCauseAnalysis | None:
    """engine/rca/*: incident clustering, co-occurrence, signatures, ranking."""
    if not is_anomaly.any():
        return None
    incident_ids = section_fn("incidents")(df, is_anomaly, **cfg.overrides("incidents"))

    # compute_cooccurrence cannot build its frame when no incident spans two components.
    components_per_incident = df.loc[incident_ids.index, "component"].groupby(incident_ids.values).nunique()
    if (components_per_incident > 1).any():
        cooccurrence = fn("engine.rca.cooccurrence:compute_cooccurrence")(df, incident_ids)
    else:
        cooccurrence = pd.DataFrame(columns=COOCCURRENCE_COLUMNS)

    signatures = fn("engine.rca.template_grouping:group_by_template_signature")(df, incident_ids)
    rankings = fn("engine.rca.rank_root_cause:rank_root_cause_candidates")(
        df, incident_ids, severity_score, cooccurrence)
    return RootCauseAnalysis(incident_ids, signatures, cooccurrence, rankings)

