# src/features/semantic.py
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import torch


def build_semantic_features(df: pd.DataFrame, batch_size: int = 256, per_line: bool = True,
                            max_unique_lines: int = 200_000) -> np.ndarray:
    """One 384-D Sentence-BERT vector per row.

    With ``per_line`` the vector is of the line's own text (variable parts included), so two lines of
    one template can score differently. Embedding every distinct line is slow on huge logs, so past
    ``max_unique_lines`` distinct texts this falls back to one vector per template (the old behaviour).
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    model = SentenceTransformer("all-MiniLM-L6-v2", device=device)

    if per_line:
        texts = df["content"].astype(str).str.strip()
        codes, uniques = pd.factorize(texts, sort=True)
        if len(uniques) <= max_unique_lines:
            print(f"Distinct lines to embed: {len(uniques):,} (out of {len(df):,} rows)")
            vectors = model.encode(list(uniques), batch_size=batch_size, show_progress_bar=True,
                                   convert_to_numpy=True)
            return vectors[codes]  # shape: (n_rows, 384)
        print(f"{len(uniques):,} distinct lines is over {max_unique_lines:,}: embedding templates instead.")

    # One vector per template_id (the stable Drain3 identifier; its text can evolve over time).
    df_sorted = df.sort_values("time")
    id_to_template = df_sorted.groupby("template_id")["template"].last().to_dict()
    unique_ids = list(id_to_template.keys())
    unique_texts = [id_to_template[i] for i in unique_ids]
    print(f"Unique template_ids to embed: {len(unique_ids):,} (out of {len(df):,} rows)")
    embeddings_unique = model.encode(unique_texts, batch_size=batch_size, show_progress_bar=True,
                                     convert_to_numpy=True)
    id_to_vec = dict(zip(unique_ids, embeddings_unique))
    return np.array([id_to_vec[tid] for tid in df["template_id"]])


if __name__ == "__main__":
    df = pd.read_parquet("../../data/processed/bgl_parsed.parquet")
    print(f"Embedding {len(df):,} rows...")

    embeddings = build_semantic_features(df)
    print(f"Embeddings shape: {embeddings.shape}")

    np.save("../../data/processed/semantic_embeddings.npy", embeddings)
    print("Saved to ../../data/processed/semantic_embeddings.npy")