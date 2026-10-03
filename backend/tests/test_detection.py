"""Unit checks for the temporal HMM novelty rule and the severity quantile buckets."""
import numpy as np
import pandas as pd

from app.pipeline import experiment  # noqa: F401  (puts the engine on sys.path)
from engine.detection.temporal_scoring import fit_hmm, hmm_sequence_score
from engine.detection.threshold import compute_severity


def test_unseen_template_window_scores_highest_and_stays_finite():
    rng = np.random.default_rng(0)
    train = rng.integers(0, 3, 400)
    model = fit_hmm(train, n_states=3)
    seq = np.concatenate([train[:100], np.full(30, 7), train[100:160]])  # id 7 never seen
    scores = hmm_sequence_score(seq, model, window=10, stride=5)
    assert np.isfinite(scores).all()
    novel = scores[105:130]
    assert novel.max() >= scores[:100].max()


def test_severity_buckets_follow_flagged_quantiles():
    n = 1000
    rng = np.random.default_rng(1)
    flagged = np.zeros(n, bool)
    flagged[:400] = True
    temp = pd.DataFrame({"repeated_event_ratio": rng.random(n), "rolling_freq": rng.random(n)})
    struct = pd.DataFrame({"template_global_freq": rng.random(n) + 1})
    _, buckets = compute_severity(rng.random(n), flagged, temp, struct)
    counts = pd.Series(buckets[flagged]).value_counts().to_dict()
    assert set(buckets[~flagged]) == {"NONE"}
    assert counts["CRITICAL"] == 8 and 50 <= counts["HIGH"] <= 54
    assert 138 <= counts["MEDIUM"] <= 142 and counts["LOW"] == 200


def test_structural_shap_groups_one_hot_and_matches_explainer():
    import shap
    from engine.detection.structural_scoring import encode_structural, fit_structural_detectors
    from engine.explain import structural_shap

    rng = np.random.default_rng(2)
    n = 300
    frame = pd.DataFrame({
        "param_count": rng.integers(0, 5, n), "level_rank": rng.integers(0, 4, n),
        "template_global_freq": rng.integers(1, 50, n),
        "component": rng.choice(["KERNEL", "APP", "MMCS"], n), "type": rng.choice(["RAS", "ACT"], n),
    })
    x, encoder = encode_structural(frame, fit=True)
    iso, _ = fit_structural_detectors(x)
    out = structural_shap(iso, encoder, x[:5], frame.iloc[:5])
    assert {e["feature"] for e in out[0]} == {
        "Template seen in learning window (times)", "Log level", "Parameter count", "Component", "Type"}
    raw = -np.asarray(shap.TreeExplainer(iso).shap_values(x[:5]))
    assert np.allclose([sum(e["shap"] for e in row) for row in out], raw.sum(axis=1))
    assert [abs(e["shap"]) for e in out[0]] == sorted((abs(e["shap"]) for e in out[0]), reverse=True)


def test_temporal_deviations_rank_the_outlying_feature_first():
    from engine.explain import TEMPORAL_FEATURES, temporal_deviations

    rng = np.random.default_rng(3)
    df = pd.DataFrame({c: rng.normal(1, 0.1, 200) for c in TEMPORAL_FEATURES})
    df.loc[150, "burst_rate"] = 50
    top = temporal_deviations(df, 100, [150])[0]
    assert len(top) == 3 and top[0]["feature"] == "Burst rate" and top[0]["z"] > 10


def test_prototype_examples_pick_most_similar_learning_line():
    from sklearn.cluster import KMeans
    from engine.explain import prototype_examples

    emb = np.array([[1, 0], [0.9, 0.1], [0, 1], [0.1, 0.9], [1, 1]], dtype=float)
    kmeans = KMeans(n_clusters=2, n_init=1, random_state=0).fit(emb[:4])
    examples = prototype_examples(emb, 4, kmeans, ["a", "b", "c", "d", "late"])
    assert len(examples) == 2
    assert {e["example"] for e in examples} <= {"a", "b", "c", "d"}
    assert all(0.9 < e["similarity"] <= 1 for e in examples)
