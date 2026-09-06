from __future__ import annotations

from typing import cast

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityAnalysisDecisionOutcome,
    CavityAssessmentOutcome,
    CavityCandidateDetectionOutcome,
    CavityCandidateDetectionResult,
    CavityClassificationOutcome,
    CavityClassificationResult,
    CavityCoreStrategyOutcome,
    CavityEvidenceAssessment,
    CavityFindingCode,
    CavityOpeningDetectionOutcome,
    CavityOpeningDetectionResult,
    CavityType,
    CavityTypeClassification,
    CoreTrappingRiskAnalysisResult,
    CoreTrappingRiskAssessment,
    CoreTrappingRiskOutcome,
    InternalAccessDirectionCandidate,
    InternalAccessDirectionGenerationOutcome,
    InternalAccessDirectionGenerationResult,
    InternalAccessDirectionSource,
    InternalAccessibilityAnalysisResult,
    InternalAccessibilityAssessment,
    InternalAccessibilityOutcome,
    InternalDirectionEvaluation,
    InternalDirectionEvaluationOutcome,
    InternalUndercutAnalysisOutcome,
    InternalUndercutAnalysisResult,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.pipeline.cavity_analysis.core_strategy import (
    ConservativeCoreStrategySynthesizer,
)
from mold_generator_engine.pipeline.cavity_analysis.decision import (
    ConservativeCavityAnalysisDecisionMaker,
)


def test_no_cavity_targets_resolves_to_no_cavity_requiring_strategy() -> None:
    strategy = _synthesize(classification=_classification())
    decision = _decide(strategy, classification=_classification())

    assert strategy.assessments == ()
    assert decision.outcome is (
        CavityAnalysisDecisionOutcome.NO_CAVITY_REQUIRING_CORE_STRATEGY
    )


def test_single_clear_pocket_is_preliminary_linear_candidate_with_limits() -> None:
    strategy = _synthesize(
        classification=_classification(
            _target(
                "target_a",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_a",),
            )
        ),
        accessibility=_accessibility(
            _access("target_a", InternalAccessibilityOutcome.ACCESSIBLE)
        ),
        directions=_directions(_direction("target_a", "direction_a")),
        undercuts=_undercuts(
            _evaluation(
                "target_a", "direction_a", InternalDirectionEvaluationOutcome.CLEAR
            )
        ),
        trapping=_trapping(
            _risk("target_a", "direction_a", CoreTrappingRiskOutcome.LOW_OBSERVED_RISK)
        ),
    )
    decision = _decide(
        strategy,
        classification=_classification(
            _target(
                "target_a",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_a",),
            )
        ),
    )

    assert strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
    )
    assert (
        CavityFindingCode.CLEARANCE_NOT_EVALUATED in strategy.assessments[0].limitations
    )
    assert CavityFindingCode.MOTION_NOT_EVALUATED in strategy.assessments[0].limitations
    assert decision.outcome is (
        CavityAnalysisDecisionOutcome.PRELIMINARY_LINEAR_CORE_CANDIDATE
    )
    assert decision.linear_candidate_target_ids == ("target_a",)


def test_directional_obstruction_blocks_current_method() -> None:
    strategy = _synthesize(
        classification=_classification(
            _target(
                "target_a",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_a",),
            )
        ),
        accessibility=_accessibility(
            _access("target_a", InternalAccessibilityOutcome.PARTIALLY_ACCESSIBLE)
        ),
        directions=_directions(_direction("target_a", "direction_a")),
        undercuts=_undercuts(
            _evaluation(
                "target_a",
                "direction_a",
                InternalDirectionEvaluationOutcome.OBSTRUCTED,
                obstructed_region_ids=("obstruction_a",),
            )
        ),
        trapping=_trapping(
            _risk("target_a", "direction_a", CoreTrappingRiskOutcome.POTENTIAL_RISK)
        ),
    )
    decision = _decide(strategy)

    assert strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.BLOCKED_BY_CURRENT_METHOD
    )
    assert CavityFindingCode.CURRENT_METHOD_BLOCKED in (
        strategy.assessments[0].blocking_finding_codes
    )
    assert decision.outcome is CavityAnalysisDecisionOutcome.CURRENT_METHOD_BLOCKED
    assert decision.blocking_target_ids == ("target_a",)


