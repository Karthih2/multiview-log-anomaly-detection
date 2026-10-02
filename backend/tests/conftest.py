"""Test setup: an isolated storage folder and database per test session."""
import os
import tempfile
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

# Must be set before any app module reads its settings.
_STORAGE = Path(tempfile.mkdtemp(prefix="logsight-tests-"))
os.environ["LOGSIGHT_STORAGE_DIR"] = str(_STORAGE)
os.environ.pop("LOGSIGHT_DATABASE_URL", None)

from fastapi.testclient import TestClient  # noqa: E402

from app.db import models  # noqa: E402
from app.db.models import RunStatus, SourceKind  # noqa: E402
from app.db.session import init_db, new_session  # noqa: E402
from app.main import app  # noqa: E402
from app.pipeline.result import (DriftSignal, PipelineResult, RootCauseAnalysis,  # noqa: E402
                                 ViewScores)
from app.services import runs as run_service  # noqa: E402
from app.services.persistence import save_result  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


def make_result() -> PipelineResult:
    """A small hand-built result: 6 events, 3 flagged, grouped into 2 incidents."""
    n = 6
    events = pd.DataFrame({
        "timestamp": np.arange(1117838570, 1117838570 + n),
        "time": pd.date_range("2005-06-03 15:42:50", periods=n, freq="12h"),
        "node": ["R02-M1-N0"] * n,
        "type": ["RAS"] * n,
        "component": ["KERNEL", "KERNEL", "KERNEL", "APP", "APP", "KERNEL"],
        "level": ["INFO", "INFO", "FATAL", "INFO", "FATAL", "INFO"],
        "content": [f"message {i}" for i in range(n)],
        "template_id": [1, 1, 2, 1, 2, 1],
        "template": ["message <*>"] * n,
    })
    is_anomaly = np.array([False, False, True, True, True, False])
    severity_score = np.where(is_anomaly, [0, 0, 0.7, 0.2, 0.5, 0], 0.0)
    return PipelineResult(
        events=events,
        templates=pd.DataFrame({"template_id": [1, 2], "template": ["message <*>", "data TLB error <*>"],
                                "occurrences": [4, 2], "train_frequency": [2, 1]}),
        train_end_idx=3,
        val_end_idx=4,
        scores=ViewScores(np.linspace(0, 1, n), np.linspace(1, 0, n), np.full(n, 0.5)),
        weights=np.full((n, 3), 1 / 3),
        final_scores=np.linspace(0.1, 0.9, n),
        is_anomaly=is_anomaly,
        severity_score=severity_score,
        severity_bucket=np.array(["NONE", "NONE", "CRITICAL", "LOW", "MEDIUM", "NONE"]),
        threshold=np.full(n, 0.4),
        raw_rows=7,
        drift={"embedding": DriftSignal(
            windows=pd.DataFrame([{"window_start": 0, "window_end": 6, "ks_stat": 0.2, "p_value": 0.5,
                                   "consecutive_low_p": 0, "drift_flagged": False}]),
            first_flagged_row=None, control_test={"ks_stat": 0.01, "p_value": 0.9})},
        evidence=[{"row_index": 2, "dominant_contributing_view": "structural", "content": "message 2"}],
        rca=RootCauseAnalysis(
            incident_ids=pd.Series([1, 2, 2], index=[2, 3, 4]),
            signatures=pd.DataFrame([
                {"incident_id": 1, "n_anomalies": 1, "n_distinct_templates": 1, "template_counts": {"2": 1},
                 "components_involved": ["KERNEL"], "start_time": "2005-06-04 15:42:50",
                 "end_time": "2005-06-04 15:42:50"},
                {"incident_id": 2, "n_anomalies": 2, "n_distinct_templates": 2,
                 "template_counts": {"1": 1, "2": 1}, "components_involved": ["APP"],
                 "start_time": "2005-06-05 03:42:50", "end_time": "2005-06-05 15:42:50"},
            ]),
            cooccurrence=pd.DataFrame(columns=["component_a", "component_b", "cooccurrence_count"]),
            rankings=pd.DataFrame([
                {"incident_id": incident_id, "rank": 1, "component": component, "root_cause_score": 1.0,
                 "first_occurrence": pd.Timestamp("2005-06-04 15:42:50"), "in_cluster_freq": 1,
                 "avg_severity": 0.5, "first_occurrence_priority": 1.0, "cooc_centrality": 0,
                 "first_occurrence_priority_norm": 0.0, "avg_severity_norm": 0.0,
                 "in_cluster_freq_norm": 0.0, "cooc_centrality_norm": 0.0}
                for incident_id, component in ((1, "KERNEL"), (2, "APP"))
            ]),
        ),
    )


@pytest.fixture(scope="session")
def run_id(client) -> int:
    """A completed run stored through the same persistence code the pipeline uses."""
    init_db()
    with new_session() as session:
        run = run_service.create_run(session, "fixture", SourceKind.ARTIFACTS, Path("unused"))
        save_result(session, run, make_result())
        run.status = RunStatus.COMPLETED.value
        session.commit()
        return run.id
