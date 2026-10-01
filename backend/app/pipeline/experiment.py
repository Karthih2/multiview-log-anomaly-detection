"""Bridge to the experiment code in ``<experiment_root>/engine``.

This is the only module that imports from ``engine``. The experiment files are
used exactly as they are; nothing in them is copied or modified. Imports are
lazy because several of them pull in torch / sentence-transformers, which the
API process should not load until a pipeline run actually needs them.
"""
import importlib
import sys
from functools import lru_cache
from typing import Any, Callable

from app.core.config import get_settings

# Config section -> "module:function" whose keyword defaults that section overrides.
PARAMETER_SOURCES: dict[str, str] = {
    "split": "engine.detection.split:chronological_split",
    "semantic_features": "engine.features.semantic:build_semantic_features",
    "temporal_features": "engine.features.temporal:build_temporal_features",
    "semantic_scoring": "engine.detection.semantic_scoring:fit_semantic_prototypes",
    "structural_scoring": "engine.detection.structural_scoring:fit_structural_detectors",
    "temporal_hmm": "engine.detection.temporal_scoring:fit_hmm",
    "temporal_sequence": "engine.detection.temporal_scoring:hmm_sequence_score",
    "temporal_frequency": "engine.detection.temporal_scoring:rolling_zscore",
    "reliability_semantic": "engine.detection.reliability:semantic_reliability",
    "reliability_temporal": "engine.detection.reliability:temporal_reliability",
    "threshold": "engine.detection.threshold:rolling_mad_threshold",
    "drift_windows": "engine.detection.drift:windowed_ks_drift",
    "drift_control": "engine.detection.drift:random_shuffle_control_test",
    "incidents": "engine.rca.incident_clustering:cluster_incidents",
}


@lru_cache
def _module(name: str):
    root = str(get_settings().experiment_root)
    if root not in sys.path:
        sys.path.insert(0, root)
    return importlib.import_module(name)


def fn(path: str) -> Callable[..., Any]:
    """Resolve ``"engine.package.module:function"`` to the experiment function."""
    module_name, attr = path.split(":")
    return getattr(_module(module_name), attr)


def section_fn(section: str) -> Callable[..., Any]:
    return fn(PARAMETER_SOURCES[section])


def view_names() -> list[str]:
    """View order used by the experiment's fusion (semantic, structural, temporal)."""
    return list(_module("engine.detection.reliability").VIEW_QUALITY_MULTIPLIER)
