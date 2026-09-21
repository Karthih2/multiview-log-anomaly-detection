# src/features/structural.py
import pandas as pd

def build_structural_features(df: pd.DataFrame) -> pd.DataFrame:
    struct = pd.DataFrame(index=df.index)

    struct["template_id"] = df["template_id"]
    struct["param_count"] = df["params"].apply(len)

    # Level as ordinal severity rank (self-reported by the system, not ground truth)
    level_rank = {
        "INFO": 0, "WARNING": 1, "SEVERE": 2,
        "ERROR": 3, "FAILURE": 4, "FATAL": 5, "Kill": 5,
    }
    struct["level_rank"] = df["level"].map(level_rank).fillna(-1).astype(int)

    struct["component"] = df["component"]
    struct["type"] = df["type"]

    # Template rarity — how often has this template been seen up to this point
    # (this feeds Isolation Forest / LOF directly as a numeric signal)
    template_freq = df["template_id"].value_counts()
    struct["template_global_freq"] = df["template_id"].map(template_freq)

    return struct

if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    struct = build_structural_features(df)

    print(struct.head())
    print(struct.dtypes)

    struct.to_parquet("../../data/processed/structural_features.parquet", index=False)
    print("Saved to ../../data/processed/structural_features.parquet")