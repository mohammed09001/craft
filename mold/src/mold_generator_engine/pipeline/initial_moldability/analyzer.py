from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from math import isfinite

from mold_generator_engine.config.geometry import DEFAULT_LINEAR_TOLERANCE_MM
from mold_generator_engine.models.imported_model import ImportedModel
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityAssessment,
    InitialMoldabilityFinding,
    InitialMoldabilityFindingCode,
    InitialMoldabilityStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.processing_suitability import (
    ModelProcessingStatus,
)


@dataclass(frozen=True, slots=True)
class InitialMoldabilityAnalyzer:
    """Evaluate whether an imported model is ready for later mold analysis.

    The analyzer reuses existing import diagnostics, topology facts, and
    statistics. It does not re-read source files and does not run advanced mold
    algorithms such as draft-angle or undercut analysis.
    """

    near_zero_extent_tolerance_mm: float = DEFAULT_LINEAR_TOLERANCE_MM

    def evaluate_model(
        self,
        model: ImportedModel,
    ) -> InitialMoldabilityAssessment:
        """Return a deterministic preliminary assessment for the given model."""
        findings = self._collect_findings(model)
        status = self._resolve_status(model, findings)

        return InitialMoldabilityAssessment(
            status=status,
            is_assessable=status is not InitialMoldabilityStatus.NOT_ASSESSABLE,
            is_ready_for_detailed_analysis=(
                status is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
            ),
            summary=_summary_for_status(status),
            recommended_next_step=_recommended_next_step_for_status(status),
            findings=self._sort_findings(findings),
        )

    def _collect_findings(
        self,
        model: ImportedModel,
    ) -> list[InitialMoldabilityFinding]:
        findings: list[InitialMoldabilityFinding] = []
        processing_decision = model.processing_decision

        if not model.vertices or not model.faces:
            findings.append(
                InitialMoldabilityFinding(
                    code=InitialMoldabilityFindingCode.MISSING_GEOMETRY,
                    severity=IssueSeverity.CRITICAL,
                    message="Imported model does not contain usable mesh geometry.",
                    metadata={
                        "vertex_count": len(model.vertices),
                        "face_count": len(model.faces),
                    },
                )
            )

        if model.statistics is None:
            findings.append(
                InitialMoldabilityFinding(
                    code=InitialMoldabilityFindingCode.MISSING_REQUIRED_ANALYSIS_DATA,
                    severity=IssueSeverity.CRITICAL,
                    message=(
                        "Initial moldability assessment requires basic model "
                        "statistics from the import pipeline."
                    ),
                )
            )
        else:
            non_finite_fields = _collect_non_finite_fields(model)
            if non_finite_fields:
                findings.append(
                    InitialMoldabilityFinding(
                        code=InitialMoldabilityFindingCode.NON_FINITE_MODEL_DATA,
                        severity=IssueSeverity.CRITICAL,
                        message=(
                            "Initial moldability assessment requires finite "
                            "dimensions and statistics."
                        ),
                        metadata={"fields": non_finite_fields},
                    )
                )

            near_zero_axes = _collect_near_zero_axes(
                model,
                tolerance=self.near_zero_extent_tolerance_mm,
            )
            if near_zero_axes:
                findings.append(
                    InitialMoldabilityFinding(
                        code=InitialMoldabilityFindingCode.ZERO_OR_NEAR_ZERO_EXTENT,
                        severity=IssueSeverity.ERROR,
                        message=(
                            "Model has one or more near-zero extents and is not "
                            "a meaningful 3D solid for mold analysis."
                        ),
                        metadata={
                            "axes": near_zero_axes,
                            "tolerance_mm": self.near_zero_extent_tolerance_mm,
                            "dimensions_mm": {
                                "x": model.dimensions.x,
                                "y": model.dimensions.y,
                                "z": model.dimensions.z,
                            },
                        },
                    )
                )

        topology_analysis = model.topology_validation.analysis
        if topology_analysis is not None and topology_analysis.boundary_edges:
            findings.append(
                InitialMoldabilityFinding(
                    code=InitialMoldabilityFindingCode.OPEN_MESH,
                    severity=IssueSeverity.ERROR,
                    message=(
                        "Model mesh is open and should be repaired before "
                        "advanced mold analysis."
                    ),
                    metadata={
                        "boundary_edge_count": len(topology_analysis.boundary_edges)
                    },
                )
            )

        if topology_analysis is not None and topology_analysis.non_manifold_edges:
            findings.append(
                InitialMoldabilityFinding(
                    code=InitialMoldabilityFindingCode.NON_MANIFOLD_TOPOLOGY,
                    severity=IssueSeverity.CRITICAL,
                    message=(
                        "Model contains non-manifold topology that prevents a "
                        "reliable preliminary assessment."
                    ),
                    metadata={
                        "non_manifold_edge_count": len(
                            topology_analysis.non_manifold_edges
                        )
                    },
                )
            )

        geometry_issue_codes = tuple(
            issue.code
            for issue in (
                *model.geometry_validation.warnings,
                *model.geometry_validation.errors,
            )
            if issue.severity in model.geometry_validation.blocking_severities
        )
        if geometry_issue_codes:
            findings.append(
                InitialMoldabilityFinding(
                    code=InitialMoldabilityFindingCode.CRITICAL_GEOMETRY_ISSUES,
                    severity=IssueSeverity.ERROR,
                    message=(
                        "Model contains geometry issues that must be repaired "
                        "before advanced mold analysis."
                    ),
                    metadata={"issue_codes": geometry_issue_codes},
                )
            )

        if processing_decision.status is ModelProcessingStatus.REJECTED:
            findings.append(
                InitialMoldabilityFinding(
                    code=InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED,
                    severity=IssueSeverity.CRITICAL,
                    message=(
                        "Current import diagnostics reject the model for the "
                        "present processing path."
                    ),
                    metadata={
                        "processing_status": processing_decision.status.value,
                        "blocking_issue_codes": tuple(
                            issue.code for issue in processing_decision.blocking_issues
                        ),
                    },
                )
            )

        if not findings:
            findings.append(
                InitialMoldabilityFinding(
                    code=(
                        InitialMoldabilityFindingCode.READY_FOR_ADVANCED_MOLD_ANALYSIS
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "Model is preliminarily ready to enter advanced mold "
                        "analysis stages."
                    ),
                )
            )

        return findings

    @staticmethod
    def _resolve_status(
        model: ImportedModel,
        findings: Sequence[InitialMoldabilityFinding],
    ) -> InitialMoldabilityStatus:
        if any(
            finding.code
            in {
                InitialMoldabilityFindingCode.MISSING_GEOMETRY,
                InitialMoldabilityFindingCode.MISSING_REQUIRED_ANALYSIS_DATA,
                InitialMoldabilityFindingCode.NON_FINITE_MODEL_DATA,
                InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED,
                InitialMoldabilityFindingCode.NON_MANIFOLD_TOPOLOGY,
            }
            for finding in findings
        ):
            return InitialMoldabilityStatus.NOT_ASSESSABLE

        if any(
            finding.code is InitialMoldabilityFindingCode.ZERO_OR_NEAR_ZERO_EXTENT
            for finding in findings
        ):
            return InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE

        if (
            model.processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
            or any(
                finding.code
                in {
                    InitialMoldabilityFindingCode.OPEN_MESH,
                    InitialMoldabilityFindingCode.CRITICAL_GEOMETRY_ISSUES,
                }
                for finding in findings
            )
        ):
            return InitialMoldabilityStatus.REQUIRES_REPAIR

        return InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS

    @staticmethod
    def _sort_findings(
        findings: Sequence[InitialMoldabilityFinding],
    ) -> tuple[InitialMoldabilityFinding, ...]:
        return tuple(sorted(findings, key=_finding_sort_key))


