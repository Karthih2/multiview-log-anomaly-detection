# src/rca/rank_root_cause.py
import pandas as pd
import numpy as np

def rank_root_cause_candidates(df: pd.DataFrame, incident_ids: pd.Series,
                                 severity_score: np.ndarray, cooc_df: pd.DataFrame) -> pd.DataFrame:
    anomaly_df = df.loc[incident_ids.index].copy()
    anomaly_df["incident_id"] = incident_ids.values
    anomaly_df["severity_score"] = severity_score[incident_ids.index]

    # Co-occurrence centrality: how many total co-occurrence "connections"
    # does each component have across the whole dataset (simple degree count)
    centrality = pd.concat([
        cooc_df.groupby("component_a")["cooccurrence_count"].sum(),
        cooc_df.groupby("component_b")["cooccurrence_count"].sum(),
    ]).groupby(level=0).sum()

    rankings = []
    for incident_id, group in anomaly_df.groupby("incident_id"):
        group = group.sort_values("time")
        first_time = group["time"].min()

        comp_stats = group.groupby("component").agg(
            first_occurrence=("time", "min"),
            in_cluster_freq=("time", "count"),
            avg_severity=("severity_score", "mean"),
        ).reset_index()

        # First-occurrence priority: earlier = higher priority (inverse rank)
        comp_stats["first_occurrence_priority"] = 1 / (
            1 + (comp_stats["first_occurrence"] - first_time).dt.total_seconds()
        )
        comp_stats["cooc_centrality"] = comp_stats["component"].map(centrality).fillna(0)

        # Normalize each factor within this incident before combining
        for col in ["first_occurrence_priority", "avg_severity", "in_cluster_freq", "cooc_centrality"]:
            rng = comp_stats[col].max() - comp_stats[col].min()
            comp_stats[col + "_norm"] = (comp_stats[col] - comp_stats[col].min()) / (rng + 1e-9)

        comp_stats["root_cause_score"] = (
            0.35 * comp_stats["first_occurrence_priority_norm"] +
            0.3 * comp_stats["avg_severity_norm"] +
            0.2 * comp_stats["in_cluster_freq_norm"] +
            0.15 * comp_stats["cooc_centrality_norm"]
        )
        comp_stats["incident_id"] = incident_id
        comp_stats = comp_stats.sort_values("root_cause_score", ascending=False)
        comp_stats["rank"] = range(1, len(comp_stats) + 1)

        rankings.append(comp_stats)

    return pd.concat(rankings, ignore_index=True)


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    incident_ids = pd.read_parquet("../../data/processed/incident_ids.parquet")["incident_id"]
    severity_score = np.load("../../data/processed/severity_score.npy")
    cooc_df = pd.read_parquet("../../data/processed/component_cooccurrence.parquet")

    rank_df = rank_root_cause_candidates(df, incident_ids, severity_score, cooc_df)

    print("Top-ranked root cause candidates for the 5 largest incidents:")
    top_incidents = rank_df.groupby("incident_id").size().sort_values(ascending=False).head(5).index
    print(rank_df[rank_df["incident_id"].isin(top_incidents) & (rank_df["rank"] == 1)]
          [["incident_id", "component", "root_cause_score"]])

    rank_df.to_parquet("../../data/processed/root_cause_rankings.parquet", index=False)
    print("Saved root_cause_rankings.parquet")