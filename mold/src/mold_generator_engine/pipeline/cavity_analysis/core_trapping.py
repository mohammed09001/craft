from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityCandidateDetectionResult,
    CavityClassificationOutcome,
    CavityClassificationResult,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    CavityOpeningDetectionOutcome,
    CavityOpeningDetectionResult,
    CavityType,
    CoreTrappingRiskAnalysisResult,
    CoreTrappingRiskAssessment,
    CoreTrappingRiskOutcome,
    InternalAccessDirectionGenerationResult,
    InternalAccessibilityAnalysisResult,
    InternalDirectionEvaluation,
    InternalDirectionEvaluationOutcome,
    InternalUndercutAnalysisResult,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CoreTrappingRiskAnalyzer,
)


@dataclass(frozen=True, slots=True)
class PreliminaryCoreTrappingRiskAnalyzer:
    """Assess preliminary core trapping risk from Chapter 4 evidence only."""

    def analyze(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
    ) -> CoreTrappingRiskAnalysisResult:
        """Return conservative trapping risk without final core feasibility claims."""
        del context, accessibility
        if (
            access_directions.status is DetailedMoldAnalysisStatus.BLOCKED
            or undercut_analysis.status is DetailedMoldAnalysisStatus.BLOCKED
        ):
            return CoreTrappingRiskAnalysisResult(
                status=DetailedMoldAnalysisStatus.BLOCKED,
                summary="Core trapping risk assessment was blocked upstream.",
                findings=(
                    _finding(
                        code=CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,
                        severity=IssueSeverity.WARNING,
                        message=(
                            "Core trapping risk did not run because upstream "
                            "directional evidence was blocked."
                        ),
                        is_blocking=True,
                    ),
                ),
            )

        target_faces = _target_face_indices(candidate_detection, opening_detection)
        directions_by_target = _directions_by_target(access_directions)
        evaluations_by_target = _evaluations_by_target(undercut_analysis)
        assessments: list[CoreTrappingRiskAssessment] = []

        for item in classification.classifications:
            target_id = item.target_id
            target_direction_ids = tuple(
                direction.direction_id
                for direction in directions_by_target.get(target_id, ())
            )
            target_evaluations = evaluations_by_target.get(target_id, ())
            target_face_indices = target_faces.get(target_id, ())
            best_direction_id = _best_supported_direction_id(
                target_evaluations,
                access_directions,
            )

            if item.cavity_type is CavityType.NESTED_SHELL_VOID:
                assessments.append(
                    CoreTrappingRiskAssessment(
                        target_id=target_id,
                        assessed_direction_ids=target_direction_ids,
                        best_supported_direction_id=best_direction_id,
                        uncovered_face_indices=target_face_indices,
                        risk_outcome=CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK,
                        finding_codes=(
                            CavityFindingCode.ENCLOSED_CAVITY_HAS_HIGH_STRUCTURAL_TRAPPING_RISK,
                        ),
                    )
                )
                continue

            if (
                item.outcome is CavityClassificationOutcome.NOT_ASSESSABLE
                or item.cavity_type in (CavityType.MESH_BOUNDARY_DEFECT, CavityType.NOT_ASSESSABLE)
                or opening_detection.outcome is CavityOpeningDetectionOutcome.NOT_ASSESSABLE
            ):
                assessments.append(
                    CoreTrappingRiskAssessment(
                        target_id=target_id,
                        assessed_direction_ids=target_direction_ids,
                        best_supported_direction_id=best_direction_id,
                        risk_outcome=CoreTrappingRiskOutcome.NOT_ASSESSABLE,
                        finding_codes=(CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,),
                    )
                )
                continue

            if not target_direction_ids or not target_evaluations:
                assessments.append(
                    CoreTrappingRiskAssessment(
                        target_id=target_id,
                        assessed_direction_ids=target_direction_ids,
                        risk_outcome=CoreTrappingRiskOutcome.AMBIGUOUS,
                        finding_codes=(
                            CavityFindingCode.NO_SUPPORTED_INTERNAL_ACCESS_DIRECTION,
                        ),
                    )
                )
                continue

            uncovered_faces = _uncovered_faces(target_face_indices, target_evaluations)
            conflicting_direction_ids = _conflicting_direction_ids(target_evaluations)
            low_risk_direction_id = _low_risk_direction_id(
                target_face_indices,
                target_evaluations,
            )
            if low_risk_direction_id is not None:
                assessments.append(
                    CoreTrappingRiskAssessment(
                        target_id=target_id,
                        assessed_direction_ids=target_direction_ids,
                        best_supported_direction_id=low_risk_direction_id,
                        risk_outcome=CoreTrappingRiskOutcome.LOW_OBSERVED_RISK,
                        finding_codes=(
                            CavityFindingCode.LOW_OBSERVED_TRAPPING_RISK_IS_NOT_CORE_FEASIBILITY_PROOF,
                        ),
                    )
                )
                continue

            if uncovered_faces and all(
                evaluation.outcome
                in (
                    InternalDirectionEvaluationOutcome.OBSTRUCTED,
                    InternalDirectionEvaluationOutcome.PARTIALLY_OBSTRUCTED,
                    InternalDirectionEvaluationOutcome.AMBIGUOUS,
                )
                for evaluation in target_evaluations
            ):
                outcome = CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK
            elif any(evaluation.obstructed_region_ids for evaluation in target_evaluations):
                outcome = CoreTrappingRiskOutcome.POTENTIAL_RISK
            else:
                outcome = CoreTrappingRiskOutcome.AMBIGUOUS

            assessments.append(
                CoreTrappingRiskAssessment(
                    target_id=target_id,
                    assessed_direction_ids=target_direction_ids,
                    best_supported_direction_id=best_direction_id,
                    uncovered_face_indices=uncovered_faces,
                    conflicting_direction_ids=conflicting_direction_ids,
                    risk_outcome=outcome,
                    finding_codes=_risk_finding_codes(outcome),
                )
            )

        if not assessments and opening_detection.outcome is (
            CavityOpeningDetectionOutcome.NOT_ASSESSABLE
        ):
            assessments.append(
                CoreTrappingRiskAssessment(
                    target_id="mesh_topology",
                    risk_outcome=CoreTrappingRiskOutcome.NOT_ASSESSABLE,
                    finding_codes=(CavityFindingCode.INVALID_CAVITY_DETECTION_INPUT,),
                )
            )

        ordered_assessments = tuple(sorted(assessments, key=_assessment_sort_key))
        return CoreTrappingRiskAnalysisResult(
            status=_resolve_status(ordered_assessments),
            summary=_build_summary(ordered_assessments),
            assessments=ordered_assessments,
            findings=_build_findings(ordered_assessments),
        )


