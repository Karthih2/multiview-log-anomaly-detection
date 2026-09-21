# src/ingest.py

import pandas as pd


COLUMNS = [
    "label",
    "timestamp",
    "date",
    "node",
    "time",
    "node_repeat",
    "type",
    "component",
    "level",
    "content",
]


def load_bgl(path: str) -> pd.DataFrame:
    """
    Load raw BGL.log file into a structured pandas DataFrame.
    """

    rows = []

    with open(path, "r", errors="replace") as f:
        for line in f:

            # Remove newline
            line = line.rstrip("\n")

            # Skip empty lines
            if not line.strip():
                continue

            # BGL format:
            # label timestamp date node time node_repeat type component level content
            #
            # split(None, 9) splits on ANY run of whitespace (spaces/tabs),
            # not just a single literal space. This matters because BGL raw
            # lines occasionally have double spaces in the structured fields —
            # a literal " " split would create a phantom empty token there
            # and silently shift every column after it. split(None, 9)
            # behaves like split() with no args (whitespace-run aware) while
            # still capping at 9 splits so the full message stays intact
            # in the content field.
            parts = line.split(None, 9)

            # Skip malformed rows
            if len(parts) < 10:
                continue

            rows.append(parts)

    # Create DataFrame
    df = pd.DataFrame(rows, columns=COLUMNS)

    # Convert Unix timestamp to numeric
    df["timestamp"] = pd.to_numeric(
        df["timestamp"],
        errors="coerce"
    )

    # Convert BGL timestamp into datetime
    df["time"] = pd.to_datetime(
        df["time"],
        format="%Y-%m-%d-%H.%M.%S.%f",
        errors="coerce"
    )

    return df


def clean(df: pd.DataFrame) -> pd.DataFrame:
    """
    Clean and order the parsed BGL DataFrame.
    """

    before = len(df)

    # Remove rows with invalid required fields
    df = df.dropna(
        subset=[
            "timestamp",
            "time",
            "content",
        ]
    )

    # Remove empty content
    df = df[
        df["content"].str.strip() != ""
    ]

    # Remove accidental whitespace
    text_columns = [
        "label",
        "date",
        "node",
        "node_repeat",
        "type",
        "component",
        "level",
        "content",
    ]

    for column in text_columns:
        df[column] = df[column].astype("string").str.strip()

    # Remove known-malformed rows where field misalignment occurred
    # during ingestion (see EDA Pass 1 findings — 10 rows out of 4.71M
    # had stray content pushing "RAS KERNEL INFO" out of position,
    # landing junk values like "single"/"microseconds"/"0x00544eb8," in `level`)
    KNOWN_MALFORMED_LEVELS = {"single", "microseconds", "0x00544eb8,"}
    df = df[~df["level"].isin(KNOWN_MALFORMED_LEVELS)]

    # Real chronological ordering
    df = df.sort_values(
        "time"
    ).reset_index(drop=True)

    print(f"Dropped {before - len(df)} malformed/empty rows")

    return df

if __name__ == "__main__":

    input_path = "../data/raw/BGL.log"
    # Load
    df = load_bgl(input_path)
    print(f"Loaded {len(df):,} raw rows")

    # Clean
    df = clean(df)
    print(f"Final rows: {len(df):,}")

    # Show first 6 rows
    print("\nSample data:")
    print(df.head(6).to_string(index=False))

    # Persist cleaned data for downstream modules
    output_path = "../data/processed/bgl_cleaned.parquet"
    df.to_parquet(output_path, index=False)
    print(f"\nSaved cleaned data to {output_path}")