"""Loads ``config/pipeline.yaml`` and resolves it against the experiment code."""
import inspect
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

from app.core.config import get_settings
from app.pipeline import experiment

BACKEND_SECTIONS = ("evidence", "evaluation")


@dataclass(frozen=True)
class PipelineConfig:
    sections: dict[str, dict[str, Any]]

    def overrides(self, section: str) -> dict[str, Any]:
        """Keyword arguments to pass on top of the experiment function's defaults."""
        return {k: v for k, v in self.sections.get(section, {}).items() if v is not None}

    def backend(self, section: str) -> dict[str, Any]:
        return self.sections[section]

    def effective(self) -> dict[str, dict[str, Any]]:
        """Values actually in effect: experiment defaults with overrides applied."""
        resolved: dict[str, dict[str, Any]] = {}
        for section in experiment.PARAMETER_SOURCES:
            defaults = _signature_defaults(section)
            unknown = set(self.sections.get(section, {})) - set(defaults)
            if unknown:
                raise ValueError(
                    f"pipeline config section '{section}' has parameters the "
                    f"experiment function does not accept: {sorted(unknown)}"
                )
            resolved[section] = {**defaults, **self.overrides(section)}
        for section in BACKEND_SECTIONS:
            resolved[section] = dict(self.sections[section])
        return resolved


def _signature_defaults(section: str) -> dict[str, Any]:
    signature = inspect.signature(experiment.section_fn(section))
    return {
        name: param.default
        for name, param in signature.parameters.items()
        if param.default is not inspect.Parameter.empty
    }


def load_pipeline_config(path: Path | None = None) -> PipelineConfig:
    path = path or get_settings().pipeline_config_path
    with open(path, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    missing = [s for s in BACKEND_SECTIONS if s not in raw]
    if missing:
        raise ValueError(f"pipeline config {path} is missing sections: {missing}")
    unknown = set(raw) - set(experiment.PARAMETER_SOURCES) - set(BACKEND_SECTIONS)
    if unknown:
        raise ValueError(f"pipeline config {path} has unknown sections: {sorted(unknown)}")
    return PipelineConfig(sections={k: dict(v or {}) for k, v in raw.items()})
