from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.config.geometry import (
    DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
    DEFAULT_LINEAR_TOLERANCE_MM,
)
from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry.vector import Vector3D
from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityClassificationResult,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionResult,
    InternalAccessDirectionCandidate,
    InternalAccessDirectionGenerationOutcome,
    InternalAccessDirectionGenerationResult,
    InternalAccessDirectionSource,
    InternalAccessibilityAnalysisResult,
    InternalAccessibilityOutcome,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    InternalAccessDirectionGenerator,
)


@dataclass(frozen=True, slots=True)
class OpeningEvidenceInternalAccessDirectionGenerator:
    """Generate target-scoped internal-to-exit direction candidates."""

    linear_tolerance_mm: float = DEFAULT_LINEAR_TOLERANCE_MM
    angular_merge_tolerance: float = DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE

    def generate(
        self,
        context: CavityAnalysisContext,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
    ) -> InternalAccessDirectionGenerationResult:
        """Generate normalized directions without selecting a core pull direction."""
        if opening_detection.status is DetailedMoldAnalysisStatus.BLOCKED:
            return _not_assessable_result(
                "Internal access direction generation was blocked upstream."
            )

        raw_evidence = list(
            _opening_direction_evidence(
                opening_detection,
                linear_tolerance_mm=self.linear_tolerance_mm,
            )
        )
        raw_evidence.extend(
            _chapter_3_hint_evidence(
                context,
                classification,
                accessibility,
                existing_target_ids={evidence.target_id for evidence in raw_evidence},
                linear_tolerance_mm=self.linear_tolerance_mm,
            )
        )
        ordered_evidence = tuple(sorted(raw_evidence, key=_raw_evidence_sort_key))
        directions = _cluster_evidence(
            ordered_evidence,
            angular_merge_tolerance=self.angular_merge_tolerance,
            linear_tolerance_mm=self.linear_tolerance_mm,
        )

        findings: list[CavityFinding] = []
        if directions:
            findings.append(
                _finding(
                    code=(
                        CavityFindingCode.INTERNAL_ACCESS_DIRECTIONS_GENERATED_FROM_OPENING_EVIDENCE
                    ),
                    severity=IssueSeverity.INFO,
                    message=(
                        "Internal access direction candidates were generated from "
                        "opening evidence and low-priority hints where available."
                    ),
                    metadata={"direction_count": len(directions)},
                )
            )
            findings.append(
                _finding(
                    code=CavityFindingCode.INTERNAL_ACCESS_DIRECTION_IS_NOT_CORE_PULL_DIRECTION,
                    severity=IssueSeverity.INFO,
                    message=(
                        "Generated internal access directions are not final core "
                        "pull directions or proof of insertion clearance."
                    ),
                )
            )
        else:
            findings.append(
                _finding(
                    code=CavityFindingCode.NO_SUPPORTED_INTERNAL_ACCESS_DIRECTION,
                    severity=IssueSeverity.INFO,
                    message=(
                        "No supported internal access direction was generated from "
                        "the available opening and target evidence."
                    ),
                )
            )

        if any(
            direction.source
            is InternalAccessDirectionSource.CHAPTER_3_PULL_DIRECTION_HINT
            for direction in directions
        ):
            findings.append(
                _finding(
                    code=CavityFindingCode.CHAPTER_3_PULL_DIRECTION_USED_AS_LOW_PRIORITY_HINT,
                    severity=IssueSeverity.INFO,
                    message=(
                        "The Chapter 3 selected pull direction was used only as a "
                        "low-priority direction hint for target coverage."
                    ),
                )
            )

        return InternalAccessDirectionGenerationResult(
            status=DetailedMoldAnalysisStatus.COMPLETED,
            outcome=(
                InternalAccessDirectionGenerationOutcome.DIRECTIONS_GENERATED
                if directions
                else InternalAccessDirectionGenerationOutcome.NO_SUPPORTED_DIRECTION
            ),
            summary=_build_summary(directions),
            directions=directions,
            findings=_order_findings(findings),
        )


DEFAULT_INTERNAL_ACCESS_DIRECTION_GENERATOR: InternalAccessDirectionGenerator = (
    OpeningEvidenceInternalAccessDirectionGenerator()
)


@dataclass(frozen=True, slots=True)
class _RawDirectionEvidence:
    target_id: str
    direction: Vector3D
    source: InternalAccessDirectionSource
    opening_id: str | None
    witness_count: int
    source_priority: int


