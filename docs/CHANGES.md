# Changes to the requirements

FR-3, FR-5 and FR-23 to FR-25 (exploratory data analysis and evaluation against
labels) moved to the research track in `research/`. The application no longer
reads labels or reports accuracy figures. The SRS itself is unchanged.

Path changes: `src/` is now `engine/`; experiment-only code, notebooks and the
Streamlit dashboard are under `research/`; `PRODUCT.md`, `DESIGN.md` and the
reference images are under `design/`.

## This session

Fixes
- `requirements.txt` was a mix of UTF-16 and UTF-8. It is now clean UTF-8, one pinned package per line, with the 22 notebook-only packages removed (nothing in `backend/` or `engine/` imports them).
- `backend/scripts/verify_detectors.py` now reads `distinct_texts_embedded` and says "distinct line texts embedded".
- Severity buckets are now quantiles among flagged lines: bottom 50% LOW, 50-85% MEDIUM, 85-98% HIGH, top 2% CRITICAL. `severity_score` is unchanged. HIGH is now reachable.
- `raw_rows` now counts the non-empty lines of the file, so lines without a message show as skipped. The Overview tile reads "Readable lines" and shows "X lines skipped (no message)" when some were dropped.
- Temporal view: a window with a template unseen in training now gets the highest finite score so far (or the 99th percentile of computed scores if none yet) instead of reusing the previous score. Unit test added in `backend/tests/test_detection.py`, with a test for the severity buckets.
- Removed dead frontend code: `Sparkline`, `reactbits/CountUp.tsx`, `RANKING_FACTORS`, `listRuns`, the `.spark` style.

Interface
- Navbar wordmark is now the favicon drawn inline (same bars, `#7F011F` / `#F5EBD0`), 32px so it is crisp at 1x and 2x, centred with the nav links, bars only at 416px and below, with a focus ring. Hover: a stripe sweeps across the bars once and the text deepens.
- Root-cause map: incident dots settle in after their circle grows, the hovered cluster lifts (scale 1.04 + shadow) while others dim, clusters are keyboard-focusable (Enter opens the largest incident), and the tooltip flips below near the top edge. Reference links are in the header comment of `ClusterMap.tsx`.
- Incident detail has a "How this root cause was chosen" strip: the four real steps of `engine/rca` with the incident's own numbers, and each top candidate's four normalised factors as bars. Hovering a step highlights the bars it feeds.
- Views page has a "Drift check" panel; with one window or none flagged it says the run is too short to judge drift.
- Hover and focus: KPI tiles lift, bar rows and severity key rows highlight, severity ring slices highlight and dim the rest, buttons and nav links have consistent transitions and focus rings. All of it is off under `prefers-reduced-motion`.
- Semantic view wording now matches `docs/SEMANTIC_VIEW_NOTE.md` (per-line text, weights measured without labels).

Docs
- README and backend README: `/score-timeline`, `/baseline`, `/root-cause-clusters` in the API table, a Results section, and corrected notes on view quality and severity buckets.

## Feature-level explanations and report metadata

- New `engine/explain.py`: SHAP on the Isolation Forest (structural), robust-z deviations against the learning window (temporal), closest learning-window message per KMeans prototype (semantic).
- `stages.score_structural` also returns the encoder and encoded matrix; `build_evidence` adds `structural_shap`, `temporal_deviations`, `semantic_prototype` to each evidence package (JSON only, no schema change). Imported runs have none of these.
- `shap==0.49.1` added to `requirements.txt`.
- Explanation panel: "What drove it" block under the waterfall; the heading now names the view with the largest Shapley bar.
- Summary sheet is now "Anomaly Report": metadata header, view contribution, drift check and parameters sections, "Copy run ID", A4 print CSS with a running footer. JSON download uses a metadata envelope and the file name `logsight-report-run<id>-<YYYYMMDD-HHmm>.json`. The JSON is built in the frontend; no new endpoint.
- Source file name is not stored by the backend, so the report shows the run name and source kind (upload or import).