DEFAULT_CORE_TRAPPING_RISK_ANALYZER: CoreTrappingRiskAnalyzer = (
    PreliminaryCoreTrappingRiskAnalyzer()
)


def _target_face_indices(
    candidate_detection: CavityCandidateDetectionResult,
    opening_detection: CavityOpeningDetectionResult,
) -> dict[str, tuple[int, ...]]:
    targets: dict[str, tuple[int, ...]] = {}
    for candidate in candidate_detection.candidates:
        targets[candidate.candidate_id] = candidate.source_face_indices
    for region in opening_detection.regions:
        targets[region.region_id] = region.face_indices
        if region.source_candidate_id is not None:
            targets[region.source_candidate_id] = region.face_indices
    return targets


def _directions_by_target(
    access_directions: InternalAccessDirectionGenerationResult,
):
    grouped = {}
    for direction in access_directions.directions:
        grouped.setdefault(direction.target_id, []).append(direction)
    return {
        target_id: tuple(sorted(directions, key=lambda item: item.direction_id))
        for target_id, directions in grouped.items()
    }


def _evaluations_by_target(
    undercut_analysis: InternalUndercutAnalysisResult,
) -> dict[str, tuple[InternalDirectionEvaluation, ...]]:
    grouped: dict[str, list[InternalDirectionEvaluation]] = {}
    for evaluation in undercut_analysis.evaluations:
        grouped.setdefault(evaluation.target_id, []).append(evaluation)
    return {
        target_id: tuple(sorted(evaluations, key=lambda item: item.direction_id))
        for target_id, evaluations in grouped.items()
    }


def _best_supported_direction_id(
    evaluations: tuple[InternalDirectionEvaluation, ...],
    access_directions: InternalAccessDirectionGenerationResult,
) -> str | None:
    if not evaluations:
        return None

    witness_count_by_id = {
        direction.direction_id: direction.witness_count
        for direction in access_directions.directions
    }
    best = min(
        evaluations,
        key=lambda evaluation: (
            -len(evaluation.clear_face_indices),
            len(evaluation.obstructed_region_ids),
            len(evaluation.ambiguous_face_indices),
            -witness_count_by_id.get(evaluation.direction_id, 0),
            evaluation.direction_id,
        ),
    )
    return best.direction_id


def _low_risk_direction_id(
    target_face_indices: tuple[int, ...],
    evaluations: tuple[InternalDirectionEvaluation, ...],
) -> str | None:
    target_faces = set(target_face_indices)
    for evaluation in sorted(evaluations, key=lambda item: item.direction_id):
        if evaluation.obstructed_region_ids or evaluation.ambiguous_face_indices:
            continue
        if target_faces and set(evaluation.clear_face_indices) >= target_faces:
            return evaluation.direction_id
        if not target_faces and evaluation.outcome is InternalDirectionEvaluationOutcome.CLEAR:
            return evaluation.direction_id
    return None