def _opening_direction_evidence(
    opening_detection: CavityOpeningDetectionResult,
    *,
    linear_tolerance_mm: float,
) -> tuple[_RawDirectionEvidence, ...]:
    evidence: list[_RawDirectionEvidence] = []
    for opening in opening_detection.openings:
        for witness_direction in opening.witness_directions:
            normalized = _normalize_tuple(
                witness_direction,
                linear_tolerance_mm=linear_tolerance_mm,
            )
            if normalized is None:
                continue
            evidence.append(
                _RawDirectionEvidence(
                    target_id=opening.region_id,
                    direction=normalized,
                    source=InternalAccessDirectionSource.OPENING_WITNESS,
                    opening_id=opening.opening_id,
                    witness_count=max(1, opening.witness_count),
                    source_priority=0,
                )
            )

        representative = _normalize_tuple(
            opening.representative_direction,
            linear_tolerance_mm=linear_tolerance_mm,
        )
        if representative is None:
            continue
        evidence.append(
            _RawDirectionEvidence(
                target_id=opening.region_id,
                direction=representative,
                source=InternalAccessDirectionSource.OPENING_REPRESENTATIVE,
                opening_id=opening.opening_id,
                witness_count=max(1, opening.witness_count),
                source_priority=1,
            )
        )

    return tuple(evidence)


def _chapter_3_hint_evidence(
    context: CavityAnalysisContext,
    classification: CavityClassificationResult,
    accessibility: InternalAccessibilityAnalysisResult,
    *,
    existing_target_ids: set[str],
    linear_tolerance_mm: float,
) -> tuple[_RawDirectionEvidence, ...]:
    selected_direction = _selected_chapter_3_direction(context)
    if selected_direction is None:
        return ()

    target_ids = tuple(
        sorted(
            assessment.target_id
            for assessment in accessibility.assessments
            if assessment.target_id not in existing_target_ids
            and assessment.outcome
            not in (
                InternalAccessibilityOutcome.ENCLOSED,
                InternalAccessibilityOutcome.NOT_ASSESSABLE,
            )
        )
    )
    classified_target_ids = {item.target_id for item in classification.classifications}
    evidence: list[_RawDirectionEvidence] = []
    for target_id in target_ids:
        if target_id not in classified_target_ids:
            continue
        for direction in (selected_direction, -selected_direction):
            evidence.append(
                _RawDirectionEvidence(
                    target_id=target_id,
                    direction=direction,
                    source=InternalAccessDirectionSource.CHAPTER_3_PULL_DIRECTION_HINT,
                    opening_id=None,
                    witness_count=0,
                    source_priority=4,
                )
            )
    return tuple(evidence)


def _selected_chapter_3_direction(context: CavityAnalysisContext) -> Vector3D | None:
    selection = (
        context.detailed_mold_analysis_report.preliminary_pull_direction_selection
    )
    if selection is None or selection.selected_direction is None:
        return None
    try:
        return selection.selected_direction.normalized(
            minimum_magnitude=DEFAULT_LINEAR_TOLERANCE_MM
        )
    except InvalidVectorError:
        return None


def _cluster_evidence(
    evidence_items: tuple[_RawDirectionEvidence, ...],
    *,
    angular_merge_tolerance: float,
    linear_tolerance_mm: float,
) -> tuple[InternalAccessDirectionCandidate, ...]:
    clusters: list[list[_RawDirectionEvidence]] = []
    representatives: list[Vector3D] = []
    merge_floor = 1.0 - angular_merge_tolerance

    for evidence in evidence_items:
        matched_index = None
        for index, representative in enumerate(representatives):
            if evidence.target_id != clusters[index][0].target_id:
                continue
            if evidence.direction.dot(representative) >= merge_floor:
                matched_index = index
                break

        if matched_index is None:
            clusters.append([evidence])
            representatives.append(evidence.direction)
            continue

        clusters[matched_index].append(evidence)
        representatives[matched_index] = _weighted_representative(
            tuple(clusters[matched_index]),
            linear_tolerance_mm=linear_tolerance_mm,
        )

    candidates = [
        _candidate_from_cluster(index, tuple(cluster), representatives[index])
        for index, cluster in enumerate(clusters)
    ]
    ordered = sorted(candidates, key=_candidate_sort_key)
    return tuple(
        InternalAccessDirectionCandidate(
            direction_id=f"internal_access_direction_{index:03d}",
            target_id=candidate.target_id,
            direction=candidate.direction,
            source=candidate.source,
            supporting_opening_ids=candidate.supporting_opening_ids,
            witness_count=candidate.witness_count,
            finding_codes=candidate.finding_codes,
        )
        for index, candidate in enumerate(ordered, start=1)
    )


