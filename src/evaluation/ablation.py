# src/evaluation/ablation.py
import numpy as np
import pandas as pd
import json
from metrics import compute_metrics

def run_ablation(sem, struct, temp, weights_shape, is_anomaly, threshold_module=None):
    """
    For each config, recompute a 'final score' using only the specified
    view(s) with equal weighting among included views, then reapply the
    SAME threshold logic to get a fair flagged/not-flagged comparison.
    """
    import sys
    sys.path.append("../detection")
    from threshold import rolling_mad_threshold

    configs = {
        "semantic_only": [sem],
        "structural_only": [struct],
        "temporal_only": [temp],
        "semantic_structural": [sem, struct],
        "full": [sem, struct, temp],
    }

    results = {}
    for name, views in configs.items():
        combined = np.mean(np.stack(views, axis=1), axis=1)
        _, flagged = rolling_mad_threshold(combined)
        results[name] = {"scores": combined, "flagged": flagged}
    return results


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    sem = np.load("../../data/processed/semantic_anomaly_scores.npy")
    struct = np.load("../../data/processed/structural_anomaly_scores.npy")
    temp = np.load("../../data/processed/temporal_anomaly_scores.npy")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)
    test_start = split["val_end_idx"]

    y_true = (df["label"].values[test_start:] != "-").astype(int)

    ablation_results = run_ablation(sem, struct, temp, None, None)

    metrics_by_config = {}
    for name, result in ablation_results.items():
        m = compute_metrics(
            y_true,
            result["flagged"][test_start:].astype(int),
            result["scores"][test_start:],
        )
        metrics_by_config[name] = m
        print(f"\n{name}:")
        for k, v in m.items():
            print(f"  {k}: {v}")

    with open("../../data/processed/ablation_metrics.json", "w") as f:
        json.dump(metrics_by_config, f, indent=2)
    print("\nSaved ablation_metrics.json")