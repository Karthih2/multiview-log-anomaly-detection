"""Runs the full pipeline on a raw log file, in the order the experiment defines:

ingest -> parse -> split -> features -> per-view scoring -> fusion ->
threshold + severity -> drift -> evidence -> root cause -> evaluation
"""
from collections.abc import Callable
from pathlib import Path

from app.core.pipeline_config import PipelineConfig
from app.pipeline import stages
from app.pipeline.result import PipelineResult, ViewScores

StageCallback = Callable[[str], None]

# Stage names reported through on_stage, in execution order.
PIPELINE_STAGES = ("ingest", "parse", "split", "features", "scoring", "fusion",
                   "threshold", "drift", "evidence", "root_cause", "evaluation")


def run_pipeline(path: Path, cfg: PipelineConfig, on_stage: StageCallback) -> PipelineResult:
    on_stage("ingest")
    df, raw_rows = stages.ingest(path)

    on_stage("parse")
    df = stages.parse(df)

    on_stage("split")
    train_end_idx, val_end_idx = stages.split(df, cfg)

    on_stage("features")
    embeddings, structural, temporal = stages.build_features(df, train_end_idx, cfg)

    on_stage("scoring")
    semantic_scores, kmeans = stages.score_semantic(embeddings, train_end_idx, cfg)
    structural_scores, iso, lof = stages.score_structural(structural, train_end_idx, cfg)
    temporal_scores, hmm_model = stages.score_temporal(df, temporal, train_end_idx, cfg)
    scores = ViewScores(semantic=semantic_scores, structural=structural_scores, temporal=temporal_scores)
    detectors = stages.describe_detectors(df, embeddings, train_end_idx, kmeans, iso, lof, hmm_model)

    on_stage("fusion")
    final_scores, weights = stages.fuse(scores, embeddings, kmeans, structural, temporal, cfg)

    on_stage("threshold")
    threshold, is_anomaly, severity_score, severity_bucket = stages.threshold_and_severity(
        final_scores, temporal, structural, cfg)

    on_stage("drift")
    drift = stages.monitor_drift(embeddings, structural, train_end_idx, cfg)

    on_stage("evidence")
    evidence = stages.build_evidence(
        df, embeddings, scores, final_scores, weights, is_anomaly, severity_score, severity_bucket, cfg)

    on_stage("root_cause")
    rca = stages.analyse_root_cause(df, is_anomaly, severity_score, cfg)

    on_stage("evaluation")
    metrics = stages.evaluate(df, final_scores, is_anomaly, val_end_idx, cfg)

    return PipelineResult(
        events=df,
        templates=stages.template_table(df, structural["template_global_freq"].values),
        train_end_idx=train_end_idx,
        val_end_idx=val_end_idx,
        scores=scores,
        weights=weights,
        final_scores=final_scores,
        is_anomaly=is_anomaly,
        severity_score=severity_score,
        severity_bucket=severity_bucket,
        threshold=threshold,
        raw_rows=raw_rows,
        detectors=detectors,
        drift=drift,
        evidence=evidence,
        rca=rca,
        metrics=metrics,
    )