DEFAULT_INITIAL_MOLDABILITY_ANALYZER = InitialMoldabilityAnalyzer()


_FINDING_CODE_ORDER = {
    InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED: 0,
    InitialMoldabilityFindingCode.MISSING_GEOMETRY: 1,
    InitialMoldabilityFindingCode.MISSING_REQUIRED_ANALYSIS_DATA: 2,
    InitialMoldabilityFindingCode.NON_FINITE_MODEL_DATA: 3,
    InitialMoldabilityFindingCode.NON_MANIFOLD_TOPOLOGY: 4,
    InitialMoldabilityFindingCode.ZERO_OR_NEAR_ZERO_EXTENT: 5,
    InitialMoldabilityFindingCode.OPEN_MESH: 6,
    InitialMoldabilityFindingCode.CRITICAL_GEOMETRY_ISSUES: 7,
    InitialMoldabilityFindingCode.READY_FOR_ADVANCED_MOLD_ANALYSIS: 8,
}
_SEVERITY_ORDER = {
    IssueSeverity.CRITICAL: 0,
    IssueSeverity.ERROR: 1,
    IssueSeverity.WARNING: 2,
    IssueSeverity.INFO: 3,
}


def _collect_non_finite_fields(model: ImportedModel) -> tuple[str, ...]:
    values = {
        "dimensions.x": model.dimensions.x,
        "dimensions.y": model.dimensions.y,
        "dimensions.z": model.dimensions.z,
    }

    if model.statistics is not None:
        values.update(
            {
                "statistics.surface_area": model.statistics.surface_area,
                "statistics.bounding_box.size_x": model.statistics.bounding_box.size_x,
                "statistics.bounding_box.size_y": model.statistics.bounding_box.size_y,
                "statistics.bounding_box.size_z": model.statistics.bounding_box.size_z,
            }
        )

        if model.statistics.volume is not None:
            values["statistics.volume"] = model.statistics.volume

    return tuple(
        sorted(
            field_name for field_name, value in values.items() if not isfinite(value)
        )
    )


def _collect_near_zero_axes(
    model: ImportedModel,
    *,
    tolerance: float,
) -> tuple[str, ...]:
    return tuple(
        axis
        for axis, extent in (
            ("x", model.dimensions.x),
            ("y", model.dimensions.y),
            ("z", model.dimensions.z),
        )
        if abs(extent) <= tolerance
    )


def _summary_for_status(status: InitialMoldabilityStatus) -> str:
    if status is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS:
        return "Model is preliminarily ready for advanced mold analysis."

    if status is InitialMoldabilityStatus.REQUIRES_REPAIR:
        return "Model requires repair before advanced mold analysis."

    if status is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE:
        return "Model is preliminarily unsuitable as a meaningful 3D mold candidate."

    return "Model cannot be assessed reliably with the currently available data."


def _recommended_next_step_for_status(status: InitialMoldabilityStatus) -> str:
    if status is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS:
        return "Proceed to later mold-analysis stages."

    if status is InitialMoldabilityStatus.REQUIRES_REPAIR:
        return "Repair geometry or topology issues, then rerun the import pipeline."

    if status is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE:
        return "Replace or rebuild the model as a true 3D solid before continuing."

    return "Fix missing or invalid import data before attempting assessment again."


def _finding_sort_key(
    finding: InitialMoldabilityFinding,
) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in finding.metadata.items())
    )

    return (
        _SEVERITY_ORDER[finding.severity],
        _FINDING_CODE_ORDER[finding.code],
        finding.message,
        metadata_key,
    )
