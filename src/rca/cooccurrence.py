# src/rca/cooccurrence.py
import pandas as pd
import numpy as np
from itertools import combinations
from collections import Counter

def compute_cooccurrence(df: pd.DataFrame, incident_ids: pd.Series) -> pd.DataFrame:
    """
    For each incident, counts every pair of distinct components that
    appear together. Aggregates into a co-occurrence score per component pair.
    """
    anomaly_df = df.loc[incident_ids.index].copy()
    anomaly_df["incident_id"] = incident_ids.values

    pair_counts = Counter()
    for incident_id, group in anomaly_df.groupby("incident_id"):
        components = sorted(set(group["component"]))
        if len(components) < 2:
            continue
        for pair in combinations(components, 2):
            pair_counts[pair] += 1

    rows = [{"component_a": a, "component_b": b, "cooccurrence_count": c}
            for (a, b), c in pair_counts.items()]
    cooc_df = pd.DataFrame(rows).sort_values("cooccurrence_count", ascending=False)
    return cooc_df


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    incident_ids = pd.read_parquet("../../data/processed/incident_ids.parquet")["incident_id"]

    cooc_df = compute_cooccurrence(df, incident_ids)
    print(f"Found {len(cooc_df)} co-occurring component pairs")
    print(cooc_df.head(15))

    cooc_df.to_parquet("../../data/processed/component_cooccurrence.parquet", index=False)
    print("Saved component_cooccurrence.parquet")