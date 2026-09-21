# Project Report

## Dataset: BGL (BlueGene/L Supercomputer Logs)

Source: Lawrence Livermore National Laboratory, via LogHub.

### Raw line structure (10 fields, whitespace-separated)

| Field                    | Value (example)                            | Note                                                                                                               |
| ------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| Label                    | `-`                                        | Missing → means `-` (normal). BGL rows for real alerts have an alert-type label as the first field instead of `-`. |
| Timestamp (unix)         | `1117838570`                               | Seconds since epoch                                                                                                |
| Date                     | `2005.06.03`                               | Redundant with Time, kept for legacy format reasons                                                                |
| Node                     | `R02-M1-N0-C:J12-U11`                      | Which physical node emitted this                                                                                   |
| Time (full, with micros) | `2005-06-03-15.42.50.363779`               | Real ordering key                                                                                                  |
| NodeRepeat               | `R02-M1-N0-C:J12-U11`                      | Repeated node ID                                                                                                   |
| Type                     | `RAS`                                      | Subsystem category                                                                                                 |
| Component                | `KERNEL`                                   | Which component                                                                                                    |
| Level                    | `INFO`                                     | Severity as self-logged by the system                                                                              |
| Content                  | `instruction cache parity error corrected` | Free text → goes to Drain3                                                                                         |

Total columns: 10.

---

## Module 0 — Environment & Skeleton

Python venv, `pandas / numpy / scipy / scikit-learn / sentence-transformers / drain3 / hmmlearn / matplotlib / seaborn / jupyter / streamlit / pyarrow / torch` installed. Folder structure: `data/raw`, `data/processed`, `notebooks/`, `src/` (with `features/` subfolder), `reports/figures/`, `dashboard/`. Fixed random seed convention adopted (NFR-1).

## Module 1 — Ingestion & Cleaning (FR-1, FR-2)

`src/ingest.py` — `load_bgl()` splits raw lines on whitespace runs (`split(None, 9)`, not literal `" "` — avoids field misalignment from double-spaces), builds a 10-column dataframe, converts `timestamp` to numeric and `time` to real datetime64.

`clean()` — drops rows with missing required fields/empty content, strips whitespace on all text columns, drops 10 known-malformed rows (field misalignment producing junk `level` values: `single`, `microseconds`, `0x00544eb8,` — traced to rare raw lines where stray content pushed the `RAS KERNEL INFO` marker out of position), sorts chronologically.

**Why parquet, not CSV:** at 4.7M rows, CSV is slow to read back and bloats file size since it re-stringifies every number/date on save and re-parses on load. Parquet keeps `time` as real datetime64 and `timestamp` as numeric — no re-parsing needed downstream.

Output: `data/processed/bgl_cleaned.parquet` — **4,713,483 rows** (4,713,493 raw → 10 dropped).

## Module 2 — EDA Pass 1 / Raw (FR-3)

`notebooks/01_eda_raw.ipynb`. Findings saved to `data/processed/eda_raw_summary.json`:

```json
{
  "total_rows": 4713493,
  "anomaly_count": 348460,
  "anomaly_pct": 7.3928,
  "dominant_log_level": "INFO",
  "level_distribution": {"INFO": 3701880, "FATAL": 854658, "ERROR": 112355, "WARNING": 23357, "SEVERE": 19213, "FAILURE": 1714, "Kill": 306},
  "inter_arrival_median_sec": 0.026496,
  "inter_arrival_p99_sec": 2.1076784199999943,
  "time_range": ["2005-06-03 15:42:50.363779", "2006-01-04 08:00:05.233639"]
}
```

7.39% anomaly rate matches published BGL statistics — confirms ingestion correctness. ~7 month collection window. Bursty inter-arrival pattern (median 26ms) confirmed, matching the 6-sample-line burst.

## Module 3 — Log Parsing with Drain3 (FR-4)

`src/parse.py` — stateful, order-sensitive template mining over chronologically sorted `content`. Output: `template_id`, `template`, `params` columns added.

Result: **1,819 unique templates** discovered — within the expected range for BGL (few hundred to ~2,000), confirming Drain3 neither over-merged nor exploded into near-duplicates.

Verified: 6 identical sample lines all mapped to `template_id = 1`. Verified variable-token extraction on register-dump-adjacent lines (`<*>` wildcarding confirmed on repeated "integer alignment exceptions" messages once enough examples were seen — first occurrence of a new cluster is stored verbatim, later occurrences generalize it).

