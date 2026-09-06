from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, fields, is_dataclass
from enum import Enum
from pathlib import Path
from typing import cast

from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
)
from mold_generator_engine.models.issues import IssueSeverity

GENERATION_READINESS_REPORT_SCHEMA_VERSION = "1.0"


class GenerationReadinessStatus(Enum):
    """Final Chapter 9 hand-off status for Chapter 10 generation."""

    READY = "ready"
    READY_WITH_WARNINGS = "ready_with_warnings"
    BLOCKED = "blocked"


@dataclass(frozen=True, slots=True)
class GenerationReadinessFinding:
    """Compact blocker or warning carried by the Chapter 9 final contract."""

    code: str
    source: str
    severity: IssueSeverity
    message: str
    is_blocking: bool = False
    metadata: dict[str, object] = field(default_factory=dict, hash=False)


@dataclass(frozen=True, slots=True)
class PullDirectionReadiness:
    """Selected pull direction and confidence evidence for generation."""

    status: str
    candidate_id: str | None
    direction: Vector3D | None
    decisiveness: str | None
    score: float | None
    confidence: float
    warning_codes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class DraftOrientationReadiness:
    """Draft and face-orientation data needed before mold generation."""

    status: str
    evaluated_surface_area_ratio: float
    insufficient_draft_area_ratio: float
    near_zero_draft_area_ratio: float
    face_count_by_surface_type: dict[str, int] = field(default_factory=dict)
    face_count_by_adequacy: dict[str, int] = field(default_factory=dict)
    warning_codes: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class UndercutIndicator:
    """Generation-oriented indicator for one external undercut region."""

    region_id: str
    source: str
    face_count: int
    area_ratio: float
    confidence: float
    severity: str | None = None
    treatment_requirement: str | None = None
    is_blocking: bool = False
    requires_manual_review: bool = False


@dataclass(frozen=True, slots=True)
class PartingStrategyReadiness:
    """Ranked preliminary parting strategy evidence for Chapter 10."""

    candidate_id: str
    rank: int
    strategy_type: str
    status: str
    score: float
    confidence: float
    pull_direction: Vector3D | None
    generation_mode: str
    core_target_ids: tuple[str, ...] = ()
    warning_codes: tuple[str, ...] = ()
    blocker_codes: tuple[str, ...] = ()
    requires_manual_review: bool = False


@dataclass(frozen=True, slots=True)
class CoreCavityReadiness:
    """Minimal core/cavity readiness facts derived from cavity analysis."""

    handling_required: bool
    decision_outcome: str | None
    target_ids: tuple[str, ...]
    confidence: float
    blocker_codes: tuple[str, ...] = ()
    warning_codes: tuple[str, ...] = ()
    source_references: tuple[str, ...] = ()


@dataclass(frozen=True, slots=True)
class Chapter9GenerationContract:
    """Final Chapter 9 generation-oriented data contract for Chapter 10."""

    pull_direction: PullDirectionReadiness
    draft_orientation: DraftOrientationReadiness
    undercut_indicators: tuple[UndercutIndicator, ...]
    parting_strategies: tuple[PartingStrategyReadiness, ...]
    core_cavity_readiness: CoreCavityReadiness
    selected_parting_strategy_id: str | None
    confidence: float


@dataclass(frozen=True, slots=True)
class GenerationReadinessReport:
    """Final Chapter 9 report that prepares stable inputs for Chapter 10."""

    status: GenerationReadinessStatus
    source: ImportAnalysisSource
    summary: str
    chapter_2_status: ImportAnalysisReportStatus
    chapter_3_status: str
    chapter_4_status: str
    contract: Chapter9GenerationContract
    blockers: tuple[GenerationReadinessFinding, ...] = ()
    warnings: tuple[GenerationReadinessFinding, ...] = ()
    schema_version: str = GENERATION_READINESS_REPORT_SCHEMA_VERSION

    def to_dict(self) -> dict[str, object]:
        """Return a serialization-safe representation of the readiness report."""
        return cast(dict[str, object], _serialize_value(self))


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
            _serialize_mapping_key(key): _serialize_value(mapped_value)
            for key, mapped_value in value.items()
        }

    if isinstance(value, Sequence) and not isinstance(value, (str, bytes, bytearray)):
        return [_serialize_value(item) for item in value]

    return value


def _serialize_mapping_key(value: object) -> str:
    serialized_value = _serialize_value(value)
    if isinstance(serialized_value, str):
        return serialized_value

    return str(serialized_value)
