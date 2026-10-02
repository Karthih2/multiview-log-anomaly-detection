# src/detection/reliability.py
import numpy as np
import pandas as pd

# View quality is no longer a set of constants tuned on labelled test AUC. The multipliers here are
# neutral (1.0); real quality is measured from the unlabelled learning window by
# `view_quality_from_scores` and passed to `apply_quality_multiplier`. The dict keeps the view names and order.
VIEW_QUALITY_MULTIPLIER = {
    "semantic": 1.0,
    "structural": 1.0,
    "temporal": 1.0,
}

# A view is never muted completely: the weakest view keeps at least this share of quality.
MIN_VIEW_QUALITY = 0.1


def view_quality_from_scores(train_scores: np.ndarray) -> np.ndarray:
    """
    Unlabelled view quality from the learning window. A view whose scores barely move on normal data
    cannot separate anything, so its quality is its robust spread (99th minus 50th percentile of its own
    scores), scaled so the most informative view is 1. No labels are read.
    train_scores: shape (n_train, 3) in the order semantic, structural, temporal.
    """
    spread = np.percentile(train_scores, 99, axis=0) - np.percentile(train_scores, 50, axis=0)
    top = spread.max()
    if not np.isfinite(top) or top <= 0:
        return np.ones(train_scores.shape[1])
    return np.clip(spread / top, MIN_VIEW_QUALITY, 1.0)


def semantic_reliability(embeddings: np.ndarray, kmeans_centers: np.ndarray, k: int = 10) -> np.ndarray:
    """
    Neighbor density: how many training prototypes are 'nearby' this point's
    region of embedding space. Denser neighborhoods = more training exposure
    to this kind of pattern = more reliable semantic judgment.
    Approximated here via distance to the k nearest prototype centers —
    tighter/closer spread = higher reliability.
    """
    from sklearn.metrics.pairwise import cosine_similarity
    sims = cosine_similarity(embeddings, kmeans_centers)
    top_k_sims = np.sort(sims, axis=1)[:, -k:]  # k closest prototypes
    reliability = top_k_sims.mean(axis=1)  # closer/denser = higher
    return np.clip(reliability, 0, 1)


def structural_reliability(struct: pd.DataFrame) -> np.ndarray:
    """
    Template support count: how many times has this template_id been seen?
    More support = more reliable structural judgment about it.
    Log-scaled and normalized to [0,1] since raw counts span orders of magnitude
    (some templates seen once, others 100k+ times).

    NOTE: this reads struct["template_global_freq"], which MUST be computed
    from TRAINING data only (see fix in src/features/structural.py) — if it
    was computed over the full dataset including test rows, this is leaking
    test-set information into a value used at both train and inference time.
    """
    freq = struct["template_global_freq"].values.astype(float)
    log_freq = np.log1p(freq)
    reliability = (log_freq - log_freq.min()) / (log_freq.max() - log_freq.min() + 1e-9)
    return reliability


def temporal_reliability(temp: pd.DataFrame, window: int = 100) -> np.ndarray:
    """
    Historical frequency variance: how stable/predictable has event frequency
    been recently? Low variance = the temporal model has a clear, stable
    pattern to judge against = more reliable. High variance = volatile,
    unpredictable period = temporal judgments are shakier.
    """
    freq = temp["rolling_freq"].fillna(0)
    rolling_var = freq.rolling(window, min_periods=1).var().fillna(0)
    inv_var = 1 / (1 + rolling_var)
    reliability = (inv_var - inv_var.min()) / (inv_var.max() - inv_var.min() + 1e-9)
    return reliability.values


def softmax_weights(reliabilities: np.ndarray) -> np.ndarray:
    """
    reliabilities: shape (n_rows, 3) — one column per view.
    Returns weights of the same shape, each row summing to 1.
    """
    exp = np.exp(reliabilities - reliabilities.max(axis=1, keepdims=True))
    weights = exp / exp.sum(axis=1, keepdims=True)
    return weights


def apply_quality_multiplier(weights: np.ndarray, quality: np.ndarray | None = None) -> np.ndarray:
    """
    Multiplies the dynamic softmax weights by each view's quality, then re-normalizes each row back to
    summing to 1, so a view that looks confident but carries little signal cannot dominate fusion.
    `quality` comes from `view_quality_from_scores`; without it the neutral constants apply.
    """
    multipliers = quality if quality is not None else np.array([
        VIEW_QUALITY_MULTIPLIER["semantic"],
        VIEW_QUALITY_MULTIPLIER["structural"],
        VIEW_QUALITY_MULTIPLIER["temporal"],
    ])
    adjusted = weights * multipliers
    adjusted = adjusted / adjusted.sum(axis=1, keepdims=True)
    return adjusted


def fuse_scores(scores: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """
    scores, weights: both shape (n_rows, 3).
    Final score = weighted sum per row.
    """
    return (scores * weights).sum(axis=1)


if __name__ == "__main__":
    import json
    from sklearn.cluster import MiniBatchKMeans

    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    struct = pd.read_parquet("../../data/processed/structural_features.parquet")
    temp = pd.read_parquet("../../data/processed/temporal_features.parquet")
    emb = np.load("../../data/processed/semantic_embeddings.npy")

    sem_scores = np.load("../../data/processed/semantic_anomaly_scores.npy")
    struct_scores = np.load("../../data/processed/structural_anomaly_scores.npy")
    temp_scores = np.load("../../data/processed/temporal_anomaly_scores.npy")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    train_emb = emb[:split["train_end_idx"]]
    kmeans = MiniBatchKMeans(n_clusters=30, random_state=42, n_init=10, batch_size=10000)
    kmeans.fit(train_emb)

    print("Computing reliability signals...")
    sem_rel = semantic_reliability(emb, kmeans.cluster_centers_)
    struct_rel = structural_reliability(struct)
    temp_rel = temporal_reliability(temp)

    reliabilities = np.stack([sem_rel, struct_rel, temp_rel], axis=1)
    weights = softmax_weights(reliabilities)

    # NEW: apply static quality multipliers before fusing
    weights = apply_quality_multiplier(weights)

    scores = np.stack([sem_scores, struct_scores, temp_scores], axis=1)
    final_scores = fuse_scores(scores, weights)

    print(f"Final score range: {final_scores.min():.4f} to {final_scores.max():.4f}")

    np.save("../../data/processed/final_anomaly_scores.npy", final_scores)
    np.save("../../data/processed/fusion_weights.npy", weights)
    print("Saved final_anomaly_scores.npy and fusion_weights.npy")