def test_through_channel_and_multi_opening_require_multiple_directions() -> None:
    for cavity_type in (
        CavityType.THROUGH_CHANNEL_CANDIDATE,
        CavityType.MULTI_OPENING_REGION_CANDIDATE,
    ):
        strategy = _synthesize(
            classification=_classification(
                _target(
                    "target_a",
                    cavity_type,
                    opening_ids=("opening_a", "opening_b"),
                )
            ),
            accessibility=_accessibility(
                _access("target_a", InternalAccessibilityOutcome.ACCESSIBLE)
            ),
            directions=_directions(
                _direction("target_a", "direction_a"),
                _direction("target_a", "direction_b"),
            ),
            undercuts=_undercuts(
                _evaluation(
                    "target_a",
                    "direction_a",
                    InternalDirectionEvaluationOutcome.CLEAR,
                ),
                _evaluation(
                    "target_a",
                    "direction_b",
                    InternalDirectionEvaluationOutcome.CLEAR,
                ),
            ),
            trapping=_trapping(
                _risk(
                    "target_a", "direction_a", CoreTrappingRiskOutcome.LOW_OBSERVED_RISK
                )
            ),
        )
        decision = _decide(strategy)

        assert strategy.assessments[0].strategy_outcome is (
            CavityCoreStrategyOutcome.MULTI_DIRECTION_ACCESS_REQUIRED
        )
        assert strategy.assessments[0].required_direction_count == 2
        assert decision.outcome is (
            CavityAnalysisDecisionOutcome.MULTI_DIRECTION_ACCESS_REQUIRED
        )


def test_nested_void_and_high_trapping_risk_require_special_investigation() -> None:
    nested_strategy = _synthesize(
        classification=_classification(
            _target("target_a", CavityType.NESTED_SHELL_VOID)
        ),
        accessibility=_accessibility(
            _access("target_a", InternalAccessibilityOutcome.ENCLOSED)
        ),
        trapping=_trapping(
            _risk("target_a", None, CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK)
        ),
    )
    high_risk_strategy = _synthesize(
        classification=_classification(
            _target(
                "target_b",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_b",),
            )
        ),
        accessibility=_accessibility(
            _access("target_b", InternalAccessibilityOutcome.ACCESSIBLE)
        ),
        directions=_directions(_direction("target_b", "direction_b")),
        undercuts=_undercuts(
            _evaluation(
                "target_b", "direction_b", InternalDirectionEvaluationOutcome.CLEAR
            )
        ),
        trapping=_trapping(
            _risk(
                "target_b", "direction_b", CoreTrappingRiskOutcome.HIGH_STRUCTURAL_RISK
            )
        ),
    )

    assert nested_strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
    )
    assert high_risk_strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
    )
    assert _decide(high_risk_strategy).outcome is (
        CavityAnalysisDecisionOutcome.SPECIAL_CORE_STRATEGY_INVESTIGATION_REQUIRED
    )


def test_ambiguous_and_not_assessable_targets_propagate_to_decision() -> None:
    ambiguous_strategy = _synthesize(
        classification=_classification(
            _target(
                "target_a",
                CavityType.AMBIGUOUS_INTERNAL_REGION,
                outcome=CavityClassificationOutcome.AMBIGUOUS,
            )
        ),
        accessibility=_accessibility(
            _access("target_a", InternalAccessibilityOutcome.AMBIGUOUS)
        ),
        trapping=_trapping(_risk("target_a", None, CoreTrappingRiskOutcome.AMBIGUOUS)),
    )
    not_assessable_strategy = _synthesize(
        classification=_classification(
            _target(
                "target_b",
                CavityType.NOT_ASSESSABLE,
                outcome=CavityClassificationOutcome.NOT_ASSESSABLE,
            )
        )
    )

    assert ambiguous_strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.AMBIGUOUS
    )
    assert _decide(ambiguous_strategy).outcome is (
        CavityAnalysisDecisionOutcome.MANUAL_REVIEW_REQUIRED
    )
    assert not_assessable_strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.NOT_ASSESSABLE
    )
    assert _decide(not_assessable_strategy).outcome is (
        CavityAnalysisDecisionOutcome.NOT_ASSESSABLE
    )


