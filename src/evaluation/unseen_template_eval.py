# src/evaluation/unseen_template_eval.py
import numpy as np
import pandas as pd
import json
from metrics import compute_metrics

if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    final_scores = np.load("../../data/processed/final_anomaly_scores.npy")
    is_anomaly = np.load("../../data/processed/is_anomaly.npy")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    train_end = split["train_end_idx"]
    test_start = split["val_end_idx"]

    train_templates = set(df["template_id"].values[:train_end])
    test_templates = df["template_id"].values[test_start:]

    is_unseen = ~np.isin(test_templates, list(train_templates))
    print(f"Test set: {is_unseen.sum():,} rows with unseen templates, {(~is_unseen).sum():,} with seen templates")

    y_true = (df["label"].values[test_start:] != "-").astype(int)
    y_pred = is_anomaly[test_start:].astype(int)
    scores = final_scores[test_start:]

    results = {}
    if is_unseen.sum() > 0 and y_true[is_unseen].sum() > 0:
        results["unseen_templates"] = compute_metrics(y_true[is_unseen], y_pred[is_unseen], scores[is_unseen])
    else:
        results["unseen_templates"] = "insufficient positive examples to evaluate"

    if (~is_unseen).sum() > 0:
        results["seen_templates"] = compute_metrics(y_true[~is_unseen], y_pred[~is_unseen], scores[~is_unseen])

    print(json.dumps(results, indent=2))
    with open("../../data/processed/unseen_template_metrics.json", "w") as f:
        json.dump(results, f, indent=2)
    print("Saved unseen_template_metrics.json")