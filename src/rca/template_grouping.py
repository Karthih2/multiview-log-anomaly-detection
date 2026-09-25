# src/rca/template_grouping.py
import pandas as pd
import numpy as np

def group_by_template_signature(df: pd.DataFrame, incident_ids: pd.Series) -> pd.DataFrame:
    """
    For each incident, groups its anomalies by template_id, producing a
    signature: which templates occurred, how many times each, in what order.
    """
    anomaly_df = df.loc[incident_ids.index].copy()
    anomaly_df["incident_id"] = incident_ids.values

    signatures = []
    for incident_id, group in anomaly_df.groupby("incident_id"):
        group = group.sort_values("time")
        # FIX: cast keys to str — parquet/pyarrow can't serialize dict
        # columns with integer keys, only str/bytes keys.
        template_counts = {str(k): int(v) for k, v in group["template_id"].value_counts().items()}
        signatures.append({
            "incident_id": incident_id,
            "n_anomalies": len(group),
            "n_distinct_templates": group["template_id"].nunique(),
            "template_counts": template_counts,
            "components_involved": sorted(set(group["component"])),
            "start_time": str(group["time"].min()),
            "end_time": str(group["time"].max()),
        })

    return pd.DataFrame(signatures)


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    incident_ids = pd.read_parquet("../../data/processed/incident_ids.parquet")["incident_id"]

    sig_df = group_by_template_signature(df, incident_ids)
    print(sig_df.sort_values("n_anomalies", ascending=False).head(10))

    sig_df.to_parquet("../../data/processed/incident_signatures.parquet", index=False)
    print("Saved incident_signatures.parquet")