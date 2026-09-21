# src/features/semantic.py
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import torch


def build_semantic_features(df: pd.DataFrame, batch_size: int = 256) -> np.ndarray:
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    model = SentenceTransformer("all-MiniLM-L6-v2", device=device)

    # FIX: group by template_id (the STABLE identifier from Drain3), not by
    # template TEXT. Drain3 evolves a template's text over time as it sees
    # more variety within the same cluster (e.g. cluster 5 might start as
    # verbatim text, then generalize to include "<*>" wildcards later) —
    # so the same template_id can have different text at different points
    # in the timeline. Grouping by text (old version) caused a mismatch:
    # 2,382 unique texts vs 1,819 unique template_ids from parse.py.
    # Grouping by template_id instead keeps this view consistent with
    # structural.py, which also keys off template_id.
    df_sorted = df.sort_values("time")
    id_to_template = df_sorted.groupby("template_id")["template"].last().to_dict()

    unique_ids = list(id_to_template.keys())
    unique_texts = [id_to_template[i] for i in unique_ids]
    print(f"Unique template_ids to embed: {len(unique_ids):,} (out of {len(df):,} rows)")

    embeddings_unique = model.encode(
        unique_texts,
        batch_size=batch_size,
        show_progress_bar=True,
        convert_to_numpy=True,
    )

    id_to_vec = dict(zip(unique_ids, embeddings_unique))
    embeddings = np.array([id_to_vec[tid] for tid in df["template_id"]])

    return embeddings  # shape: (n_rows, 384)


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    print(f"Embedding {len(df):,} rows...")

    embeddings = build_semantic_features(df)
    print(f"Embeddings shape: {embeddings.shape}")

    np.save("../../data/processed/semantic_embeddings.npy", embeddings)
    print("Saved to ../../data/processed/semantic_embeddings.npy")