"""Feature-level reasons for flagged lines, one helper per view.

Each helper takes only the rows it is asked about, so cost stays small
(the pipeline passes at most `evidence.max_packages` lines).
"""
import numpy as np
import pandas as pd

NUMERIC_COLUMNS = ["param_count", "level_rank", "template_global_freq"]
STRUCTURAL_NAMES = {
    "template_global_freq": "Template seen in learning window (times)",
    "level_rank": "Log level",
    "param_count": "Parameter count",
    "component": "Component",
    "type": "Type",
}
TEMPORAL_FEATURES = {
    "burst_rate": "Burst rate",
    "repeated_event_ratio": "Repeated event ratio",
    "rolling_freq": "Recent line count",
    "rolling_entropy": "Template variety",
    "transition_prob": "Transition probability",
    "time_since_prev": "Seconds since previous line",
    "template_novelty": "Template novelty",
}


def _plain(value):
    return value.item() if hasattr(value, "item") else value


def structural_shap(iso, encoder, x_rows: np.ndarray, feature_frame_rows: pd.DataFrame) -> list[list[dict]]:
    """SHAP values of the Isolation Forest part of the structural score.

    The local-outlier half of the structural score has no tree structure to
    explain, so it is not covered. Signs are flipped from sklearn's
    decision_function (higher = more normal) so that a positive value pushes the
    line toward "more anomalous", the same direction as the structural score.
    One-hot columns are summed back into one "Component" and one "Type" entry.
    """
    if len(x_rows) == 0:
        return []
    try:
        import shap  # lazy: slow import, only needed when a run builds evidence
    except ImportError:  # e.g. numba DLL blocked by an Application Control policy
        return [[] for _ in x_rows]  # run still finishes, just without structural SHAP
    values = -np.asarray(shap.TreeExplainer(iso).shap_values(x_rows))
    n_numeric = len(NUMERIC_COLUMNS)
    owner = list(NUMERIC_COLUMNS)
    for source, categories in zip(encoder.feature_names_in_, encoder.categories_):
        owner += [source] * len(categories)

    result = []
    for row, shap_row in zip(feature_frame_rows.itertuples(index=False), values):
        raw = row._asdict()
        grouped: dict[str, float] = {}
        for column, phi in zip(owner, shap_row):
            grouped[column] = grouped.get(column, 0.0) + float(phi)
        entries = [
            {"feature": STRUCTURAL_NAMES[column], "value": _plain(raw[column]), "shap": phi,
             "pushes": "up" if phi >= 0 else "down"}
            for column, phi in grouped.items()
        ]
        result.append(sorted(entries, key=lambda e: -abs(e["shap"])))
    return result


def temporal_deviations(temporal_df: pd.DataFrame, train_end_idx: int, rows, top: int = 3) -> list[list[dict]]:
    """Per line, the temporal features furthest from the learning window's usual value.

    Spread is the MAD, falling back to the IQR, then to 1 when both are zero.
    """
    train = temporal_df.iloc[:train_end_idx]
    stats = {}
    for column in TEMPORAL_FEATURES:
        median = float(train[column].median())
        spread = float((train[column] - median).abs().median())
        if spread == 0:
            spread = float(train[column].quantile(0.75) - train[column].quantile(0.25))
        stats[column] = (median, spread or 1.0)

    result = []
    for idx in rows:
        entries = []
        for column, label in TEMPORAL_FEATURES.items():
            median, spread = stats[column]
            value = float(temporal_df[column].iloc[idx])
            entries.append({"feature": label, "value": round(value, 3), "usual": round(median, 3),
                            "z": round(abs(value - median) / spread, 2)})
        result.append(sorted(entries, key=lambda e: -e["z"])[:top])
    return result


def _unit(matrix: np.ndarray) -> np.ndarray:
    return matrix / (np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-12)


def prototype_examples(embeddings: np.ndarray, train_end_idx: int, kmeans, contents) -> list[dict]:
    """For each KMeans prototype, the learning-window line most similar to it (cosine)."""
    train = _unit(np.asarray(embeddings[:train_end_idx], dtype=np.float32))
    sims = train @ _unit(np.asarray(kmeans.cluster_centers_, dtype=np.float32)).T
    best = sims.argmax(axis=0)
    return [{"example": str(contents[int(row)]), "similarity": float(sims[row, k])}
            for k, row in enumerate(best)]


def nearest_prototype(embeddings: np.ndarray, kmeans, rows) -> np.ndarray:
    """Index of the prototype closest (cosine) to each selected line."""
    sims = _unit(np.asarray(embeddings[rows], dtype=np.float32)) @ _unit(
        np.asarray(kmeans.cluster_centers_, dtype=np.float32)).T
    return sims.argmax(axis=1)