def _weighted_representative(
    cluster: tuple[_RawDirectionEvidence, ...],
    *,
    linear_tolerance_mm: float,
) -> Vector3D:
    weighted = Vector3D(0.0, 0.0, 0.0)
    for evidence in cluster:
        weight = max(1, evidence.witness_count)
        weighted += evidence.direction * float(weight)
    try:
        return weighted.normalized(minimum_magnitude=linear_tolerance_mm)
    except InvalidVectorError:
        return cluster[0].direction


def _candidate_from_cluster(
    cluster_index: int,
    cluster: tuple[_RawDirectionEvidence, ...],
    representative: Vector3D,
) -> InternalAccessDirectionCandidate:
    best_source = min(cluster, key=lambda evidence: evidence.source_priority).source
    opening_ids = tuple(
        sorted(
            {
                evidence.opening_id
                for evidence in cluster
                if evidence.opening_id is not None
            }
        )
    )
    finding_codes = (
        (CavityFindingCode.INTERNAL_ACCESS_DIRECTION_IS_NOT_CORE_PULL_DIRECTION,)
        if best_source
        is not InternalAccessDirectionSource.CHAPTER_3_PULL_DIRECTION_HINT
        else (
            CavityFindingCode.CHAPTER_3_PULL_DIRECTION_USED_AS_LOW_PRIORITY_HINT,
            CavityFindingCode.INTERNAL_ACCESS_DIRECTION_IS_NOT_CORE_PULL_DIRECTION,
        )
    )
    return InternalAccessDirectionCandidate(
        direction_id=f"pending_{cluster_index:03d}",
        target_id=cluster[0].target_id,
        direction=_direction_tuple(representative),
        source=best_source,
        supporting_opening_ids=opening_ids,
        witness_count=sum(evidence.witness_count for evidence in cluster),
        finding_codes=finding_codes,
    )


def _normalize_tuple(
    direction: tuple[float, float, float],
    *,
    linear_tolerance_mm: float,
) -> Vector3D | None:
    try:
        return Vector3D(*direction).normalized(minimum_magnitude=linear_tolerance_mm)
    except InvalidVectorError:
        return None


def _raw_evidence_sort_key(evidence: _RawDirectionEvidence) -> tuple[object, ...]:
    return (
        evidence.target_id,
        evidence.source_priority,
        "" if evidence.opening_id is None else evidence.opening_id,
        -evidence.witness_count,
        evidence.direction.canonical_key(),
        _direction_tuple(evidence.direction),
    )


def _candidate_sort_key(
    candidate: InternalAccessDirectionCandidate,
) -> tuple[object, ...]:
    return (
        _SOURCE_PRIORITY[candidate.source],
        candidate.target_id,
        -len(candidate.supporting_opening_ids),
        -candidate.witness_count,
        candidate.supporting_opening_ids,
        _quantized_direction_tuple(candidate.direction),
        candidate.direction,
    )


def _quantized_direction_tuple(
    direction: tuple[float, float, float],
) -> tuple[int, ...]:
    return Vector3D(*direction).canonical_key()


def _direction_tuple(direction: Vector3D) -> tuple[float, float, float]:
    return (direction.x, direction.y, direction.z)


def _build_summary(
    directions: tuple[InternalAccessDirectionCandidate, ...],
) -> str:
    if not directions:
        return "Internal access direction generation found no supported direction."
    return (
        "Internal access direction generation produced "
        f"{len(directions)} candidate direction(s)."
    )


def _not_assessable_result(summary: str) -> InternalAccessDirectionGenerationResult:
    return InternalAccessDirectionGenerationResult(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        outcome=InternalAccessDirectionGenerationOutcome.NOT_ASSESSABLE,
        summary=summary,
        findings=(
            _finding(
                code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                severity=IssueSeverity.WARNING,
                message=summary,
                is_blocking=True,
            ),
        ),
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
        source=CavityFindingSource.INTERNAL_ACCESS_DIRECTION_GENERATOR,
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


_SOURCE_PRIORITY = {
    InternalAccessDirectionSource.OPENING_WITNESS: 0,
    InternalAccessDirectionSource.OPENING_REPRESENTATIVE: 1,
    InternalAccessDirectionSource.CHAPTER_3_PULL_DIRECTION_HINT: 4,
}

_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
