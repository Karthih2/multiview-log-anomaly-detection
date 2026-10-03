"""Pipeline configuration and a real end-to-end run through the upload endpoint."""
import time
from itertools import islice

import pytest

from app.core.config import get_settings
from app.core.pipeline_config import PipelineConfig, load_pipeline_config
from app.db.models import RunStatus

API = get_settings().api_prefix
RAW_LOG = get_settings().experiment_root / "data" / "raw" / "BGL.log"
E2E_LINES = 4000
E2E_TIMEOUT_SECONDS = 600


def test_effective_config_inherits_experiment_defaults():
    import inspect
    from app.pipeline.experiment import section_fn

    effective = load_pipeline_config().effective()
    signature = inspect.signature(section_fn("threshold"))
    assert effective["threshold"]["lam"] == signature.parameters["lam"].default
    assert effective["threshold"]["window"] == signature.parameters["window"].default


def test_override_replaces_default_and_unknown_parameter_is_rejected():
    base = load_pipeline_config().sections
    overridden = PipelineConfig({**base, "threshold": {"lam": 9.5}})
    assert overridden.effective()["threshold"]["lam"] == 9.5
    assert overridden.overrides("threshold") == {"lam": 9.5}

    with pytest.raises(ValueError, match="not_a_parameter"):
        PipelineConfig({**base, "threshold": {"not_a_parameter": 1}}).effective()


@pytest.mark.skipif(not RAW_LOG.exists(), reason="raw BGL log not available")
def test_upload_runs_full_pipeline(client):
    with open(RAW_LOG, "rb") as f:
        payload = b"".join(islice(f, E2E_LINES))

    response = client.post(f"{API}/runs", files={"file": ("sample.log", payload)}, data={"name": "e2e"})
    assert response.status_code == 202
    run_id = response.json()["id"]

    deadline = time.monotonic() + E2E_TIMEOUT_SECONDS
    while True:
        run = client.get(f"{API}/runs/{run_id}").json()
        if run["status"] in (RunStatus.COMPLETED.value, RunStatus.FAILED.value):
            break
        assert time.monotonic() < deadline, f"pipeline still at stage {run['stage']}"
        time.sleep(1)

    assert run["status"] == RunStatus.COMPLETED.value, run["error"]
    assert run["raw_rows"] == E2E_LINES
    assert run["parameters"]["threshold"]["lam"] is not None
    # Every planned stage was reported, in order, so the UI can tick them off.
    assert [entry["stage"] for entry in run["stage_log"]] == run["planned_stages"]
    # Each view's detector was fitted on this upload's training lines, not on anything stored.
    detectors = run["detectors"]
    assert detectors["semantic"]["prototype_model"] == "MiniBatchKMeans"
    assert detectors["semantic"]["distance"] == "cosine_similarity"
    assert detectors["structural"]["global_model"] == "IsolationForest"
    assert detectors["structural"]["local_model"] == "LocalOutlierFactor"
    assert detectors["temporal"]["sequence_model"] == "CategoricalHMM"
    assert detectors["temporal"]["frequency_signal"] == "rolling_zscore"
    assert {d["fitted_on_rows"] for d in detectors.values()} == {run["train_end_idx"]}
    views = run["view_summary"]
    assert set(views) == {"semantic", "structural", "temporal"}
    assert sum(v["dominant_flags"] for v in views.values()) == run["n_anomalies"]

    # Feature-level reasons are stored inside the evidence packages.
    flagged = client.get(f"{API}/runs/{run_id}/anomalies").json()["items"]
    packages = [client.get(f"{API}/runs/{run_id}/events/{e['row_index']}").json()["evidence"] for e in flagged[:20]]
    packages = [p["package"] for p in packages if p]
    assert any(p.get("structural_shap") and p.get("temporal_deviations") and p.get("semantic_prototype")
               for p in packages)

    summary = client.get(f"{API}/runs/{run_id}/summary").json()
    assert summary["total_rows"] == run["total_rows"] > 0
    assert sum(summary["severity_counts"].values()) == summary["n_anomalies"]

    anomalies = client.get(f"{API}/runs/{run_id}/anomalies").json()
    assert anomalies["total"] == summary["n_anomalies"]
    incidents = client.get(f"{API}/runs/{run_id}/incidents").json()
    assert incidents["total"] == summary["n_incidents"]
    # Incidents only ever group flagged events.
    assert sum(i["n_anomalies"] for i in incidents["items"]) <= summary["n_anomalies"]
    assert {s["signal"] for s in client.get(f"{API}/runs/{run_id}/drift").json()} == {
        "embedding", "template_frequency"}
