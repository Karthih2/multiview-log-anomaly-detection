# src/detection/threshold.py
import numpy as np
import pandas as pd

def rolling_mad_threshold(scores: np.ndarray, window: int = 200, lam: float = 1.5) -> tuple[np.ndarray, np.ndarray]:
    """
    Computes a rolling threshold using median + scaled MAD (Median Absolute
    Deviation) of recent scores. MAD is used instead of std because it's
    robust to outliers — a few genuine anomalies in the rolling window
    won't wildly inflate the threshold the way they would with std/mean.
    """
    s = pd.Series(scores)
    rolling_median = s.rolling(window, min_periods=1).median()

    def mad(x):
        return np.median(np.abs(x - np.median(x)))

    rolling_mad = s.rolling(window, min_periods=1).apply(mad, raw=True)

    # 1.4826 scales MAD to be comparable to std under a normal distribution
    threshold = rolling_median + lam * 1.4826 * rolling_mad

    is_anomaly = scores > threshold.values
    return threshold.values, is_anomaly

def compute_severity(final_scores: np.ndarray, is_anomaly: np.ndarray,
                      temp_features: pd.DataFrame, struct_features: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """
    Severity = combination of:
    - anomaly score itself (how far past threshold)
    - persistence (repeated_event_ratio — is this part of a sustained pattern?)
    - blast radius (proxied here by component diversity — how many distinct
      components are affected in the surrounding window; needs a real
      per-window component-diversity feature — see note below)
    - frequency factor (rolling_freq — is this happening a lot right now?)
    """
    persistence = temp_features["repeated_event_ratio"].values
    frequency_factor = temp_features["rolling_freq"].fillna(0).values
    freq_norm = (frequency_factor - frequency_factor.min()) / (frequency_factor.max() - frequency_factor.min() + 1e-9)

    # Simplified blast radius proxy: template rarity as a stand-in until a
    # proper per-window component-diversity feature exists (flagged below)
    rarity = 1 - (struct_features["template_global_freq"].values /
                   (struct_features["template_global_freq"].max() + 1e-9))

    severity_score = (
        0.4 * final_scores +
        0.25 * persistence +
        0.2 * freq_norm +
        0.15 * rarity
    )

    # Only meaningful for flagged anomalies; non-anomalies get severity 0
    severity_score = severity_score * is_anomaly

    # Buckets are quantiles of the flagged lines' own severity: bottom 50% LOW,
    # 50-85% MEDIUM, 85-98% HIGH, top 2% CRITICAL. Non-flagged lines are NONE.
    buckets = np.full(len(severity_score), "NONE", dtype=object)
    if is_anomaly.any():
        q50, q85, q98 = np.quantile(severity_score[is_anomaly], [0.50, 0.85, 0.98])
        buckets[is_anomaly] = "LOW"
        buckets[is_anomaly & (severity_score >= q50)] = "MEDIUM"
        buckets[is_anomaly & (severity_score >= q85)] = "HIGH"
        buckets[is_anomaly & (severity_score >= q98)] = "CRITICAL"
    buckets = buckets.astype(str)

    return severity_score, buckets

if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    struct = pd.read_parquet("../../data/processed/structural_features.parquet")
    temp = pd.read_parquet("../../data/processed/temporal_features.parquet")
    final_scores = np.load("../../data/processed/final_anomaly_scores.npy")

    threshold, is_anomaly = rolling_mad_threshold(final_scores)
    print(f"Flagged {is_anomaly.sum():,} / {len(is_anomaly):,} rows as anomalous ({is_anomaly.mean():.2%})")

    severity_score, severity_bucket = compute_severity(final_scores, is_anomaly, temp, struct)

    print(pd.Series(severity_bucket).value_counts())

    np.save("../../data/processed/is_anomaly.npy", is_anomaly)
    np.save("../../data/processed/severity_score.npy", severity_score)
    np.save("../../data/processed/severity_bucket.npy", severity_bucket)
    print("Saved threshold outputs.")