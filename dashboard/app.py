# dashboard/app.py
import streamlit as st
import pandas as pd
import numpy as np
import json

st.set_page_config(page_title="Log Anomaly Detection Dashboard", layout="wide")

DATA_DIR = "../data/processed"

@st.cache_data
def load_data():
    df = pd.read_parquet(f"{DATA_DIR}/bgl_parsed.parquet")
    is_anomaly = np.load(f"{DATA_DIR}/is_anomaly.npy")
    severity_bucket = np.load(f"{DATA_DIR}/severity_bucket.npy")
    severity_score = np.load(f"{DATA_DIR}/severity_score.npy")
    final_scores = np.load(f"{DATA_DIR}/final_anomaly_scores.npy")

    df = df.copy()
    df["is_anomaly"] = is_anomaly
    df["severity"] = severity_bucket
    df["severity_score"] = severity_score
    df["final_score"] = final_scores
    return df

@st.cache_data
def load_metrics():
    with open(f"{DATA_DIR}/test_metrics.json") as f:
        metrics = json.load(f)
    with open(f"{DATA_DIR}/eda_raw_summary.json") as f:
        eda = json.load(f)
    return metrics, eda

@st.cache_data
def load_rca():
    incidents = pd.read_parquet(f"{DATA_DIR}/incident_signatures.parquet")
    rankings = pd.read_parquet(f"{DATA_DIR}/root_cause_rankings.parquet")
    return incidents, rankings

df = load_data()
metrics, eda = load_metrics()
incidents, rankings = load_rca()

# ============ HEADER / SYSTEM HEALTH SUMMARY ============
st.title("🖥️ Adaptive Multi-View Log Anomaly Detection Dashboard")
st.caption("BGL Supercomputer Log Analysis — Offline Demo (pre-computed results)")

col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("Total Log Lines", f"{len(df):,}")
col2.metric("Flagged Anomalies", f"{df['is_anomaly'].sum():,}", f"{df['is_anomaly'].mean():.2%}")
col3.metric("Detection AUC-ROC", f"{metrics['auc_roc']:.3f}")
col4.metric("Detection Recall", f"{metrics['recall']:.2%}")
col5.metric("Active Incidents", f"{incidents['incident_id'].nunique():,}")

st.divider()

# ============ TABS ============
tab1, tab2, tab3, tab4 = st.tabs(["📈 Timeline", "🔧 Per-Component Risk", "🚨 Incident Cards", "🔍 RCA Clusters"])

# ---- TAB 1: Anomaly Timeline ----
with tab1:
    st.subheader("Anomaly Timeline")

    anomalies = df[df["is_anomaly"]].copy()
    anomalies["date"] = anomalies["time"].dt.date
    daily_counts = anomalies.groupby(["date", "severity"]).size().reset_index(name="count")

    import plotly.express as px
    fig = px.bar(daily_counts, x="date", y="count", color="severity",
                 color_discrete_map={"LOW": "#90EE90", "MEDIUM": "#FFD700", "HIGH": "#FF8C00", "CRITICAL": "#DC143C"},
                 title="Daily Anomaly Volume by Severity")
    st.plotly_chart(fig, use_container_width=True)

    st.caption("Note: sequential-window drift detection flagged apparent drift early due to genuine "
               "temporal clustering in BGL data — see project documentation for details.")

# ---- TAB 2: Per-Component Risk ----
with tab2:
    st.subheader("Per-Component Risk View")

    comp_risk = df[df["is_anomaly"]].groupby("component").agg(
        anomaly_count=("is_anomaly", "count"),
        avg_severity_score=("severity_score", "mean"),
    ).reset_index().sort_values("anomaly_count", ascending=False)

    fig2 = px.bar(comp_risk, x="component", y="anomaly_count", color="avg_severity_score",
                  color_continuous_scale="Reds", title="Anomalies by Component")
    st.plotly_chart(fig2, use_container_width=True)
    st.dataframe(comp_risk, use_container_width=True)

# ---- TAB 3: Incident Cards ----
with tab3:
    st.subheader("Recent Incidents")

    top_incidents = incidents.sort_values("n_anomalies", ascending=False).head(20)

    for _, inc in top_incidents.iterrows():
        with st.expander(f"Incident #{inc['incident_id']} — {inc['n_anomalies']:,} anomalies "
                          f"— {', '.join(inc['components_involved'])} — {inc['start_time'][:16]}"):
            c1, c2, c3 = st.columns(3)
            c1.metric("Anomalies", f"{inc['n_anomalies']:,}")
            c2.metric("Distinct Templates", inc["n_distinct_templates"])
            c3.metric("Duration", f"{inc['start_time'][11:19]} → {inc['end_time'][11:19]}")

            inc_rank = rankings[rankings["incident_id"] == inc["incident_id"]].sort_values("rank")
            if not inc_rank.empty:
                st.write("**Root-cause candidates (ranked):**")
                st.dataframe(
                    inc_rank[["rank", "component", "root_cause_score", "in_cluster_freq", "avg_severity"]],
                    use_container_width=True, hide_index=True,
                )

# ---- TAB 4: RCA Cluster Overview ----
with tab4:
    st.subheader("Root-Cause Cluster Summary")

    top1_by_incident = rankings[rankings["rank"] == 1]
    rc_counts = top1_by_incident["component"].value_counts().reset_index()
    rc_counts.columns = ["component", "times_ranked_root_cause"]

    fig3 = px.pie(rc_counts, names="component", values="times_ranked_root_cause",
                  title="Most Frequently Identified Root-Cause Component")
    st.plotly_chart(fig3, use_container_width=True)

    st.write("**Component co-occurrence (top pairs):**")
    cooc = pd.read_parquet(f"{DATA_DIR}/component_cooccurrence.parquet")
    st.dataframe(cooc.head(15), use_container_width=True, hide_index=True)

st.divider()
st.caption("Adaptive Multi-View Log Anomaly Detection System — Academic Research Prototype. "
           "Root-cause localization is correlation-based, not causal graph analysis (no service "
           "dependency graph available in BGL/HDFS).")