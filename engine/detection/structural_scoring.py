# src/detection/structural_scoring.py
import time
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import OneHotEncoder

RANDOM_SEED = 42


def encode_structural(struct: pd.DataFrame, encoder: OneHotEncoder = None, fit=False):
    numeric = struct[["param_count", "level_rank", "template_global_freq"]].values
    cat_cols = struct[["component", "type"]].astype(str)

    if fit:
        encoder = OneHotEncoder(handle_unknown="ignore", sparse_output=False)
        cat_encoded = encoder.fit_transform(cat_cols)
    else:
        cat_encoded = encoder.transform(cat_cols)

    X = np.hstack([numeric, cat_encoded])
    return X, encoder


def fit_structural_detectors(X_train: np.ndarray, lof_sample_size: int = 30_000):
    # Isolation Forest scales fine on the full training set — n_estimators
    # halved from 200 to 100 to save time; 100 trees is still plenty stable.
    iso = IsolationForest(
        random_state=RANDOM_SEED,
        contamination=0.1,
        n_estimators=100,
    )
    iso.fit(X_train)

    # LOF is the real bottleneck at this scale: fitting AND scoring both
    # require nearest-neighbor search against every reference point, for
    # every row being scored. Fitting on all 2.8M training rows and then
    # scoring 4.7M rows against that is far too slow (20+ min observed).
    # A random subsample of 30k rows keeps the same local-density structure
    # at a small fraction of the cost.
    rng = np.random.default_rng(RANDOM_SEED)
    if len(X_train) > lof_sample_size:
        idx = rng.choice(len(X_train), size=lof_sample_size, replace=False)
        X_lof_train = X_train[idx]
    else:
        X_lof_train = X_train

    print(f"LOF fitting on subsample of {len(X_lof_train):,} rows (down from {len(X_train):,})")

    lof = LocalOutlierFactor(
        n_neighbors=20,
        novelty=True,
        contamination=0.1,
        n_jobs=-1,  # use all CPU cores for neighbor search
    )
    lof.fit(X_lof_train)

    return iso, lof


def structural_anomaly_score(X, iso, lof):
    # decision_function: higher = more normal. Flip and normalize to [0,1]-ish.
    iso_score = -iso.decision_function(X)
    lof_score = -lof.decision_function(X)

    # Min-max normalize each independently, then average
    iso_norm = (iso_score - iso_score.min()) / (iso_score.max() - iso_score.min() + 1e-9)
    lof_norm = (lof_score - lof_score.min()) / (lof_score.max() - lof_score.min() + 1e-9)

    return (iso_norm + lof_norm) / 2


if __name__ == "__main__":
    import json

    struct = pd.read_parquet("../../data/processed/structural_features.parquet")
    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    train_struct = struct.iloc[:split["train_end_idx"]]

    print("Encoding structural features...")
    t0 = time.time()
    X_train, encoder = encode_structural(train_struct, fit=True)
    X_full, _ = encode_structural(struct, encoder=encoder, fit=False)
    print(f"  done in {time.time() - t0:.1f}s")

    print(f"Fitting Isolation Forest + LOF on {len(X_train):,} training rows...")
    t0 = time.time()
    iso, lof = fit_structural_detectors(X_train)
    print(f"  done in {time.time() - t0:.1f}s")

    print("Scoring full dataset (usually the slow part)...")
    t0 = time.time()
    scores = structural_anomaly_score(X_full, iso, lof)
    print(f"  done in {time.time() - t0:.1f}s")

    print(f"Score range: {scores.min():.4f} to {scores.max():.4f}")

    np.save("../../data/processed/structural_anomaly_scores.npy", scores)
    print("Saved to ../../data/processed/structural_anomaly_scores.npy")