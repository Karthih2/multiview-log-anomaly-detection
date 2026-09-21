# src/features/temporal.py
import pandas as pd
import numpy as np

def build_temporal_features(df: pd.DataFrame, window: str = "60s") -> pd.DataFrame:
    df = df.sort_values("time").reset_index(drop=True)
    temp = pd.DataFrame(index=df.index)

    # 1. Time since previous event (seconds) — direct from your inter-arrival EDA
    temp["time_since_prev"] = df["time"].diff().dt.total_seconds().fillna(0)

    # 2. Rolling event frequency (events per window, e.g. last 60s)
    df_indexed = df.set_index("time")
    rolling_count = df_indexed["content"].rolling(window).count()
    temp["rolling_freq"] = rolling_count.values

    # 3. Burst rate — how many of the last N events happened within 1 second
    #    (this is what your 5-lines-in-0.6-seconds sample is a textbook case of)
    time_arr = df["time"].values.astype("datetime64[s]").astype(np.int64)
    burst_window = 5
    burst_counts = []
    for i in range(len(df)):
        lo = max(0, i - burst_window + 1)
        window_times = time_arr[lo:i+1]
        burst_counts.append(int(np.sum(time_arr[i] - window_times <= 1)))
    temp["burst_rate"] = burst_counts

    # 4. Template novelty — has this exact template been seen before this point?
    #    (first occurrence = 1/novel, repeat = 0/familiar)
    seen = set()
    novelty = []
    for tid in df["template_id"]:
        novelty.append(1 if tid not in seen else 0)
        seen.add(tid)
    temp["template_novelty"] = novelty

    # 5. Transition probability — P(this template | previous template), from an
    #    empirical bigram count built incrementally (causal, no lookahead)
    transition_counts = {}
    total_from = {}
    transition_prob = []
    prev_tid = None
    for tid in df["template_id"]:
        if prev_tid is not None:
            key = (prev_tid, tid)
            count = transition_counts.get(key, 0)
            from_total = total_from.get(prev_tid, 0)
            prob = count / from_total if from_total > 0 else 1.0  # unseen transition = "surprising" = treat as prob 1.0 for now, revisit in Module 6
            transition_prob.append(prob)
            transition_counts[key] = count + 1
            total_from[prev_tid] = from_total + 1
        else:
            transition_prob.append(1.0)
        prev_tid = tid
    temp["transition_prob"] = transition_prob

    # 6. Rolling entropy of template distribution (diversity of recent event types)
    def rolling_entropy(template_ids, win=50):
        ent = np.zeros(len(template_ids))
        for i in range(len(template_ids)):
            lo = max(0, i - win + 1)
            chunk = template_ids[lo:i+1]
            vals, counts = np.unique(chunk, return_counts=True)
            probs = counts / counts.sum()
            ent[i] = -np.sum(probs * np.log2(probs + 1e-12))
        return ent
    temp["rolling_entropy"] = rolling_entropy(df["template_id"].values)

    # 7. Repeated-event ratio (in last N events, what fraction are identical template
    #    to the current one) — directly captures your 6-line burst pattern
    def repeated_ratio(template_ids, win=10):
        ratios = np.zeros(len(template_ids))
        for i in range(len(template_ids)):
            lo = max(0, i - win + 1)
            chunk = template_ids[lo:i+1]
            ratios[i] = np.mean(chunk == template_ids[i])
        return ratios
    temp["repeated_event_ratio"] = repeated_ratio(df["template_id"].values)

    return temp

if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    print(f"Building temporal features for {len(df):,} rows...")

    temp = build_temporal_features(df)
    print(temp.head(10))

    temp.to_parquet("../../data/processed/temporal_features.parquet", index=False)
    print("Saved to ../../data/processed/temporal_features.parquet")