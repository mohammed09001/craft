from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionResult,
    CavityClassificationOutcome,
    CavityClassificationResult,
    CavityConnectivityClassification,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionOutcome,
    CavityOpeningDetectionResult,
    CavityType,
    CavityTypeClassification,
    InternalSurfaceRegionOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import CavityClassifier


@dataclass(frozen=True, slots=True)
class ConservativeCavityClassifier:
    """Classify cavity evidence without claiming final mold-core feasibility."""

    def classify(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
    ) -> CavityClassificationResult:
        """Return conservative classifications for candidates and regions."""
        del context
        if opening_detection.outcome is CavityOpeningDetectionOutcome.BLOCKED:
            return CavityClassificationResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                summary="Cavity classification was blocked by upstream analysis.",
                findings=(
                    _finding(
                        code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "Cavity classification did not run because upstream "
                            "opening detection was blocked."
                        ),
                        is_blocking=True,
                    ),
                ),
            )

        classifications: list[CavityTypeClassification] = []
        findings: list[CavityFinding] = []

        for candidate in candidate_detection.candidates:
            if (
                candidate.is_potential_void_boundary
                and candidate.connectivity_classification
                is CavityConnectivityClassification.ENCLOSED
            ):
                classifications.append(
                    CavityTypeClassification(
                        target_id=candidate.candidate_id,
                        cavity_type=CavityType.NESTED_SHELL_VOID,
                        outcome=CavityClassificationOutcome.CLASSIFIED,
                        evidence_codes=("nested_closed_shell_containment",),
                        findings=candidate.findings,
                    )
                )

        if opening_detection.outcome is CavityOpeningDetectionOutcome.NOT_ASSESSABLE:
            classifications.append(
                CavityTypeClassification(
                    target_id="mesh_topology",
                    cavity_type=CavityType.MESH_BOUNDARY_DEFECT,
                    outcome=CavityClassificationOutcome.NOT_ASSESSABLE,
                    evidence_codes=("invalid_or_open_mesh_topology",),
                    findings=opening_detection.findings,
                )
            )

        openings_by_region: dict[str, tuple[str, ...]] = {}
        for region in opening_detection.regions:
            region_opening_ids = tuple(
                opening.opening_id
                for opening in opening_detection.openings
                if opening.region_id == region.region_id
            )
            openings_by_region[region.region_id] = region_opening_ids
            if region.source_candidate_id is not None:
                continue

            classifications.append(
                CavityTypeClassification(
                    target_id=region.region_id,
                    cavity_type=_classify_region_type(
                        opening_count=len(region_opening_ids),
                        outcome=region.outcome,
                    ),
                    outcome=_classify_region_outcome(
                        opening_count=len(region_opening_ids),
                        outcome=region.outcome,
                    ),
                    opening_ids=region_opening_ids,
                    evidence_codes=region.evidence,
                    findings=region.findings,
                )
            )

        if classifications:
            findings.append(
                _finding(
                    code=CavityFindingCode.CAVITY_CLASSIFIED_FROM_CONSERVATIVE_EVIDENCE,
                    severity=IssueSeverity.INFO,
                    message=(
                        "Cavity feature classifications were produced from "
                        "conservative structural and line-of-sight evidence."
                    ),
                    metadata={"classification_count": len(classifications)},
                )
            )

        ordered_classifications = tuple(
            sorted(classifications, key=_classification_sort_key)
        )
        return CavityClassificationResult(
            status=_resolve_status(ordered_classifications),
            summary=_build_summary(ordered_classifications),
            classifications=ordered_classifications,
            findings=_order_findings(findings),
        )


DEFAULT_CAVITY_CLASSIFIER: CavityClassifier = ConservativeCavityClassifier()


def _classify_region_type(
    *,
    opening_count: int,
    outcome: InternalSurfaceRegionOutcome,
) -> CavityType:
    if outcome is InternalSurfaceRegionOutcome.NOT_ASSESSABLE:
        return CavityType.NOT_ASSESSABLE
    if opening_count >= 3:
        return CavityType.MULTI_OPENING_REGION_CANDIDATE
    if opening_count == 2:
        return CavityType.THROUGH_CHANNEL_CANDIDATE
    if opening_count == 1:
        return CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE
    return CavityType.AMBIGUOUS_INTERNAL_REGION


def _classify_region_outcome(
    *,
    opening_count: int,
    outcome: InternalSurfaceRegionOutcome,
) -> CavityClassificationOutcome:
    if outcome is InternalSurfaceRegionOutcome.NOT_ASSESSABLE:
        return CavityClassificationOutcome.NOT_ASSESSABLE
    if opening_count == 0 or outcome is InternalSurfaceRegionOutcome.AMBIGUOUS:
        return CavityClassificationOutcome.AMBIGUOUS
    return CavityClassificationOutcome.CLASSIFIED


def _resolve_status(
    classifications: tuple[CavityTypeClassification, ...],
) -> DetailedMoldAnalysisStatus:
    if any(
        classification.outcome is CavityClassificationOutcome.NOT_ASSESSABLE
        for classification in classifications
    ):
        return DetailedMoldAnalysisStatus.PARTIAL
    if any(
        classification.outcome is CavityClassificationOutcome.AMBIGUOUS
        for classification in classifications
    ):
        return DetailedMoldAnalysisStatus.PARTIAL
    return DetailedMoldAnalysisStatus.COMPLETED


def _build_summary(
    classifications: tuple[CavityTypeClassification, ...],
) -> str:
    if not classifications:
        return "Cavity classification found no classifiable cavity feature evidence."
    return (
        "Cavity classification produced "
        f"{len(classifications)} conservative feature classification(s)."
    )


def _classification_sort_key(
    classification: CavityTypeClassification,
) -> tuple[object, ...]:
    return (
        classification.target_id,
        classification.cavity_type.value,
        classification.opening_ids,
        classification.evidence_codes,
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
        source=CavityFindingSource.CAVITY_CLASSIFIER,
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
