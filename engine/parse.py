# src/parse.py
import pandas as pd
from drain3 import TemplateMiner
from drain3.template_miner_config import TemplateMinerConfig


def build_miner() -> TemplateMiner:
    config = TemplateMinerConfig()
    config.profiling_enabled = False
    return TemplateMiner(config=config)


def parse_logs(df: pd.DataFrame) -> pd.DataFrame:
    miner = build_miner()

    template_ids = []
    templates = []
    param_lists = []

    for content in df["content"]:
        result = miner.add_log_message(content)
        template_ids.append(result["cluster_id"])
        templates.append(result["template_mined"])
        params = miner.extract_parameters(
            result["template_mined"], content, exact_matching=True
        )
        param_lists.append([p.value for p in params] if params else [])

    df = df.copy()
    df["template_id"] = template_ids
    df["template"] = templates
    df["params"] = param_lists
    return df


if __name__ == "__main__":
    df = pd.read_parquet("../data/processed/bgl_cleaned.parquet")
    print(f"Parsing {len(df):,} rows...")

    df = parse_logs(df)

    n_templates = df["template_id"].nunique()
    print(f"Discovered {n_templates:,} unique templates")

    df.to_parquet("../data/processed/bgl_parsed.parquet", index=False)
    print("Saved to data/processed/bgl_parsed.parquet")