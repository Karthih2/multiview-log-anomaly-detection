# Log Anomaly Detection Pipeline

This document is based only on the code in the project, not on any existing markdown notes or docs. It describes what the project does, how the data moves through the system, and what each major section is responsible for.

## 1) What the project does

The project reads raw BGL log lines, cleans them, parses log templates, builds multiple feature views, scores each event for anomaly likelihood, applies a threshold to turn scores into predictions, and then adds severity, evaluation, and root-cause analysis.

The main idea is a multi-view anomaly detector:

- semantic view: compares each event template embedding against learned semantic prototypes
- structural view: looks at template rarity, component/type patterns, and other static signal features
- temporal view: looks at event timing, transitions, burst behavior, and frequency patterns

The final score is a weighted combination of these three views, with reliability-based weighting and a final rolling MAD threshold to decide anomaly status.

---

## 2) End-to-end data flow

The project pipeline is:

raw BGL file
-> ingest and clean rows
-> parse into template_id / template / params
-> build semantic + structural + temporal feature tables
-> score each view separately
-> fuse scores using reliability weights
-> apply rolling MAD threshold to flag anomalies
-> compute severity labels
-> evaluate on held-out test rows
-> cluster anomalies into incidents and rank likely root causes
-> visualize results in the Streamlit dashboard

In code terms, the flow is roughly:

1. `src/ingest.py`
   - reads the raw BGL text file
   - splits each line into structured columns
   - removes malformed or empty rows
   - sorts chronologically

2. `src/parse.py`
   - uses Drain3 to mine template patterns from log messages
   - assigns each row a `template_id`, `template`, and `params`

3. `src/features/semantic.py`
   - creates sentence embeddings for template text
   - maps every row to a template embedding

4. `src/features/structural.py`
   - builds a structural feature table using template_id, parameter count, severity rank, component, type, and training-only template frequency

5. `src/features/temporal.py`
   - builds temporal features such as time gap, rolling frequency, burst rate, novelty, transition probability, rolling entropy, and repeated event ratio

6. `src/detection/semantic_scoring.py`
   - fits MiniBatchKMeans on training embeddings
   - computes semantic anomaly score as 1 minus max cosine similarity to prototype centers

7. `src/detection/structural_scoring.py`
   - encodes the structural features, fits Isolation Forest and Local Outlier Factor, then combines them into a final structural anomaly score

8. `src/detection/temporal_scoring.py`
   - fits a Categorical HMM on training template IDs
   - combines HMM-based sequence anomaly score with a rolling z-score based frequency signal

9. `src/detection/reliability.py`
   - computes per-row reliability signals for semantic, structural, and temporal views
   - converts these to softmax weights and applies static quality multipliers

10. `src/detection/threshold.py`
   - computes a rolling median/MAD threshold
   - flags rows above threshold as anomalies
   - computes severity score and severity bucket

11. `src/evaluation/metrics.py`
   - evaluates on the held-out test period using label information from `df["label"]`

12. `src/rca/*`
   - groups anomalies into incidents by time proximity
   - maps component co-occurrence patterns
   - ranks likely root causes inside each incident

13. `dashboard/app.py`
   - visualizes the results in a Streamlit dashboard

---

## 3) File-by-file explanation

### `src/ingest.py`

Purpose:
- load raw BGL log data from a text file into a Pandas DataFrame
- clean the raw data enough to produce a consistent table for later stages

Important logic:
- the raw BGL format is split by whitespace, with a cap of 9 splits so the final message stays intact in `content`
- malformed rows are skipped if they do not have the minimum required fields
- invalid `timestamp`, `time`, and `content` values are dropped
- rows with empty content are ignored
- extremely malformed values in `level` are explicitly removed
- rows are sorted by `time` after cleaning

The file produces a cleaned dataframe that is later saved as a parquet file.

### `src/parse.py`

Purpose:
- mine templates from raw log content

Important logic:
- calls `TemplateMiner` from Drain3
- for each log message, it gets a `cluster_id`, mined `template`, and extracted parameter values
- appends a `template_id`, `template`, and `params` to the dataframe

