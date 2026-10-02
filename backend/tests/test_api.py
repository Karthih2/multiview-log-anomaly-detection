"""API behaviour against a small stored run (see conftest.make_result)."""
from app.core.config import get_settings

API = get_settings().api_prefix


def test_health(client):
    assert client.get(f"{API}/health").json() == {"status": "ok"}


def test_run_summary(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/summary").json()
    assert body["total_rows"] == 6
    assert body["n_anomalies"] == 3
    assert body["anomaly_rate"] == 0.5
    assert body["n_incidents"] == 2
    assert body["severity_counts"] == {"CRITICAL": 1, "LOW": 1, "MEDIUM": 1}


def test_run_detail_keeps_raw_row_count(client, run_id):
    assert client.get(f"{API}/runs/{run_id}").json()["raw_rows"] == 7


def test_timeline_counts_anomalies_per_day_and_severity(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/timeline").json()
    assert body == [
        {"date": "2005-06-04", "severity": "CRITICAL", "count": 1},
        {"date": "2005-06-05", "severity": "LOW", "count": 1},
        {"date": "2005-06-05", "severity": "MEDIUM", "count": 1},
    ]


def test_timeline_by_hour_for_short_logs(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/timeline", params={"bucket": "hour"}).json()
    assert [(p["date"], p["count"]) for p in body] == [
        ("2005-06-04 15:00", 1), ("2005-06-05 03:00", 1), ("2005-06-05 15:00", 1)]
    assert client.get(f"{API}/runs/{run_id}/timeline", params={"bucket": "week"}).status_code == 422


def test_component_risk_orders_by_anomaly_count(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/components").json()
    assert [(c["component"], c["anomaly_count"]) for c in body] == [("APP", 2), ("KERNEL", 1)]
    assert body[0]["avg_severity_score"] == 0.35


def test_anomalies_are_most_severe_first_and_filterable(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/anomalies").json()
    assert body["total"] == 3
    assert [e["row_index"] for e in body["items"]] == [2, 4, 3]
    assert body["items"][0]["incident_id"] == 1

    filtered = client.get(f"{API}/runs/{run_id}/anomalies", params={"component": "APP", "severity": "LOW"}).json()
    assert [e["row_index"] for e in filtered["items"]] == [3]


def test_anomaly_kinds_group_by_template_and_component(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/anomaly-kinds").json()
    assert body["total"] == 3
    # (lines, most severe row) per kind, most severe kind first.
    assert [(k["lines"], k["event"]["row_index"], k["event"]["component"]) for k in body["items"]] == [
        (1, 2, "KERNEL"), (1, 4, "APP"), (1, 3, "APP")]
    only_app = client.get(f"{API}/runs/{run_id}/anomaly-kinds", params={"component": "APP"}).json()
    assert only_app["total"] == 2


def test_pagination(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/anomalies", params={"limit": 1, "offset": 1}).json()
    assert body["total"] == 3
    assert [e["row_index"] for e in body["items"]] == [4]

    too_large = get_settings().page_size_max + 1
    assert client.get(f"{API}/runs/{run_id}/anomalies", params={"limit": too_large}).status_code == 422


def test_event_detail_includes_template_and_evidence(client, run_id):
    flagged = client.get(f"{API}/runs/{run_id}/events/2").json()
    assert flagged["template"] == "data TLB error <*>"
    assert flagged["evidence"]["dominant_view"] == "structural"

    normal = client.get(f"{API}/runs/{run_id}/events/0").json()
    assert normal["is_anomaly"] is False
    assert normal["incident_id"] is None
    assert normal["evidence"] is None

    assert client.get(f"{API}/runs/{run_id}/events/999").status_code == 404


def test_incidents_largest_first_with_top_root_cause(client, run_id):
    body = client.get(f"{API}/runs/{run_id}/incidents").json()
    assert [(i["incident_id"], i["n_anomalies"], i["top_root_cause"]) for i in body["items"]] == [
        (2, 2, "APP"), (1, 1, "KERNEL")]

    detail = client.get(f"{API}/runs/{run_id}/incidents/2").json()
    assert detail["template_counts"] == {"1": 1, "2": 1}
    assert detail["root_cause_candidates"][0]["component"] == "APP"
    assert detail["peak_severity"] in ("LOW", "MEDIUM", "HIGH", "CRITICAL")
    assert client.get(f"{API}/runs/{run_id}/incidents/99").status_code == 404


def test_score_timeline_covers_every_line(client, run_id):
    buckets = client.get(f"{API}/runs/{run_id}/score-timeline?points=10").json()
    assert sum(b["n_anomalies"] for b in buckets) == 3
    assert buckets[0]["row_start"] == 0


def test_root_cause_clusters_group_incidents_by_top_component(client, run_id):
    clusters = client.get(f"{API}/runs/{run_id}/root-cause-clusters").json()
    assert sorted((c["component"], c["n_incidents"], c["n_anomalies"]) for c in clusters) == [
        ("APP", 1, 2), ("KERNEL", 1, 1)]
    assert all(c["incidents"] for c in clusters)


def test_baseline_is_mean_score_of_unflagged_lines(client, run_id):
    baseline = client.get(f"{API}/runs/{run_id}/baseline").json()
    assert set(baseline) == {"semantic", "structural", "temporal"}
    assert all(0 <= v <= 1 for v in baseline.values())


def test_root_cause_summary_and_empty_cooccurrence(client, run_id):
    summary = client.get(f"{API}/runs/{run_id}/root-causes").json()
    assert sorted((r["component"], r["times_ranked_root_cause"]) for r in summary) == [("APP", 1), ("KERNEL", 1)]
    assert client.get(f"{API}/runs/{run_id}/cooccurrence").json() == []


def test_drift_templates_evidence(client, run_id):
    drift = client.get(f"{API}/runs/{run_id}/drift").json()
    assert drift[0]["signal"] == "embedding"
    assert drift[0]["first_flagged_row"] is None
    assert len(drift[0]["windows"]) == 1

    templates = client.get(f"{API}/runs/{run_id}/templates").json()
    assert [t["template_id"] for t in templates["items"]] == [1, 2]
    assert client.get(f"{API}/runs/{run_id}/evidence").json()["total"] == 1


def test_unknown_run_is_404(client):
    assert client.get(f"{API}/runs/999999/summary").status_code == 404


def test_empty_upload_is_rejected(client):
    response = client.post(f"{API}/runs", files={"file": ("empty.log", b"")})
    assert response.status_code == 400


def test_oversized_upload_is_rejected_and_not_kept(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "max_upload_mb", 0)
    response = client.post(f"{API}/runs", files={"file": ("big.log", b"some log line\n")})
    assert response.status_code == 413
    assert not list(settings.uploads_dir.glob("*big.log"))


def test_delete_run_removes_its_rows(client):
    from tests.conftest import make_result
    from app.db import models
    from app.db.models import RunStatus, SourceKind
    from app.db.session import new_session
    from app.services import runs as run_service
    from app.services.persistence import save_result
    from pathlib import Path
    from sqlalchemy import func, select

    with new_session() as session:
        run = run_service.create_run(session, "to-delete", SourceKind.ARTIFACTS, Path("unused"))
        save_result(session, run, make_result())
        run.status = RunStatus.COMPLETED.value
        session.commit()
        doomed = run.id

    assert client.delete(f"{API}/runs/{doomed}").status_code == 204
    assert client.get(f"{API}/runs/{doomed}").status_code == 404
    with new_session() as session:
        for table in models.RUN_CHILD_TABLES:
            assert session.scalar(select(func.count()).select_from(table).where(table.run_id == doomed)) == 0