Output: `data/processed/bgl_parsed.parquet`.

## Module 4 — EDA Pass 2 / Parsed (FR-5)

`notebooks/02_eda_parsed.ipynb`. Findings saved to `data/processed/eda_parsed_summary.json`:

```json
{
  "n_templates": 1819,
  "singleton_count": 1161,
  "singleton_ratio": 0.6383,
  "template_freq_median": 1.0,
  "template_freq_max": 1706751,
  "top_template_id": 3
}
```

**Investigated the 63.83% singleton ratio directly** rather than assuming it was a tuning problem — spot-check of singleton templates showed they are overwhelmingly **register/floating-point-register dump lines** (e.g. `r00=0xbf8ae0f0 r01=0x0ffea660...`, `fpr5=0x1d510b54...`) with inherently high token-level entropy (hex payloads, varying register indices) that legitimately resist stable template extraction — not a Drain3 misconfiguration.

**Limitation documented (SRS §6.3 style):**

> "~64% of templates are singletons, mostly high-entropy register dumps that resist template merging — expected, and mitigated by the multi-view design."

Decision: no `sim_th` retuning, no re-parse. Structural view's weakness here is compensated by semantic view (SBERT captures "this is a register dump" regardless of exact hex) and temporal view (dump bursts following a fault event are the real signal).

Embedding sanity plot (FR-5's third required plot) deferred to Module 5, since it requires embeddings that didn't exist yet.

## Module 5 — Multi-View Feature Construction (FR-6, FR-7, FR-8)

**5a — Semantic View** (`src/features/semantic.py`): SBERT `all-MiniLM-L6-v2`, CPU/GPU auto-detect via `torch.cuda.is_available()`. Embeds only unique `template_id`s (deduplication optimization — 1,819 lookups instead of 4.7M encodes), using the *last* (most-evolved) template text per id, since Drain3 generalizes a template's text over time within the same cluster (verbatim → wildcarded as more variety is seen) — grouping by raw text instead of `template_id` was caught as a bug (produced 2,382 "unique" texts vs. the true 1,819 ids) and fixed. Output: `data/processed/semantic_embeddings.npy`, shape `(4713483, 384)`, no NaNs.

*Considered and deferred:* contrastive fine-tuning (SimCSE-style) of the embedding model — flagged as a Module 12-adjacent research/ablation addition, not a core requirement (FR-6 specifies plain off-the-shelf SBERT). Deferred until baseline pipeline is complete, so a clean before/after comparison is possible later.

*Considered and rejected:* FAISS / vector DB for embedding storage — unnecessary, since Module 6's KMeans-prototype scoring only compares each embedding against ~20–50 cluster centers (a single fast matrix operation), not against millions of other vectors. Plain `.npy` is correct for this batch, offline workload; brute-force numpy similarity remains fast enough even for the one later use case (nearest-normal-example lookup in evidence generation, FR-17) without needing a search index.

**5b — Structural View** (`src/features/structural.py`): `template_id`, `param_count` (from `params` list length), `level_rank` (ordinal severity mapping, INFO=0 through FATAL/Kill=5, unmapped=-1 safety net), `component`, `type` (kept as raw categoricals — encoding choice deferred to Module 6), `template_global_freq` (raw rarity signal, distinct from the formal reliability signal built in Module 7). Output: `data/processed/structural_features.parquet`.

**5c — Temporal View** (`src/features/temporal.py`): `time_since_prev`, `rolling_freq` (60s rolling window), `burst_rate` (events within 1s of current, capped at window=5), `template_novelty` (first-occurrence flag, causal/no-lookahead), `transition_prob` (empirical bigram P(current|previous), causal/incremental), `rolling_entropy` (Shannon entropy of recent template diversity, window=50), `repeated_event_ratio` (fraction of recent window matching current template, window=10). Output: `data/processed/temporal_features.parquet`.

Verified against the 6-sample-line burst: `burst_rate` climbed 1→2→3→4→5 then capped, `template_novelty` fired once then stayed 0, `repeated_event_ratio` stayed 1.0 throughout, `rolling_entropy` correctly near-zero (low diversity), `transition_prob=1.0` throughout (mathematically correct, not a placeholder artifact, since every observed transition in that stretch genuinely repeated).

**Final alignment check — all four artifacts confirmed row-aligned:**

```
bgl_parsed rows:    4,713,483
semantic emb rows:  4,713,483
structural rows:    4,713,483
temporal rows:      4,713,483
emb has NaNs:       False
```
