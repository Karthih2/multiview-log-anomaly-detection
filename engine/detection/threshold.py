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

    buckets = pd.cut(
        severity_score,
        bins=[-0.01, 0.0001, 0.3, 0.6, 1.0],
        labels=["NONE", "LOW", "MEDIUM", "HIGH"],
    ).astype(str)

    # Reserve CRITICAL for the genuine top tail, not just "high severity_score"
    critical_cutoff = np.quantile(severity_score[is_anomaly], 0.98) if is_anomaly.sum() > 0 else 1.0
    buckets = np.where((severity_score >= critical_cutoff) & is_anomaly, "CRITICAL", buckets)

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