This creates the canonical event representation: each log line is now associated with a template class and extracted parameters.

### `src/features/semantic.py`

Purpose:
- convert template text into vector embeddings using SentenceTransformer

Important logic:
- uses the model `all-MiniLM-L6-v2`
- groups by `template_id` rather than raw `template` text to keep semantics consistent over time
- maps each unique template to an embedding
- returns one embedding per row by looking up the row's `template_id`

This creates a semantic representation for the log event stream.

### `src/features/structural.py`

Purpose:
- create a structural feature table for anomaly detection

Important logic:
- keeps `template_id`, `param_count`, and ordinal severity mapping for `level`
- keeps `component` and `type`
- computes `template_global_freq` from training data only, which is a deliberate fix to avoid leaking future information into the feature set

This is the view that captures whether an event looks structurally unusual compared with the training distribution.

### `src/features/temporal.py`

Purpose:
- create time-aware features for burstiness and sequence behavior

Important logic:
- `time_since_prev`: seconds since previous event
- `rolling_freq`: event count in a rolling time window
- `burst_rate`: how many events happened within 1 second in a short preceding window
- `template_novelty`: whether a template is new or repeated
- `transition_prob`: empirical probability of moving from one template to the next
- `rolling_entropy`: diversity of recent template types
- `repeated_event_ratio`: how many recent events match the current template

This is the temporal anomaly view and directly captures bursty or highly repetitive patterns in log sequences.

---

## 4) Detection modules

### `src/detection/split.py`

Purpose:
- create a chronological train/validation/test split

Important logic:
- uses chronological ordering, not random shuffling
- the split is stored in `split_indices.json` with `train_end_idx` and `val_end_idx`

This matters because the project is designed to mimic real-world deployment where future data should not be used to fit the model.

### `src/detection/semantic_scoring.py`

Purpose:
- compute a semantic anomaly score using cluster prototypes

Important logic:
- fits `MiniBatchKMeans` on training embeddings
- computes cosine similarity between each embedding and cluster centers
- `score = 1 - max_similarity`

A row is more anomalous if it is far from the learned semantic prototype distribution.

### `src/detection/structural_scoring.py`

Purpose:
- compute a structural anomaly score using encoded features

Important logic:
- encodes numeric columns and one-hot categorical columns
- fits `IsolationForest` on training data
- fits `LocalOutlierFactor` on a subsample of the training set to reduce compute cost
- combines the two model outputs by normalizing and averaging them

This produces the structural anomaly signal.

### `src/detection/temporal_scoring.py`

Purpose:
- compute a temporal anomaly score using HMM plus frequency-based z-score

Important logic:
- maps template IDs to integer states for the HMM
- fits a `CategoricalHMM` on training template sequences
- scores rolling chunks of template IDs using log-likelihood
- after normalization, combines this with `rolling_zscore` on event frequency

This gives a temporal anomaly estimate based on sequence rarity and bursty frequency behavior.

### `src/detection/reliability.py`

Purpose:
- estimate how trustworthy each view is for a given row

Important logic:
- `semantic_reliability`: based on how close the sample is to nearby prototype centers
- `structural_reliability`: based on how common the template is in training data
- `temporal_reliability`: based on inverse recent variance in event frequency
- `softmax_weights`: turns reliability signals into normalized weights
- `apply_quality_multiplier`: applies static multipliers to tune the contribution of each view
- `fuse_scores`: weighted combination of the three anomaly score arrays

This is the part that blends the views into one final anomaly signal.

### `src/detection/threshold.py`

Purpose:
- decide which rows are anomalous and how severe they are

Important logic:
- `rolling_mad_threshold` uses a rolling median and rolling MAD to adapt the threshold over time
- `is_anomaly = scores > threshold`
- severity is computed as a weighted combination of:
  - final score
  - temporal persistence
  - rolling frequency
  - rarity of the template in the training distribution

The output is:
- `is_anomaly.npy`
- `severity_score.npy`
- `severity_bucket.npy`

---

## 5) Evaluation and evidence modules

### `src/evaluation/metrics.py`

Purpose:
- compute test-set metrics

