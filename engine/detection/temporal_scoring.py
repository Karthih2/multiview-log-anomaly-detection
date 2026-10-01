# src/detection/temporal_scoring.py
import time
import numpy as np
import pandas as pd
from hmmlearn import hmm

RANDOM_SEED = 42

# Full run — set back to True if you ever need to re-test on a slice
TEST_MODE = False
TEST_ROWS = 50_000


def fit_hmm(train_template_ids: np.ndarray, n_states: int = 10):
    X = train_template_ids.reshape(-1, 1)
    lengths = [len(X)]

    model = hmm.CategoricalHMM(n_components=n_states, random_state=RANDOM_SEED, n_iter=50)
    model.fit(X, lengths)
    return model


def hmm_sequence_score(template_ids: np.ndarray, model: hmm.CategoricalHMM,
                        window: int = 20, stride: int = 10) -> np.ndarray:
    """
    Scores sequences using the HMM, but only every `stride`-th row instead
    of every single row (adjacent rows have almost entirely overlapping
    windows, so scoring every position is redundant). Un-scored rows are
    forward-filled from the nearest preceding scored point.

    Guards against -inf log-likelihoods (which model.score() can
    legitimately return for a sequence the HMM considers impossible) —
    without this guard, -log_likelihood / len(chunk) becomes +inf, which
    later breaks min-max normalization (inf - inf = NaN).
    """
    X = template_ids.reshape(-1, 1)
    n = len(X)
    scores = np.zeros(n)

    computed_idx = list(range(0, n, stride))
    if computed_idx[-1] != n - 1:
        computed_idx.append(n - 1)
    computed_set = set(computed_idx)

    last_score = 0.0
    for i in computed_idx:
        lo = max(0, i - window + 1)
        chunk = X[lo:i + 1]
        try:
            log_likelihood = model.score(chunk)
            if np.isfinite(log_likelihood):
                last_score = -log_likelihood / len(chunk)
        except Exception:
            pass
        scores[i] = last_score

    last_val = scores[0]
    for i in range(n):
        if i in computed_set:
            last_val = scores[i]
        else:
            scores[i] = last_val

    return scores


def rolling_zscore(freq_series: pd.Series, window: int = 50) -> np.ndarray:
    roll_mean = freq_series.rolling(window, min_periods=1).mean()
    roll_std = freq_series.rolling(window, min_periods=1).std().fillna(1e-9) + 1e-9
    z = (freq_series - roll_mean) / roll_std
    return z.values


if __name__ == "__main__":
    import json

    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    temp = pd.read_parquet("../../data/processed/temporal_features.parquet")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    unique_ids = np.unique(df["template_id"].values)
    id_map = {tid: i for i, tid in enumerate(unique_ids)}
    all_ids_mapped = df["template_id"].map(id_map).values

    if TEST_MODE:
        print(f"=== TEST MODE: running on first {TEST_ROWS:,} rows only ===")
        df = df.head(TEST_ROWS)
        temp = temp.head(TEST_ROWS)
        all_ids_mapped = all_ids_mapped[:TEST_ROWS]
        train_end = int(TEST_ROWS * 0.6)
    else:
        train_end = split["train_end_idx"]

    train_ids_mapped = all_ids_mapped[:train_end]

    print(f"Fitting HMM on {len(train_ids_mapped):,} training events...")
    t0 = time.time()
    model = fit_hmm(train_ids_mapped)
    print(f"  done in {time.time() - t0:.1f}s")

    print(f"Scoring {len(all_ids_mapped):,} rows (stride=10)...")
    t0 = time.time()
    seq_scores = hmm_sequence_score(all_ids_mapped, model, window=20, stride=10)
    elapsed = time.time() - t0
    print(f"  done in {elapsed:.1f}s")

    print(f"seq_scores has NaN: {np.isnan(seq_scores).any()}")
    print(f"seq_scores has inf: {np.isinf(seq_scores).any()}")

    seq_scores = np.nan_to_num(seq_scores, nan=0.0, posinf=0.0, neginf=0.0)

    if TEST_MODE:
        est_full = elapsed * (4_713_483 / TEST_ROWS)
        print(f"  Estimated time for full 4,713,483 rows: {est_full/60:.1f} minutes")

    freq_z = rolling_zscore(temp["rolling_freq"])

    seq_norm = (seq_scores - seq_scores.min()) / (seq_scores.max() - seq_scores.min() + 1e-9)
    freq_norm = (np.abs(freq_z) - np.abs(freq_z).min()) / (np.abs(freq_z).max() - np.abs(freq_z).min() + 1e-9)

    temporal_scores = (seq_norm + freq_norm) / 2

    print(f"Score range: {temporal_scores.min():.4f} to {temporal_scores.max():.4f}")

    if not TEST_MODE:
        np.save("../../data/processed/temporal_anomaly_scores.npy", temporal_scores)
        print("Saved to ../../data/processed/temporal_anomaly_scores.npy")
    else:
        print("TEST MODE — nothing saved.")