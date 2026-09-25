# src/evaluation/metrics.py
import numpy as np
import pandas as pd
import json
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, average_precision_score

def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray, scores: np.ndarray) -> dict:
    return {
        "precision": float(precision_score(y_true, y_pred, zero_division=0)),
        "recall": float(recall_score(y_true, y_pred, zero_division=0)),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "auc_roc": float(roc_auc_score(y_true, scores)) if len(np.unique(y_true)) > 1 else None,
        "auc_pr": float(average_precision_score(y_true, scores)),
        "n_test_rows": int(len(y_true)),
        "n_true_anomalies": int(y_true.sum()),
        "n_flagged": int(y_pred.sum()),
    }

if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    final_scores = np.load("../../data/processed/final_anomaly_scores.npy")
    is_anomaly = np.load("../../data/processed/is_anomaly.npy")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    test_start = split["val_end_idx"]

    y_true = (df["label"].values[test_start:] != "-").astype(int)
    y_pred = is_anomaly[test_start:].astype(int)
    scores = final_scores[test_start:]

    print(f"Evaluating on {len(y_true):,} held-out test rows...")
    metrics = compute_metrics(y_true, y_pred, scores)

    for k, v in metrics.items():
        print(f"  {k}: {v}")

    with open("../../data/processed/test_metrics.json", "w") as f:
        json.dump(metrics, f, indent=2)
    print("Saved test_metrics.json")