Important logic:
- uses `label != "-"` as the anomaly label on the held-out test rows
- computes precision, recall, F1, AUC-ROC, and AUC-PR
- writes `test_metrics.json`

This is the main quantitative evaluation step.

### `src/evaluation/threshold_sweep.py`

Purpose:
- tune the MAD threshold parameter `lam`

Important logic:
- computes the rolling median/MAD once
- sweeps several values of `lam` to compare precision, recall, and F1

This helps choose the anomaly threshold rather than hard-coding it.

### `src/evidence.py`

Purpose:
- build a localized explanation for a flagged anomaly

Important logic:
- `nearest_normal_example`: finds the nearest non-anomalous event in the same template class when possible
- `preceding_sequence`: shows the last few events before the anomaly
- `build_evidence_package`: bundles information for explaining why a row was flagged

This is used to make anomaly explanations more interpretable.

---

## 6) Root-cause analysis modules

### `src/rca/incident_clustering.py`

Purpose:
- group flagged anomalies into incidents by time proximity

Important logic:
- sorts anomalies by time
- creates a new incident when the time gap exceeds `10 minutes` by default
- writes `incident_ids.parquet`

### `src/rca/cooccurrence.py`

Purpose:
- detect which components commonly appear together in incidents

Important logic:
- for each incident, it takes the set of components involved
- forms pairwise combinations
- counts how often each pair co-occurs across incidents

This produces a co-occurrence matrix used in later root-cause ranking.

### `src/rca/template_grouping.py`

Purpose:
- summarize each incident as a signature of template counts and involved components

Important logic:
- groups anomalies by `incident_id`
- stores number of anomalies, distinct templates, component list, and time range
- writes `incident_signatures.parquet`

### `src/rca/rank_root_cause.py`

Purpose:
- rank the most likely root-cause component within each incident

Important logic:
- combines:
  - first-occurrence timing
  - average severity
  - in-cluster frequency
  - component centrality from co-occurrence data
- normalizes each factor and computes a weighted root-cause score
- writes rankings for later dashboard display

This is not a causal graph model; it is a heuristic ranking based on event patterns.

---

## 7) Dashboard

### `dashboard/app.py`

Purpose:
- visualize anomaly results and incident summaries in a Streamlit dashboard

Important logic:
- loads processed parquet files and numpy arrays
- shows:
  - total lines processed
  - anomaly count
  - metrics such as AUC-ROC and recall
  - anomaly timeline by day and severity
  - per-component anomaly counts
  - recent incident cards
  - ranked root-cause candidates

This is a reporting layer on top of the already computed results.

---

## 8) Full project summary in one flow

The project is a pipeline for detecting unusual log events in BGL data using three different views of the same event stream.

- Raw log lines become a structured table.
- The log lines are abstracted into templates.
- Template-level semantics, statistical structure, and time patterns are extracted.
- Each view is scored separately.
- The scores are fused with reliability weighting.
- A rolling threshold turns the fused score into binary anomaly labels.
- Severity, evaluation, incident grouping, and root-cause ranking are applied afterward.
- The results are visualized in a dashboard.

The project is clearly designed as an experimental research pipeline rather than a production-ready monitoring system. The code includes explicit notes and fixes around observed issues such as leakage, repeated-work heuristics, and computational constraints.

---

## 9) Most important implementation details

These are the concrete things the code is doing that matter most for understanding the project:

- chronological split is enforced to avoid time leakage
- structural frequency is intentionally computed only from training rows
- semantic embeddings are computed per template ID, not raw template text
- HMM temporal detection uses template sequence scores and frequency deviation
- anomaly threshold is dynamic and based on rolling median/MAD rather than a fixed absolute score
- final output includes not only labels but severity and evidence packages
- incident grouping is time-based and root-cause ranking is heuristic, not a causal dependency model

---

## 10) Practical interpretation

If you read the code as a whole, the system is trying to answer:

"Given a raw log event stream, which events look abnormal relative to past behavior, and what is the likely root cause or pattern behind them?"

The answer is reached by combining multiple signal types:

- semantic meaning of the event
- structural rarity of the event template and component
- time-based burstiness and sequence abnormality

This is the overall philosophy of the project.
