# src/detection/semantic_scoring.py
import numpy as np
from sklearn.cluster import MiniBatchKMeans
from sklearn.metrics.pairwise import cosine_similarity

RANDOM_SEED = 42

def fit_semantic_prototypes(train_embeddings: np.ndarray, n_prototypes: int = 30) -> MiniBatchKMeans:
    kmeans = MiniBatchKMeans(
        n_clusters=n_prototypes,
        random_state=RANDOM_SEED,
        n_init=10,
        batch_size=10000,   # process in chunks instead of full 2.8M at once
    )
    kmeans.fit(train_embeddings)
    return kmeans

def semantic_anomaly_score(embeddings: np.ndarray, kmeans: MiniBatchKMeans) -> np.ndarray:
    sims = cosine_similarity(embeddings, kmeans.cluster_centers_)
    max_sim = sims.max(axis=1)
    score = 1 - max_sim
    return score

if __name__ == "__main__":
    import pandas as pd, json

    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    emb = np.load("../../data/processed/semantic_embeddings.npy")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    train_emb = emb[:split["train_end_idx"]]
    print(f"Fitting MiniBatchKMeans on {len(train_emb):,} training embeddings...")

    kmeans = fit_semantic_prototypes(train_emb)
    scores = semantic_anomaly_score(emb, kmeans)

    print(f"Score range: {scores.min():.4f} to {scores.max():.4f}")
    print(f"Score mean: {scores.mean():.4f}")

    np.save("../../data/processed/semantic_anomaly_scores.npy", scores)
    print("Saved to ../../data/processed/semantic_anomaly_scores.npy")