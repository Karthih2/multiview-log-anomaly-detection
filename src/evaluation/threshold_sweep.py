# src/evaluation/threshold_sweep.py
import numpy as np
import pandas as pd
import json
import time
import sys
sys.path.append("../detection")
from threshold import rolling_mad_threshold  # reverted to plain import — matches sys.path.append above
from sklearn.metrics import precision_score, recall_score, f1_score

df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
final_scores = np.load("../../data/processed/final_anomaly_scores.npy")

with open("../../data/processed/split_indices.json") as f:
    split = json.load(f)
test_start = split["val_end_idx"]

y_true = (df["label"].values[test_start:] != "-").astype(int)

# Compute the expensive rolling median/MAD ONCE (lam-independent), then sweep
# lam cheaply on top instead of recomputing the full rolling stats 6 times.
print("Computing rolling median + MAD once (this is the slow part)...")
t0 = time.time()

s = pd.Series(final_scores)
window = 200
rolling_median = s.rolling(window, min_periods=1).median()

def mad(x):
    return np.median(np.abs(x - np.median(x)))

rolling_mad = s.rolling(window, min_periods=1).apply(mad, raw=True)
print(f"  done in {time.time()-t0:.1f}s")

for lam in [1.0, 1.5, 2.0, 2.5, 3.0, 4.0]:
    threshold = rolling_median + lam * 1.4826 * rolling_mad
    is_anomaly = (final_scores > threshold.values)

    y_pred = is_anomaly[test_start:].astype(int)
    p = precision_score(y_true, y_pred, zero_division=0)
    r = recall_score(y_true, y_pred, zero_division=0)
    f1 = f1_score(y_true, y_pred, zero_division=0)
    print(f"lam={lam}: precision={p:.4f}, recall={r:.4f}, f1={f1:.4f}, flagged={y_pred.sum():,}")