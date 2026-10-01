"""Prove that a run's anomaly scores come from the detectors, fitted on that log.

Runs the real pipeline on one or more raw logs with every detector watched,
then checks two things for each log:

1. Each detector was actually fitted, and on rows of this log.
2. Each score can be rebuilt from that detector's own output:
     semantic   = 1 - highest cosine similarity to a KMeans prototype
     structural = mean of scaled Isolation Forest and LOF outlier scores
     temporal   = mean of scaled HMM sequence score and rolling z-score
     final      = sum over views of (score x reliability weight)

Nothing is written to the database. From the backend folder:

    ..\\.venv\\Scripts\\python.exe -m scripts.verify_detectors <log> [<log> ...]
"""
import argparse
import functools
import sys
from contextlib import ExitStack, contextmanager
from pathlib import Path

import numpy as np

from app.core.logging import configure_logging
from app.core.pipeline_config import load_pipeline_config
from app.pipeline import stages
from app.pipeline.experiment import _module
from app.pipeline.runner import run_pipeline


class Watch:
    """Records calls to detector methods and keeps their outputs."""

    def __init__(self) -> None:
        self.fits: dict[str, tuple[int, ...]] = {}
        self.outputs: dict[str, np.ndarray] = {}
        self.calls: dict[str, int] = {}

    @contextmanager
    def method(self, owner, name: str, label: str, keep_output: bool = False):
        original = getattr(owner, name)

        @functools.wraps(original)
        def spy(*args, **kwargs):
            result = original(*args, **kwargs)
            self.calls[label] = self.calls.get(label, 0) + 1
            data = next((a for a in args if hasattr(a, "shape")), None)
            if name == "fit" and data is not None:
                self.fits[label] = tuple(data.shape)
            if keep_output:
                self.outputs[label] = np.asarray(result)   # the last call is the full-log one
            return result

        setattr(owner, name, spy)
        try:
            yield
        finally:
            setattr(owner, name, original)


def scale(values: np.ndarray) -> np.ndarray:
    return (values - values.min()) / (values.max() - values.min() + stages._RANGE_EPSILON)


def verify(path: Path) -> bool:
    from hmmlearn.hmm import CategoricalHMM
    from sklearn.cluster import MiniBatchKMeans
    from sklearn.ensemble import IsolationForest
    from sklearn.neighbors import LocalOutlierFactor

    semantic = _module("engine.detection.semantic_scoring")
    temporal = _module("engine.detection.temporal_scoring")
    watch = Watch()
    with ExitStack() as stack:
        for owner, name, label, keep in [
            (MiniBatchKMeans, "fit", "KMeans prototypes", False),
            (semantic, "cosine_similarity", "cosine similarity", True),
            (IsolationForest, "fit", "Isolation Forest", False),
            (IsolationForest, "decision_function", "Isolation Forest scores", True),
            (LocalOutlierFactor, "fit", "Local Outlier Factor", False),
            (LocalOutlierFactor, "decision_function", "LOF scores", True),
            (CategoricalHMM, "fit", "Hidden Markov Model", False),
            (CategoricalHMM, "score", "HMM window scores", False),
            (temporal, "hmm_sequence_score", "HMM sequence score", True),
            (temporal, "rolling_zscore", "rolling z-score", True),
        ]:
            stack.enter_context(watch.method(owner, name, label, keep))
        result = run_pipeline(path, load_pipeline_config(), lambda stage: None)

    rows = len(result.events)
    train = result.train_end_idx
    print(f"\n=== {path.name} ===")
    print(f"{rows:,} lines, {result.detectors['semantic']['templates_embedded']} templates, "
          f"{int(result.is_anomaly.sum()):,} flagged, training on the first {train:,} lines")

    print("\nDetectors fitted on this log (rows x features):")
    for label in ("KMeans prototypes", "Isolation Forest", "Local Outlier Factor", "Hidden Markov Model"):
        shape = watch.fits.get(label)
        print(f"  {label:<22} {'NOT FITTED' if shape is None else ' x '.join(f'{n:,}' for n in shape)}")
    print(f"  {'HMM window scores':<22} {watch.calls.get('HMM window scores', 0):,} sequence windows scored")

    sequence = np.nan_to_num(watch.outputs["HMM sequence score"], nan=0.0, posinf=0.0, neginf=0.0)
    views = np.stack([result.scores.semantic, result.scores.structural, result.scores.temporal], axis=1)
    checks = {
        "KMeans fitted on the training lines": watch.fits.get("KMeans prototypes", (0,))[0] == train,
        "Isolation Forest fitted on the training lines": watch.fits.get("Isolation Forest", (0,))[0] == train,
        "LOF fitted on training lines only": 0 < watch.fits.get("Local Outlier Factor", (0,))[0] <= train,
        "HMM fitted on the training lines": watch.fits.get("Hidden Markov Model", (0,))[0] == train,
        "semantic score = 1 - max cosine similarity to a prototype": np.allclose(
            result.scores.semantic, 1 - watch.outputs["cosine similarity"].max(axis=1), atol=1e-6),
        "structural score = mean of scaled Isolation Forest and LOF": np.allclose(
            result.scores.structural,
            (scale(-watch.outputs["Isolation Forest scores"]) + scale(-watch.outputs["LOF scores"])) / 2),
        "temporal score = mean of scaled HMM score and |rolling z-score|": np.allclose(
            result.scores.temporal,
            (scale(sequence) + scale(np.abs(watch.outputs["rolling z-score"]))) / 2),
        "final score = sum of score x weight over the three views": np.allclose(
            result.final_scores, (views * result.weights).sum(axis=1)),
        "weights of the three views add up to 1 on every line": np.allclose(result.weights.sum(axis=1), 1.0),
    }
    print("\nChecks:")
    for name, passed in checks.items():
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}")
    return all(checks.values())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("logs", nargs="+", type=Path, help="raw log files to run")
    args = parser.parse_args()
    configure_logging()
    results = [verify(path.resolve()) for path in args.logs]
    print(f"\n{sum(results)} of {len(results)} logs passed every check.")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
