from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from pathlib import Path
from typing import cast

from mold_generator_engine.geometry.model_statistics import ModelStatistics
from mold_generator_engine.models.imported_model import (
    GeometryValidationResult,
    TopologyValidationResult,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityAssessment,
)
from mold_generator_engine.models.issues import ModelIssue
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
)

IMPORT_ANALYSIS_REPORT_SCHEMA_VERSION = "1.0"


class ImportAnalysisReportStatus(Enum):
    """Final orchestration status for the unified import-analysis report."""

    READY = "ready"
    READY_WITH_WARNINGS = "ready_with_warnings"
    REQUIRES_REPAIR = "requires_repair"
    UNSUITABLE = "unsuitable"
    ANALYSIS_INCOMPLETE = "analysis_incomplete"
    IMPORT_FAILED = "import_failed"


@dataclass(frozen=True, slots=True)
class ImportAnalysisSource:
    """Source file information carried by the unified report."""

    source_name: str
    source_path: str
    file_format: str | None = None


@dataclass(frozen=True, slots=True)
class ImportAnalysisReport:
    """Unified report for importing and analyzing a single 3D model."""

    status: ImportAnalysisReportStatus
    source: ImportAnalysisSource
    import_succeeded: bool
    analysis_completed: bool
    summary: str
    issue_counts: IssueSeverityCounts
    warnings: tuple[ModelIssue, ...] = ()
    errors: tuple[ModelIssue, ...] = ()
    geometry_validation: GeometryValidationResult | None = None
    topology_validation: TopologyValidationResult | None = None
    statistics: ModelStatistics | None = None
    processing_decision: ModelProcessingDecision | None = None
    initial_moldability_assessment: InitialMoldabilityAssessment | None = None
    model_metadata: dict[str, object] = field(default_factory=dict)
    schema_version: str = IMPORT_ANALYSIS_REPORT_SCHEMA_VERSION

    @property
    def is_ready_for_processing(self) -> bool:
        """Return whether the current report allows further processing."""
        if self.processing_decision is None:
            return False

        return self.processing_decision.is_processable

    def to_dict(self) -> dict[str, object]:
        """Return a serialization-safe representation of the report."""
        serialized_report = _serialize_value(self)
        return cast(dict[str, object], serialized_report)


def _serialize_value(value: object) -> object:
    if isinstance(value, Enum):
        return value.value

    if isinstance(value, Path):
        return str(value)

    if is_dataclass(value):
        return {
            data_field.name: _serialize_value(getattr(value, data_field.name))
            for data_field in fields(value)
        }

    if isinstance(value, Mapping):
        return {
            str(key): _serialize_value(mapped_value)
            for key, mapped_value in value.items()
        }

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_serialize_value(item) for item in value]

    return value