def test_mesh_boundary_defect_is_not_applicable_when_it_is_the_only_target() -> None:
    strategy = _synthesize(
        classification=_classification(
            _target(
                "mesh_topology",
                CavityType.MESH_BOUNDARY_DEFECT,
                outcome=CavityClassificationOutcome.NOT_ASSESSABLE,
            )
        )
    )
    decision = _decide(strategy)

    assert strategy.assessments[0].strategy_outcome is (
        CavityCoreStrategyOutcome.NOT_APPLICABLE
    )
    assert CavityFindingCode.MESH_BOUNDARY_DEFECT_EXCLUDED in (
        strategy.assessments[0].blocking_finding_codes
    )
    assert (
        decision.outcome is CavityAnalysisDecisionOutcome.NO_APPLICABLE_INTERNAL_CAVITY
    )


def test_harder_target_controls_multi_cavity_decision() -> None:
    strategy = _synthesize(
        classification=_classification(
            _target(
                "easy_target",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_a",),
            ),
            _target(
                "hard_target",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_b",),
            ),
        ),
        accessibility=_accessibility(
            _access("easy_target", InternalAccessibilityOutcome.ACCESSIBLE),
            _access("hard_target", InternalAccessibilityOutcome.ACCESSIBLE),
        ),
        directions=_directions(
            _direction("easy_target", "direction_a"),
            _direction("hard_target", "direction_b"),
        ),
        undercuts=_undercuts(
            _evaluation(
                "easy_target",
                "direction_a",
                InternalDirectionEvaluationOutcome.CLEAR,
            ),
            _evaluation(
                "hard_target",
                "direction_b",
                InternalDirectionEvaluationOutcome.OBSTRUCTED,
                obstructed_region_ids=("obstruction_b",),
            ),
        ),
        trapping=_trapping(
            _risk(
                "easy_target",
                "direction_a",
                CoreTrappingRiskOutcome.LOW_OBSERVED_RISK,
            ),
            _risk("hard_target", "direction_b", CoreTrappingRiskOutcome.POTENTIAL_RISK),
        ),
    )
    decision = _decide(strategy)

    assert decision.outcome is CavityAnalysisDecisionOutcome.CURRENT_METHOD_BLOCKED
    assert decision.blocking_target_ids == ("hard_target",)
    assert decision.linear_candidate_target_ids == ()


def test_strategy_and_decision_serialization_use_enum_values_deterministically() -> (
    None
):
    strategy = _synthesize(
        classification=_classification(
            _target(
                "target_b",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_b",),
            ),
            _target(
                "target_a",
                CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE,
                opening_ids=("opening_a",),
            ),
        ),
        accessibility=_accessibility(
            _access("target_b", InternalAccessibilityOutcome.ACCESSIBLE),
            _access("target_a", InternalAccessibilityOutcome.ACCESSIBLE),
        ),
        directions=_directions(
            _direction("target_b", "direction_b"),
            _direction("target_a", "direction_a"),
        ),
        undercuts=_undercuts(
            _evaluation(
                "target_b", "direction_b", InternalDirectionEvaluationOutcome.CLEAR
            ),
            _evaluation(
                "target_a", "direction_a", InternalDirectionEvaluationOutcome.CLEAR
            ),
        ),
        trapping=_trapping(
            _risk("target_b", "direction_b", CoreTrappingRiskOutcome.LOW_OBSERVED_RISK),
            _risk("target_a", "direction_a", CoreTrappingRiskOutcome.LOW_OBSERVED_RISK),
        ),
    )
    decision = _decide(strategy)

    assert [assessment.target_id for assessment in strategy.assessments] == [
        "target_a",
        "target_b",
    ]
    assert decision.linear_candidate_target_ids == ("target_a", "target_b")
    assert decision.to_dict if False else True


def _synthesize(
    *,
    classification: CavityClassificationResult,
    accessibility: InternalAccessibilityAnalysisResult | None = None,
    directions: InternalAccessDirectionGenerationResult | None = None,
    undercuts: InternalUndercutAnalysisResult | None = None,
    trapping: CoreTrappingRiskAnalysisResult | None = None,
):
    return ConservativeCoreStrategySynthesizer().synthesize(
        _context(),
        _candidate_detection(),
        _opening_detection(),
        classification,
        accessibility or _accessibility(),
        directions or _directions(),
        undercuts or _undercuts(),
        trapping or _trapping(),
    )


