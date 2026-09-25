# src/detection/split.py
import pandas as pd

def chronological_split(df: pd.DataFrame, train_frac=0.6, val_frac=0.2):
    n = len(df)
    train_end = int(n * train_frac)
    val_end = int(n * (train_frac + val_frac))

    train = df.iloc[:train_end]
    val = df.iloc[train_end:val_end]
    test = df.iloc[val_end:]
    return train, val, test

if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    train, val, test = chronological_split(df)

    print(f"Train: {len(train):,} | Val: {len(val):,} | Test: {len(test):,}")
    print(f"Train range: {train['time'].min()} to {train['time'].max()}")
    print(f"Test range:  {test['time'].min()} to {test['time'].max()}")

    split_info = {
        "train_end_idx": len(train),
        "val_end_idx": len(train) + len(val),
        "total": len(df),
    }
    import json
    with open("../../data/processed/split_indices.json", "w") as f:
        json.dump(split_info, f, indent=2)