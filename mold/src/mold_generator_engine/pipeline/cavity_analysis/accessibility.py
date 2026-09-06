from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityClassificationOutcome,
    CavityClassificationResult,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionResult,
    CavityType,
    InternalAccessibilityAnalysisResult,
    InternalAccessibilityAssessment,
    InternalAccessibilityOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    InternalAccessibilityAnalyzer,
)


@dataclass(frozen=True, slots=True)
class LineOfSightInternalAccessibilityAnalyzer:
    """Assess internal accessibility from line-of-sight evidence only.

    The analyzer does not prove insertion paths, clearance, absence of internal
    undercuts, trapping behavior, swept volume, or final core feasibility.
    """

    def analyze(
        self,
        context: CavityAnalysisContext,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
    ) -> InternalAccessibilityAnalysisResult:
        """Return preliminary accessibility assessments for classified targets."""
        del context
        if classification.status is DetailedMoldAnalysisStatus.BLOCKED:
            return InternalAccessibilityAnalysisResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                summary="Internal accessibility analysis was blocked upstream.",
                findings=(
                    _finding(
                        code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "Internal accessibility did not run because upstream "
                            "classification was blocked."
                        ),
                        is_blocking=True,
                    ),
                ),
            )

        regions_by_id = {
            region.region_id: region for region in opening_detection.regions
        }
        openings_by_id = {
            opening.opening_id: opening for opening in opening_detection.openings
        }
        assessments: list[InternalAccessibilityAssessment] = []

        for item in classification.classifications:
            if item.cavity_type is CavityType.NESTED_SHELL_VOID:
                assessments.append(
                    InternalAccessibilityAssessment(
                        target_id=item.target_id,
                        outcome=InternalAccessibilityOutcome.ENCLOSED,
                        assessed_sample_count=1,
                        blocked_sample_count=1,
                        findings=item.findings,
                    )
                )
                continue

            if item.outcome is CavityClassificationOutcome.NOT_ASSESSABLE:
                assessments.append(
                    InternalAccessibilityAssessment(
                        target_id=item.target_id,
                        outcome=InternalAccessibilityOutcome.NOT_ASSESSABLE,
                        opening_ids=item.opening_ids,
                        findings=item.findings,
                    )
                )
                continue

            region = regions_by_id.get(item.target_id)
            if region is None:
                assessments.append(
                    InternalAccessibilityAssessment(
                        target_id=item.target_id,
                        outcome=InternalAccessibilityOutcome.AMBIGUOUS,
                        opening_ids=item.opening_ids,
                        findings=item.findings,
                    )
                )
                continue

            direction_evidence = tuple(
                sorted(
                    openings_by_id[opening_id].representative_direction
                    for opening_id in item.opening_ids
                    if opening_id in openings_by_id
                )
            )
            assessments.append(
                InternalAccessibilityAssessment(
                    target_id=item.target_id,
                    outcome=_resolve_region_outcome(
                        opening_count=len(item.opening_ids),
                        accessible_sample_count=region.visible_sample_count,
                        blocked_sample_count=region.blocked_sample_count,
                    ),
                    opening_ids=item.opening_ids,
                    assessed_sample_count=region.assessed_sample_count,
                    accessible_sample_count=region.visible_sample_count,
                    blocked_sample_count=region.blocked_sample_count,
                    ambiguous_sample_count=region.ambiguous_sample_count,
                    direction_evidence=direction_evidence,
                    findings=item.findings,
                )
            )

        findings: list[CavityFinding] = []
        if assessments:
            findings.append(
                _finding(
                    code=(
                        CavityFindingCode.INTERNAL_ACCESSIBILITY_ASSESSED_FROM_LINE_OF_SIGHT
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "Internal accessibility was assessed from finite "
                        "line-of-sight evidence."
                    ),
                    metadata={"assessment_count": len(assessments)},
                )
            )
            findings.append(
                _finding(
                    code=CavityFindingCode.LINE_OF_SIGHT_IS_NOT_CORE_INSERTION_PATH_PROOF,
                    severity=IssueSeverity.INFO,
                    message=(
                        "Successful line-of-sight evidence is not proof of a core "
                        "insertion path."
                    ),
                )
            )
            findings.append(
                _finding(
                    code=(
                        CavityFindingCode.INTERNAL_ACCESSIBILITY_NOT_CORE_FEASIBILITY_PROOF
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "Internal accessibility does not prove clearance, swept "
                        "volume, undercut absence, trapping absence, or core feasibility."
                    ),
                )
            )

        ordered_assessments = tuple(sorted(assessments, key=_assessment_sort_key))
        return InternalAccessibilityAnalysisResult(
            status=_resolve_status(ordered_assessments),
            summary=_build_summary(ordered_assessments),
            assessments=ordered_assessments,
            findings=_order_findings(findings),
        )


DEFAULT_INTERNAL_ACCESSIBILITY_ANALYZER: InternalAccessibilityAnalyzer = (
    LineOfSightInternalAccessibilityAnalyzer()
)


def _resolve_region_outcome(
    *,
    opening_count: int,
    accessible_sample_count: int,
    blocked_sample_count: int,
) -> InternalAccessibilityOutcome:
    if opening_count == 0:
        return InternalAccessibilityOutcome.AMBIGUOUS
    if accessible_sample_count > 0 and blocked_sample_count > 0:
        return InternalAccessibilityOutcome.PARTIALLY_ACCESSIBLE
    if accessible_sample_count > 0:
        return InternalAccessibilityOutcome.ACCESSIBLE
    return InternalAccessibilityOutcome.AMBIGUOUS


def _resolve_status(
    assessments: tuple[InternalAccessibilityAssessment, ...],
) -> DetailedMoldAnalysisStatus:
    if any(
        assessment.outcome
        in (
            InternalAccessibilityOutcome.AMBIGUOUS,
            InternalAccessibilityOutcome.NOT_ASSESSABLE,
        )
        for assessment in assessments
    ):
        return DetailedMoldAnalysisStatus.PARTIAL
    return DetailedMoldAnalysisStatus.COMPLETED


def _build_summary(
    assessments: tuple[InternalAccessibilityAssessment, ...],
) -> str:
    if not assessments:
        return "Internal accessibility analysis found no target to assess."
    return (
        "Internal accessibility analysis produced "
        f"{len(assessments)} line-of-sight assessment(s)."
    )


def _assessment_sort_key(
    assessment: InternalAccessibilityAssessment,
) -> tuple[object, ...]:
    return (
        assessment.target_id,
        assessment.outcome.value,
        assessment.opening_ids,
        assessment.direction_evidence,
    )


def _finding(
    *,
    code: CavityFindingCode,
    severity: IssueSeverity,
    message: str,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> CavityFinding:
    return CavityFinding(
        code=code,
        source=CavityFindingSource.INTERNAL_ACCESSIBILITY_ANALYZER,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )


def _order_findings(findings: list[CavityFinding]) -> tuple[CavityFinding, ...]:
    return tuple(sorted(findings, key=_finding_sort_key))


def _finding_sort_key(finding: CavityFinding) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in finding.metadata.items())
    )
    return (
        not finding.is_blocking,
        _SEVERITY_ORDER[finding.severity],
        finding.source.value,
        finding.code.value,
        finding.message,
        metadata_key,
    )


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
