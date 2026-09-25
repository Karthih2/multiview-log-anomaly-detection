# src/rca/incident_clustering.py
import numpy as np
import pandas as pd

def cluster_incidents(df: pd.DataFrame, is_anomaly: np.ndarray, time_window: str = "10min") -> pd.Series:
    """
    Groups flagged anomalies into incident clusters based on time proximity.
    Two anomalies belong to the same incident if they occur within
    `time_window` of each other (chained — if A is within window of B, and
    B is within window of C, all three join one incident even if A and C
    are further apart than the window alone).
    """
    anomaly_df = df[is_anomaly].copy().sort_values("time")
    
    time_diffs = anomaly_df["time"].diff()
    window_td = pd.Timedelta(time_window)
    
    new_incident = (time_diffs > window_td) | (time_diffs.isna())
    incident_id = new_incident.cumsum()
    
    anomaly_df["incident_id"] = incident_id
    return anomaly_df["incident_id"]


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    is_anomaly = np.load("../../data/processed/is_anomaly.npy")

    incident_ids = cluster_incidents(df, is_anomaly)
    
    print(f"Total flagged anomalies: {is_anomaly.sum():,}")
    print(f"Grouped into {incident_ids.nunique():,} incidents")
    print(f"Incident size distribution:\n{incident_ids.value_counts().describe()}")

    incident_ids.to_frame("incident_id").to_parquet("../../data/processed/incident_ids.parquet")
    print("Saved incident_ids.parquet")