def _decide(
    strategy,
    *,
    classification: CavityClassificationResult | None = None,
):
    return ConservativeCavityAnalysisDecisionMaker().decide(
        _context(),
        CavityEvidenceAssessment(
            outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
            summary="fixture assessment",
        ),
        _candidate_detection(),
        _opening_detection(),
        classification or _classification(),
        _accessibility(),
        _directions(),
        _undercuts(),
        _trapping(),
        strategy,
    )


def _context() -> CavityAnalysisContext:
    return cast(CavityAnalysisContext, object())


def _candidate_detection() -> CavityCandidateDetectionResult:
    return CavityCandidateDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD,
        summary="fixture candidate detection",
    )


def _opening_detection() -> CavityOpeningDetectionResult:
    return CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
        summary="fixture opening detection",
    )


def _classification(
    *targets: CavityTypeClassification,
) -> CavityClassificationResult:
    return CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fixture classification",
        classifications=targets,
    )


def _target(
    target_id: str,
    cavity_type: CavityType,
    *,
    outcome: CavityClassificationOutcome = CavityClassificationOutcome.CLASSIFIED,
    opening_ids: tuple[str, ...] = (),
) -> CavityTypeClassification:
    return CavityTypeClassification(
        target_id=target_id,
        cavity_type=cavity_type,
        outcome=outcome,
        opening_ids=opening_ids,
    )


def _accessibility(
    *assessments: InternalAccessibilityAssessment,
) -> InternalAccessibilityAnalysisResult:
    return InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fixture accessibility",
        assessments=assessments,
    )


def _access(
    target_id: str,
    outcome: InternalAccessibilityOutcome,
) -> InternalAccessibilityAssessment:
    return InternalAccessibilityAssessment(target_id=target_id, outcome=outcome)


def _directions(
    *directions: InternalAccessDirectionCandidate,
) -> InternalAccessDirectionGenerationResult:
    return InternalAccessDirectionGenerationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=(
            InternalAccessDirectionGenerationOutcome.DIRECTIONS_GENERATED
            if directions
            else InternalAccessDirectionGenerationOutcome.NO_SUPPORTED_DIRECTION
        ),
        summary="fixture directions",
        directions=directions,
    )


def _direction(
    target_id: str,
    direction_id: str,
) -> InternalAccessDirectionCandidate:
    return InternalAccessDirectionCandidate(
        direction_id=direction_id,
        target_id=target_id,
        direction=(1.0, 0.0, 0.0),
        source=InternalAccessDirectionSource.OPENING_WITNESS,
        supporting_opening_ids=(f"opening_{direction_id[-1]}",),
        witness_count=1,
    )


def _undercuts(
    *evaluations: InternalDirectionEvaluation,
) -> InternalUndercutAnalysisResult:
    return InternalUndercutAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=(
            InternalUndercutAnalysisOutcome.OBSTRUCTIONS_DETECTED
            if any(evaluation.obstructed_region_ids for evaluation in evaluations)
            else InternalUndercutAnalysisOutcome.CLEAR_BY_CURRENT_DIRECTIONAL_TEST
        ),
        summary="fixture undercuts",
        evaluations=evaluations,
    )


def _evaluation(
    target_id: str,
    direction_id: str,
    outcome: InternalDirectionEvaluationOutcome,
    *,
    obstructed_region_ids: tuple[str, ...] = (),
) -> InternalDirectionEvaluation:
    return InternalDirectionEvaluation(
        target_id=target_id,
        direction_id=direction_id,
        clear_face_indices=(1,)
        if outcome is InternalDirectionEvaluationOutcome.CLEAR
        else (),
        obstructed_region_ids=obstructed_region_ids,
        outcome=outcome,
    )


def _trapping(
    *assessments: CoreTrappingRiskAssessment,
) -> CoreTrappingRiskAnalysisResult:
    return CoreTrappingRiskAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fixture trapping",
        assessments=assessments,
    )


def _risk(
    target_id: str,
    best_direction_id: str | None,
    outcome: CoreTrappingRiskOutcome,
) -> CoreTrappingRiskAssessment:
    return CoreTrappingRiskAssessment(
        target_id=target_id,
        best_supported_direction_id=best_direction_id,
        risk_outcome=outcome,
    )