def _uncovered_faces(
    target_face_indices: tuple[int, ...],
    evaluations: tuple[InternalDirectionEvaluation, ...],
) -> tuple[int, ...]:
    target_faces = set(target_face_indices)
    clear_faces: set[int] = set()
    for evaluation in evaluations:
        clear_faces.update(evaluation.clear_face_indices)
    return tuple(sorted(target_faces - clear_faces))


def _conflicting_direction_ids(
    evaluations: tuple[InternalDirectionEvaluation, ...],
) -> tuple[str, ...]:
    if len(evaluations) < 2:
        return ()
    clear_sets = {
        evaluation.direction_id: set(evaluation.clear_face_indices)
        for evaluation in evaluations
    }
    if len({tuple(sorted(clear_faces)) for clear_faces in clear_sets.values()}) <= 1:
        return ()
    return tuple(sorted(clear_sets))


def _risk_finding_codes(
    outcome: CoreTrappingRiskOutcome,
) -> tuple[CavityFindingCode, ...]:
    if outcome is CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK:
        return (CavityFindingCode.CORE_TRAPPING_RISK_ASSESSED_FROM_PRELIMINARY_EVIDENCE,)
    if outcome is CoreTrappingRiskOutcome.POTENTIAL_RISK:
        return (
            CavityFindingCode.INTERNAL_DIRECTIONAL_OBSTRUCTION_DETECTED,
            CavityFindingCode.CORE_TRAPPING_RISK_ASSESSED_FROM_PRELIMINARY_EVIDENCE,
        )
    if outcome is CoreTrappingRiskOutcome.LOW_OBSERVED_RISK:
        return (
            CavityFindingCode.LOW_OBSERVED_TRAPPING_RISK_IS_NOT_CORE_FEASIBILITY_PROOF,
        )
    return (CavityFindingCode.CORE_TRAPPING_RISK_ASSESSED_FROM_PRELIMINARY_EVIDENCE,)


def _resolve_status(
    assessments: tuple[CoreTrappingRiskAssessment, ...],
) -> DetailedMoldAnalysisStatus:
    if any(
        assessment.risk_outcome
        in (
            CoreTrappingRiskOutcome.AMBIGUOUS,
            CoreTrappingRiskOutcome.NOT_ASSESSABLE,
        )
        for assessment in assessments
    ):
        return DetailedMoldAnalysisStatus.PARTIAL
    return DetailedMoldAnalysisStatus.COMPLETED


def _build_summary(
    assessments: tuple[CoreTrappingRiskAssessment, ...],
) -> str:
    if not assessments:
        return "Core trapping risk assessment found no cavity target to assess."
    return (
        "Core trapping risk assessment produced "
        f"{len(assessments)} preliminary target assessment(s)."
    )


def _build_findings(
    assessments: tuple[CoreTrappingRiskAssessment, ...],
) -> tuple[CavityFinding, ...]:
    findings = [
        _finding(
            code=CavityFindingCode.CORE_TRAPPING_RISK_ASSESSED_FROM_PRELIMINARY_EVIDENCE,
            severity=IssueSeverity.INFO,
            message=(
                "Core trapping risk was assessed from preliminary cavity, opening, "
                "accessibility, direction, and obstruction evidence only."
            ),
            metadata={"assessment_count": len(assessments)},
        ),
        _finding(
            code=CavityFindingCode.LOW_OBSERVED_TRAPPING_RISK_IS_NOT_CORE_FEASIBILITY_PROOF,
            severity=IssueSeverity.INFO,
            message=(
                "Low observed trapping risk is not proof of final core feasibility "
                "or collision-free extraction."
            ),
        ),
    ]
    if any(
        assessment.risk_outcome is CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK
        for assessment in assessments
    ):
        findings.append(
            _finding(
                code=CavityFindingCode.ENCLOSED_CAVITY_HAS_HIGH_STRUCTURAL_TRAPPING_RISK,
                severity=IssueSeverity.WARNING,
                message=(
                    "At least one target has structural evidence for high preliminary "
                    "core trapping risk."
                ),
            )
        )
    return _order_findings(findings)


def _assessment_sort_key(
    assessment: CoreTrappingRiskAssessment,
) -> tuple[object, ...]:
    return (assessment.target_id, assessment.risk_outcome.value)


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
        source=CavityFindingSource.CORE_TRAPPING_RISK_ANALYZER,
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
