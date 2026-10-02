# Semantic view: what was wrong and what changed

## What was wrong
1. One embedding per template, copied to every line that shares it. The score could not tell two lines of one template apart.
2. The score only fired on templates unseen in training (192 distinct scores across 50,000 lines).
3. `VIEW_QUALITY_MULTIPLIER["semantic"] = 0.2` was hard-coded, which kept semantic near 12% of the weight.
4. That multiplier was derived from labelled test AUC, which conflicts with the spec's "no labeled data".

## What changed
- `engine/features/semantic.py`: embeds each distinct line's own text (`per_line=True`). Past `max_unique_lines`
  (200,000 distinct texts) it falls back to one vector per template. Both are settable in `backend/config/pipeline.yaml`.
- `engine/detection/reliability.py`: the constants are neutral (1.0). `view_quality_from_scores` measures each
  view's quality from the unlabelled learning window (99th minus 50th percentile of its own scores, scaled to
  the best view, floor 0.1). No labels are read.
- `backend/app/pipeline/stages.py` and `runner.py`: fusion passes the learning-window scores to that function.

## Result on the same file (BGL sample 1 of 5, 50,000 lines)
| | Before (run 5) | After (run 16) |
|---|---|---|
| Weights semantic / structural / temporal | 11.8 / 69.3 / 19.0 | 38.2 / 40.7 / 21.1 |
| Flags each view drove | 0 / 3,294 / 4,485 | 3,208 / 2,065 / 3,707 |
| Distinct semantic scores | 192 | 21,111 |
| Flagged lines | 7,779 | 8,980 |

## Notes
- Only new runs use this. Runs made before the change keep their old numbers.
- Flagged lines rose by about 15%. With no labels in the app, this shows the view is active, not that detection is
  more accurate. Check accuracy in the research track.
- Per-line embedding costs time: about 40 seconds for 21,000 distinct lines on CPU.
