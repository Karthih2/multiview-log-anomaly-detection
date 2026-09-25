# src/features/structural.py
import pandas as pd

def build_structural_features(df: pd.DataFrame, train_end_idx: int = None) -> pd.DataFrame:
    struct = pd.DataFrame(index=df.index)

    struct["template_id"] = df["template_id"]
    struct["param_count"] = df["params"].apply(len)

    level_rank = {
        "INFO": 0, "WARNING": 1, "SEVERE": 2,
        "ERROR": 3, "FAILURE": 4, "FATAL": 5, "Kill": 5,
    }
    struct["level_rank"] = df["level"].map(level_rank).fillna(-1).astype(int)

    struct["component"] = df["component"]
    struct["type"] = df["type"]

    # FIX: compute template frequency from TRAINING rows only — using the
    # full dataset here leaks test-set information into a feature used at
    # both training and inference time, violating the chronological-split
    # requirement (SRS 6.2). Rows in the test period, especially any
    # template appearing ONLY in test, correctly get a low/zero freq here,
    # which is what an honestly-trained model would actually see.
    if train_end_idx is None:
        raise ValueError("train_end_idx is required to avoid test-set leakage")

    train_freq = df["template_id"].iloc[:train_end_idx].value_counts()
    struct["template_global_freq"] = df["template_id"].map(train_freq).fillna(0).astype(int)

    return struct

if __name__ == "__main__":
    import json

    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")

    with open("../../data/processed/split_indices.json") as f:
        split = json.load(f)

    struct = build_structural_features(df, train_end_idx=split["train_end_idx"])

    print(struct.head())
    print(struct.dtypes)

    struct.to_parquet("../../data/processed/structural_features.parquet", index=False)
    print("Saved to ../../data/processed/structural_features.parquet")