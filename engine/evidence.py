# src/evidence.py
import numpy as np
import pandas as pd
import json

def nearest_normal_example(row_idx: int, embeddings: np.ndarray, is_anomaly: np.ndarray,
                            template_ids: np.ndarray, df: pd.DataFrame, k: int = 1) -> list[dict]:
    """
    Finds the nearest NORMAL (non-anomalous) row to this anomaly, by cosine
    distance in embedding space, restricted to rows sharing the same
    template_id where possible (fairer comparison — "what does a normal
    instance of THIS kind of event look like").
    """
    this_template = template_ids[row_idx]
    same_template_mask = (template_ids == this_template) & (~is_anomaly)

    candidate_idx = np.where(same_template_mask)[0]
    if len(candidate_idx) == 0:
        # fallback: no normal example of same template exists, search globally
        candidate_idx = np.where(~is_anomaly)[0]

    this_emb = embeddings[row_idx].reshape(1, -1)
    candidate_emb = embeddings[candidate_idx]

    from sklearn.metrics.pairwise import cosine_similarity
    sims = cosine_similarity(this_emb, candidate_emb)[0]
    top_k_local = np.argsort(sims)[-k:][::-1]
    top_k_global = candidate_idx[top_k_local]

    examples = []
    for idx in top_k_global:
        examples.append({
            "row_index": int(idx),
            "time": str(df.iloc[idx]["time"]),
            "content": df.iloc[idx]["content"],
            "similarity": float(sims[top_k_local[0]]),
        })
    return examples


def preceding_sequence(row_idx: int, df: pd.DataFrame, window: int = 5) -> list[dict]:
    """
    The N events immediately preceding this anomaly, in order — gives context
    for 'what was happening right before this was flagged.'
    """
    lo = max(0, row_idx - window)
    preceding = df.iloc[lo:row_idx]
    return [
        {"time": str(r["time"]), "content": r["content"], "template_id": int(r["template_id"])}
        for _, r in preceding.iterrows()
    ]


def build_evidence_package(row_idx: int, df: pd.DataFrame, embeddings: np.ndarray,
                            sem_scores: np.ndarray, struct_scores: np.ndarray, temp_scores: np.ndarray,
                            final_scores: np.ndarray, weights: np.ndarray,
                            is_anomaly: np.ndarray, severity_bucket: np.ndarray,
                            template_ids: np.ndarray) -> dict:
    row = df.iloc[row_idx]

    # What changed / per-view deviation
    per_view_deviation = {
        "semantic": {"score": float(sem_scores[row_idx]), "weight": float(weights[row_idx][0])},
        "structural": {"score": float(struct_scores[row_idx]), "weight": float(weights[row_idx][1])},
        "temporal": {"score": float(temp_scores[row_idx]), "weight": float(weights[row_idx][2])},
    }
    dominant_view = max(per_view_deviation, key=lambda v: per_view_deviation[v]["score"] * per_view_deviation[v]["weight"])

    evidence = {
        "row_index": int(row_idx),
        "time": str(row["time"]),
        "component": row["component"],
        "node": row["node"],
        "content": row["content"],
        "template": row["template"],
        "final_anomaly_score": float(final_scores[row_idx]),
        "severity": str(severity_bucket[row_idx]),
        "per_view_deviation": per_view_deviation,
        "dominant_contributing_view": dominant_view,
        "nearest_normal_example": nearest_normal_example(row_idx, embeddings, is_anomaly, template_ids, df),
        "preceding_events": preceding_sequence(row_idx, df),
    }
    return evidence


if __name__ == "__main__":
    df = pd.read_parquet("../data/processed/bgl_parsed.parquet")
    emb = np.load("../data/processed/semantic_embeddings.npy")

    sem_scores = np.load("../data/processed/semantic_anomaly_scores.npy")
    struct_scores = np.load("../data/processed/structural_anomaly_scores.npy")
    temp_scores = np.load("../data/processed/temporal_anomaly_scores.npy")
    final_scores = np.load("../data/processed/final_anomaly_scores.npy")
    weights = np.load("../data/processed/fusion_weights.npy")
    is_anomaly = np.load("../data/processed/is_anomaly.npy")
    severity_bucket = np.load("../data/processed/severity_bucket.npy")
    template_ids = df["template_id"].values

    anomaly_indices = np.where(is_anomaly)[0]
    print(f"Generating evidence for {len(anomaly_indices):,} flagged anomalies...")

    # This will be slow if run for ALL 254,888 anomalies at once — test on a
    # small sample first (see concept notes)
    sample_size = 20
    sample_indices = np.random.default_rng(42).choice(anomaly_indices, size=sample_size, replace=False)

    evidence_packages = []
    for idx in sample_indices:
        pkg = build_evidence_package(
            idx, df, emb, sem_scores, struct_scores, temp_scores,
            final_scores, weights, is_anomaly, severity_bucket, template_ids
        )
        evidence_packages.append(pkg)

    with open("../data/processed/evidence_sample.json", "w") as f:
        json.dump(evidence_packages, f, indent=2, default=str)

    print(f"Saved {sample_size} sample evidence packages to ../data/processed/evidence_sample.json")
    print("\nExample package:")
    print(json.dumps(evidence_packages[0], indent=2, default=str))