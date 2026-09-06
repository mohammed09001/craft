from __future__ import annotations

from pathlib import Path

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityAnalysisDecision,
    CavityAnalysisDecisionOutcome,
    CavityCandidateDetectionOutcome,
    CavityCandidateDetectionResult,
    CavityClassificationOutcome,
    CavityClassificationResult,
    CavityCoreStrategyAssessment,
    CavityCoreStrategyOutcome,
    CavityFindingCode,
    CavityOpeningCandidate,
    CavityOpeningDetectionOutcome,
    CavityOpeningDetectionResult,
    CavityType,
    CavityTypeClassification,
    CoreTrappingRiskAnalysisResult,
    CoreTrappingRiskAssessment,
    CoreTrappingRiskOutcome,
    InternalAccessDirectionGenerationOutcome,
    InternalAccessDirectionGenerationResult,
    InternalAccessDirectionSource,
    InternalAccessibilityAnalysisResult,
    InternalAccessibilityAssessment,
    InternalAccessibilityOutcome,
    InternalSurfaceRegion,
    InternalUndercutAnalysisOutcome,
    InternalUndercutAnalysisResult,
    PreliminaryCoreStrategyAssessment,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
)
from mold_generator_engine.models.import_analysis_report import (
    ImportAnalysisReport,
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    ImportedModel,
    ModelFormat,
    Vertex,
)
from mold_generator_engine.pipeline.cavity_analysis import (
    CavityAnalysisService,
    ConservativeCavityClassifier,
    ConservativeCavityOpeningDetector,
    DirectionalInternalUndercutAnalyzer,
    LineOfSightInternalAccessibilityAnalyzer,
    OpeningEvidenceInternalAccessDirectionGenerator,
    PreliminaryCoreTrappingRiskAnalyzer,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


def test_closed_cube_has_no_internal_region_or_opening_candidate() -> None:
    model = _voxel_model(_solid_block(4, 4, 4))
    result = ConservativeCavityOpeningDetector().detect(
        _build_context(model),
        _empty_candidate_detection(),
    )

    assert result.status is DetailedMoldAnalysisStatus.COMPLETED
    assert result.outcome is (
        CavityOpeningDetectionOutcome.NO_OPENING_CANDIDATE_DETECTED_BY_CURRENT_METHOD
    )
    assert result.regions == ()
    assert result.openings == ()


def test_single_shell_blind_pocket_is_classified_as_pocket_candidate() -> None:
    occupied = _solid_block(5, 5, 5) - {(0, 2, 2), (1, 2, 2), (2, 2, 2)}
    model = _voxel_model(occupied)
    context = _build_context(model)

    opening_detection = ConservativeCavityOpeningDetector().detect(
        context,
        _empty_candidate_detection(),
    )
    classification = ConservativeCavityClassifier().classify(
        context,
        _empty_candidate_detection(),
        opening_detection,
    )
    accessibility = LineOfSightInternalAccessibilityAnalyzer().analyze(
        context,
        opening_detection,
        classification,
    )

    assert opening_detection.outcome is (
        CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED
    )
    assert len(opening_detection.regions) == 1
    assert len(opening_detection.openings) == 1
    assert classification.classifications[0].cavity_type is (
        CavityType.EXTERIOR_CONNECTED_POCKET_CANDIDATE
    )
    assert accessibility.assessments[0].outcome is (
        InternalAccessibilityOutcome.PARTIALLY_ACCESSIBLE
    )
    assert CavityFindingCode.OPENING_WITNESS_IS_NOT_MANUFACTURING_OPENING_PROOF in {
        finding.code for finding in opening_detection.findings
    }
    assert CavityFindingCode.LINE_OF_SIGHT_IS_NOT_CORE_INSERTION_PATH_PROOF in {
        finding.code for finding in accessibility.findings
    }


def test_through_channel_reports_two_independent_opening_witness_groups() -> None:
    occupied = _solid_block(5, 5, 5) - {(x, 2, 2) for x in range(5)}
    model = _voxel_model(occupied)
    context = _build_context(model)

    opening_detection = ConservativeCavityOpeningDetector().detect(
        context,
        _empty_candidate_detection(),
    )
    classification = ConservativeCavityClassifier().classify(
        context,
        _empty_candidate_detection(),
        opening_detection,
    )

    assert len(opening_detection.openings) == 2
    assert {
        opening.representative_direction for opening in opening_detection.openings
    } == {(-1.0, 0.0, 0.0), (1.0, 0.0, 0.0)}
    assert classification.classifications[0].cavity_type is (
        CavityType.THROUGH_CHANNEL_CANDIDATE
    )


def test_multi_opening_region_reports_more_than_two_witness_groups() -> None:
    air = {(x, 2, 2) for x in range(5)} | {(2, y, 2) for y in range(5)}
    model = _voxel_model(_solid_block(5, 5, 5) - air)
    context = _build_context(model)

    opening_detection = ConservativeCavityOpeningDetector().detect(
        context,
        _empty_candidate_detection(),
    )
    classification = ConservativeCavityClassifier().classify(
        context,
        _empty_candidate_detection(),
        opening_detection,
    )

    assert len(opening_detection.openings) == 4
    assert classification.classifications[0].cavity_type is (
        CavityType.MULTI_OPENING_REGION_CANDIDATE
    )


def test_ordinary_exterior_corner_concavity_is_not_confirmed_as_cavity() -> None:
    model = _voxel_model(_solid_block(4, 4, 4) - {(0, 0, 0)})

    result = ConservativeCavityOpeningDetector().detect(
        _build_context(model),
        _empty_candidate_detection(),
    )

    assert result.regions == ()
    assert result.openings == ()


def test_open_mesh_boundary_defect_is_not_promoted_to_opening_candidate() -> None:
    model = _voxel_model(_solid_block(2, 2, 2))
    model.faces.pop()

    result = ConservativeCavityOpeningDetector().detect(
        _build_context(model),
        _empty_candidate_detection(),
    )

    assert result.outcome is CavityOpeningDetectionOutcome.NOT_ASSESSABLE
    assert result.openings == ()
    assert (
        CavityFindingCode.MESH_BOUNDARY_PREVENTS_RELIABLE_CONNECTIVITY_CLASSIFICATION
        in {finding.code for finding in result.findings}
    )


def test_reversed_global_face_orientation_keeps_pocket_detection_stable() -> None:
    occupied = _solid_block(5, 5, 5) - {(0, 2, 2), (1, 2, 2), (2, 2, 2)}
    model = _voxel_model(occupied, reverse_faces=True)

    result = ConservativeCavityOpeningDetector().detect(
        _build_context(model),
        _empty_candidate_detection(),
    )

    assert result.outcome is (
        CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED
    )
    assert len(result.openings) == 1


def test_accessibility_direction_ordering_is_deterministic() -> None:
    occupied = _solid_block(5, 5, 5) - {(x, 2, 2) for x in range(5)}
    model = _voxel_model(occupied)
    context = _build_context(model)
    detector = ConservativeCavityOpeningDetector()
    classifier = ConservativeCavityClassifier()
    analyzer = LineOfSightInternalAccessibilityAnalyzer()

    first_openings = detector.detect(context, _empty_candidate_detection())
    first_classification = classifier.classify(
        context,
        _empty_candidate_detection(),
        first_openings,
    )
    first_accessibility = analyzer.analyze(
        context,
        first_openings,
        first_classification,
    )
    second_openings = detector.detect(context, _empty_candidate_detection())
    second_classification = classifier.classify(
        context,
        _empty_candidate_detection(),
        second_openings,
    )
    second_accessibility = analyzer.analyze(
        context,
        second_openings,
        second_classification,
    )

    assert first_openings.to_dict if False else True
    assert first_openings == second_openings
    assert first_classification == second_classification
    assert first_accessibility == second_accessibility
    assert first_accessibility.assessments[0].direction_evidence == (
        (-1.0, 0.0, 0.0),
        (1.0, 0.0, 0.0),
    )


def test_access_direction_generation_merges_close_witnesses_without_antipodal_merge() -> None:
    opening_detection = CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
        summary="fixture openings",
        openings=(
            CavityOpeningCandidate(
                opening_id="opening_b",
                region_id="region",
                witness_count=2,
                representative_direction=(1.0, 0.0, 0.0),
                witness_directions=((1.0, 0.0, 0.0), (1.0, 0.0, 0.0)),
            ),
            CavityOpeningCandidate(
                opening_id="opening_a",
                region_id="region",
                witness_count=1,
                representative_direction=(-1.0, 0.0, 0.0),
                witness_directions=((-1.0, 0.0, 0.0),),
            ),
        ),
    )
    context = _build_context(_voxel_model(_solid_block(2, 2, 2)))
    classification = CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="classified",
    )
    accessibility = InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="accessible",
    )

    first = OpeningEvidenceInternalAccessDirectionGenerator().generate(
        context,
        opening_detection,
        classification,
        accessibility,
    )
    second = OpeningEvidenceInternalAccessDirectionGenerator().generate(
        context,
        opening_detection,
        classification,
        accessibility,
    )

    assert first == second
    assert first.outcome is InternalAccessDirectionGenerationOutcome.DIRECTIONS_GENERATED
    assert len(first.directions) == 2
    assert {direction.direction for direction in first.directions} == {
        (-1.0, 0.0, 0.0),
        (1.0, 0.0, 0.0),
    }
    assert all(
        direction.source is InternalAccessDirectionSource.OPENING_WITNESS
        for direction in first.directions
    )


def test_simple_pocket_directional_analysis_reports_low_observed_trapping_risk() -> None:
    occupied = _solid_block(5, 5, 5) - {(0, 2, 2), (1, 2, 2), (2, 2, 2)}
    (
        context,
        candidate_detection,
        opening_detection,
        classification,
        accessibility,
    ) = _run_existing_cavity_stages(_voxel_model(occupied))

    directions = OpeningEvidenceInternalAccessDirectionGenerator().generate(
        context,
        opening_detection,
        classification,
        accessibility,
    )
    undercuts = DirectionalInternalUndercutAnalyzer().analyze(
        context,
        candidate_detection,
        opening_detection,
        directions,
    )
    trapping = PreliminaryCoreTrappingRiskAnalyzer().analyze(
        context,
        candidate_detection,
        opening_detection,
        classification,
        accessibility,
        directions,
        undercuts,
    )

    assert len(directions.directions) == 1
    assert undercuts.outcome is (
        InternalUndercutAnalysisOutcome.CLEAR_BY_CURRENT_DIRECTIONAL_TEST
    )
    assert undercuts.obstruction_regions == ()
    assert trapping.assessments[0].risk_outcome is (
        CoreTrappingRiskOutcome.LOW_OBSERVED_RISK
    )


def test_directional_obstruction_groups_edge_connected_faces_deterministically() -> None:
    model = _voxel_model(_solid_block(2, 2, 2))
    context = _build_context(model)
    candidate_detection = _empty_candidate_detection()
    opening_detection = CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
        summary="fixture opening",
        regions=(
            InternalSurfaceRegion(
                region_id="region",
                face_indices=(0, 1),
            ),
        ),
        openings=(
            CavityOpeningCandidate(
                opening_id="opening",
                region_id="region",
                witness_count=1,
                representative_direction=(1.0, 0.0, 0.0),
                witness_directions=((1.0, 0.0, 0.0),),
            ),
        ),
    )
    classification = CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="classified",
    )
    accessibility = InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="accessible",
    )
    directions = OpeningEvidenceInternalAccessDirectionGenerator().generate(
        context,
        opening_detection,
        classification,
        accessibility,
    )

    first = DirectionalInternalUndercutAnalyzer().analyze(
        context,
        candidate_detection,
        opening_detection,
        directions,
    )
    second = DirectionalInternalUndercutAnalyzer().analyze(
        context,
        candidate_detection,
        opening_detection,
        directions,
    )

    assert first == second
    assert first.outcome is InternalUndercutAnalysisOutcome.OBSTRUCTIONS_DETECTED
    assert first.obstruction_regions
    assert all(region.face_indices for region in first.obstruction_regions)


def test_enclosed_void_has_no_supported_access_direction() -> None:
    occupied = _solid_block(4, 4, 4) - {(1, 1, 1)}
    (
        context,
        _candidate_detection,
        opening_detection,
        classification,
        accessibility,
    ) = _run_existing_cavity_stages(_voxel_model(occupied))

    directions = OpeningEvidenceInternalAccessDirectionGenerator().generate(
        context,
        opening_detection,
        classification,
        accessibility,
    )

    assert directions.outcome is (
        InternalAccessDirectionGenerationOutcome.NO_SUPPORTED_DIRECTION
    )


def test_service_dependency_injection_calls_new_modules_in_order_and_serializes() -> None:
    model = _voxel_model(_solid_block(2, 2, 2))
    import_report, detailed_report = _build_reports(model)
    calls: list[str] = []
    opening_result = CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
        summary="fake opening",
    )
    classification_result = CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake classification",
        classifications=(
            CavityTypeClassification(
                target_id="region",
                cavity_type=CavityType.AMBIGUOUS_INTERNAL_REGION,
                outcome=CavityClassificationOutcome.AMBIGUOUS,
            ),
        ),
    )
    accessibility_result = InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake accessibility",
        assessments=(
            InternalAccessibilityAssessment(
                target_id="region",
                outcome=InternalAccessibilityOutcome.AMBIGUOUS,
            ),
        ),
    )

    report = CavityAnalysisService(
        opening_detector=_FakeOpeningDetector(calls, opening_result),
        cavity_classifier=_FakeClassifier(calls, classification_result),
        accessibility_analyzer=_FakeAccessibilityAnalyzer(calls, accessibility_result),
    ).analyze(import_report, detailed_report, model)

    assert calls == ["opening", "classification", "accessibility"]
    assert report.opening_detection is opening_result
    assert report.cavity_classification is classification_result
    assert report.internal_accessibility is accessibility_result
    serialized = report.to_dict()
    assert serialized["opening_detection"]["outcome"] == "opening_candidates_detected"
    assert serialized["cavity_classification"]["classifications"][0]["cavity_type"] == (
        "ambiguous_internal_region"
    )
    assert serialized["internal_accessibility"]["assessments"][0]["outcome"] == (
        "ambiguous"
    )


def test_service_dependency_injection_calls_direction_undercut_and_trapping_modules() -> None:
    model = _voxel_model(_solid_block(2, 2, 2))
    import_report, detailed_report = _build_reports(model)
    calls: list[str] = []
    opening_result = CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
        summary="fake opening",
    )
    classification_result = CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake classification",
    )
    accessibility_result = InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake accessibility",
    )
    direction_result = InternalAccessDirectionGenerationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=InternalAccessDirectionGenerationOutcome.NO_SUPPORTED_DIRECTION,
        summary="fake directions",
    )
    undercut_result = InternalUndercutAnalysisResult(
        status=DetailedMoldAnalysisStatus.PARTIAL,
        outcome=InternalUndercutAnalysisOutcome.NOT_ASSESSABLE,
        summary="fake undercut",
    )
    trapping_result = CoreTrappingRiskAnalysisResult(
        status=DetailedMoldAnalysisStatus.PARTIAL,
        summary="fake trapping",
        assessments=(
            CoreTrappingRiskAssessment(
                target_id="region",
                risk_outcome=CoreTrappingRiskOutcome.NOT_ASSESSABLE,
            ),
        ),
    )

    report = CavityAnalysisService(
        opening_detector=_FakeOpeningDetector(calls, opening_result),
        cavity_classifier=_FakeClassifier(calls, classification_result),
        accessibility_analyzer=_FakeAccessibilityAnalyzer(calls, accessibility_result),
        access_direction_generator=_FakeDirectionGenerator(calls, direction_result),
        internal_undercut_analyzer=_FakeUndercutAnalyzer(calls, undercut_result),
        core_trapping_risk_analyzer=_FakeTrappingAnalyzer(calls, trapping_result),
    ).analyze(import_report, detailed_report, model)

    assert calls == [
        "opening",
        "classification",
        "accessibility",
        "directions",
        "undercut",
        "trapping",
    ]
    assert report.internal_access_directions is direction_result
    assert report.internal_undercut_analysis is undercut_result
    assert report.core_trapping_risk is trapping_result
    serialized = report.to_dict()
    assert serialized["internal_access_directions"]["outcome"] == (
        "no_supported_direction"
    )
    assert serialized["internal_undercut_analysis"]["outcome"] == "not_assessable"
    assert serialized["core_trapping_risk"]["assessments"][0]["risk_outcome"] == (
        "not_assessable"
    )


def test_service_dependency_injection_calls_strategy_and_decision_modules() -> None:
    model = _voxel_model(_solid_block(2, 2, 2))
    import_report, detailed_report = _build_reports(model)
    calls: list[str] = []
    opening_result = CavityOpeningDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
        summary="fake opening",
    )
    classification_result = CavityClassificationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake classification",
    )
    accessibility_result = InternalAccessibilityAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake accessibility",
    )
    direction_result = InternalAccessDirectionGenerationResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=InternalAccessDirectionGenerationOutcome.NO_SUPPORTED_DIRECTION,
        summary="fake directions",
    )
    undercut_result = InternalUndercutAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=InternalUndercutAnalysisOutcome.NOT_ASSESSABLE,
        summary="fake undercut",
    )
    trapping_result = CoreTrappingRiskAnalysisResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake trapping",
    )
    strategy_result = PreliminaryCoreStrategyAssessment(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        summary="fake strategy",
        assessments=(
            CavityCoreStrategyAssessment(
                target_id="region",
                strategy_outcome=CavityCoreStrategyOutcome.NOT_APPLICABLE,
            ),
        ),
    )
    decision_result = CavityAnalysisDecision(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityAnalysisDecisionOutcome.NO_APPLICABLE_INTERNAL_CAVITY,
        summary="fake decision",
    )

    report = CavityAnalysisService(
        opening_detector=_FakeOpeningDetector(calls, opening_result),
        cavity_classifier=_FakeClassifier(calls, classification_result),
        accessibility_analyzer=_FakeAccessibilityAnalyzer(calls, accessibility_result),
        access_direction_generator=_FakeDirectionGenerator(calls, direction_result),
        internal_undercut_analyzer=_FakeUndercutAnalyzer(calls, undercut_result),
        core_trapping_risk_analyzer=_FakeTrappingAnalyzer(calls, trapping_result),
        core_strategy_synthesizer=_FakeStrategySynthesizer(calls, strategy_result),
        cavity_analysis_decision_maker=_FakeDecisionMaker(
            calls,
            strategy_result,
            decision_result,
        ),
    ).analyze(import_report, detailed_report, model)

    assert calls == [
        "opening",
        "classification",
        "accessibility",
        "directions",
        "undercut",
        "trapping",
        "strategy",
        "decision",
    ]
    assert report.preliminary_core_strategy is strategy_result
    assert report.cavity_analysis_decision is decision_result
    serialized = report.to_dict()
    assert serialized["preliminary_core_strategy"]["assessments"][0][
        "strategy_outcome"
    ] == "not_applicable"
    assert serialized["cavity_analysis_decision"]["outcome"] == (
        "no_applicable_internal_cavity"
    )


def test_service_does_not_run_downstream_modules_when_candidate_detection_blocks() -> None:
    model = _voxel_model(_solid_block(2, 2, 2))
    import_report, detailed_report = _build_reports(model)
    calls: list[str] = []

    report = CavityAnalysisService(
        candidate_detector=_BlockedCandidateDetector(),
        opening_detector=_FakeOpeningDetector(calls, CavityOpeningDetectionResult(
            status=DetailedMoldAnalysisStatus.COMPLETED,
            outcome=CavityOpeningDetectionOutcome.OPENING_CANDIDATES_DETECTED,
            summary="should not run",
        )),
    ).analyze(import_report, detailed_report, model)

    assert calls == []
    assert report.opening_detection is not None
    assert report.opening_detection.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.cavity_classification is not None
    assert report.cavity_classification.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.internal_accessibility is not None
    assert report.internal_accessibility.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.internal_access_directions is not None
    assert report.internal_access_directions.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.internal_undercut_analysis is not None
    assert report.internal_undercut_analysis.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.core_trapping_risk is not None
    assert report.core_trapping_risk.status is DetailedMoldAnalysisStatus.BLOCKED


class _FakeOpeningDetector:
    def __init__(
        self,
        calls: list[str],
        result: CavityOpeningDetectionResult,
    ) -> None:
        self._calls = calls
        self._result = result

    def detect(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
    ) -> CavityOpeningDetectionResult:
        del context, candidate_detection
        self._calls.append("opening")
        return self._result


class _FakeClassifier:
    def __init__(
        self,
        calls: list[str],
        result: CavityClassificationResult,
    ) -> None:
        self._calls = calls
        self._result = result

    def classify(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
    ) -> CavityClassificationResult:
        del context, candidate_detection, opening_detection
        self._calls.append("classification")
        return self._result


class _FakeAccessibilityAnalyzer:
    def __init__(
        self,
        calls: list[str],
        result: InternalAccessibilityAnalysisResult,
    ) -> None:
        self._calls = calls
        self._result = result

    def analyze(
        self,
        context: CavityAnalysisContext,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
    ) -> InternalAccessibilityAnalysisResult:
        del context, opening_detection, classification
        self._calls.append("accessibility")
        return self._result


class _FakeDirectionGenerator:
    def __init__(
        self,
        calls: list[str],
        result: InternalAccessDirectionGenerationResult,
    ) -> None:
        self._calls = calls
        self._result = result

    def generate(
        self,
        context: CavityAnalysisContext,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
    ) -> InternalAccessDirectionGenerationResult:
        del context, opening_detection, classification, accessibility
        self._calls.append("directions")
        return self._result


class _FakeUndercutAnalyzer:
    def __init__(
        self,
        calls: list[str],
        result: InternalUndercutAnalysisResult,
    ) -> None:
        self._calls = calls
        self._result = result

    def analyze(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        access_directions: InternalAccessDirectionGenerationResult,
    ) -> InternalUndercutAnalysisResult:
        del context, candidate_detection, opening_detection, access_directions
        self._calls.append("undercut")
        return self._result


class _FakeTrappingAnalyzer:
    def __init__(
        self,
        calls: list[str],
        result: CoreTrappingRiskAnalysisResult,
    ) -> None:
        self._calls = calls
        self._result = result

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
        del (
            context,
            candidate_detection,
            opening_detection,
            classification,
            accessibility,
            access_directions,
            undercut_analysis,
        )
        self._calls.append("trapping")
        return self._result


class _FakeStrategySynthesizer:
    def __init__(
        self,
        calls: list[str],
        result: PreliminaryCoreStrategyAssessment,
    ) -> None:
        self._calls = calls
        self._result = result

    def synthesize(
        self,
        context: CavityAnalysisContext,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
        core_trapping_risk: CoreTrappingRiskAnalysisResult,
    ) -> PreliminaryCoreStrategyAssessment:
        del (
            context,
            candidate_detection,
            opening_detection,
            classification,
            accessibility,
            access_directions,
            undercut_analysis,
            core_trapping_risk,
        )
        self._calls.append("strategy")
        return self._result


class _FakeDecisionMaker:
    def __init__(
        self,
        calls: list[str],
        expected_strategy: PreliminaryCoreStrategyAssessment,
        result: CavityAnalysisDecision,
    ) -> None:
        self._calls = calls
        self._expected_strategy = expected_strategy
        self._result = result

    def decide(
        self,
        context: CavityAnalysisContext,
        assessment,
        candidate_detection: CavityCandidateDetectionResult,
        opening_detection: CavityOpeningDetectionResult,
        classification: CavityClassificationResult,
        accessibility: InternalAccessibilityAnalysisResult,
        access_directions: InternalAccessDirectionGenerationResult,
        undercut_analysis: InternalUndercutAnalysisResult,
        core_trapping_risk: CoreTrappingRiskAnalysisResult,
        preliminary_core_strategy: PreliminaryCoreStrategyAssessment,
    ) -> CavityAnalysisDecision:
        del (
            context,
            assessment,
            candidate_detection,
            opening_detection,
            classification,
            accessibility,
            access_directions,
            undercut_analysis,
            core_trapping_risk,
        )
        self._calls.append("decision")
        assert preliminary_core_strategy is self._expected_strategy
        return self._result


class _BlockedCandidateDetector:
    def detect(
        self,
        context: CavityAnalysisContext,
    ) -> CavityCandidateDetectionResult:
        del context
        return CavityCandidateDetectionResult(
            status=DetailedMoldAnalysisStatus.BLOCKED,
            outcome=CavityCandidateDetectionOutcome.NOT_ASSESSABLE,
            summary="blocked candidate detection",
        )


def _empty_candidate_detection() -> CavityCandidateDetectionResult:
    return CavityCandidateDetectionResult(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        outcome=CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD,
        summary="no shell candidates",
    )


def _build_context(model: ImportedModel) -> CavityAnalysisContext:
    import_report, detailed_report = _build_reports(model)
    return CavityAnalysisContext.from_reports(import_report, detailed_report, model)


def _run_existing_cavity_stages(
    model: ImportedModel,
) -> tuple[
    CavityAnalysisContext,
    CavityCandidateDetectionResult,
    CavityOpeningDetectionResult,
    CavityClassificationResult,
    InternalAccessibilityAnalysisResult,
]:
    context = _build_context(model)
    candidate_detection = _empty_candidate_detection()
    opening_detection = ConservativeCavityOpeningDetector().detect(
        context,
        candidate_detection,
    )
    classification = ConservativeCavityClassifier().classify(
        context,
        candidate_detection,
        opening_detection,
    )
    accessibility = LineOfSightInternalAccessibilityAnalyzer().analyze(
        context,
        opening_detection,
        classification,
    )
    return (
        context,
        candidate_detection,
        opening_detection,
        classification,
        accessibility,
    )


def _build_reports(
    model: ImportedModel,
) -> tuple[ImportAnalysisReport, DetailedMoldAnalysisReport]:
    processing_decision = ModelProcessingDecision(
        status=ModelProcessingStatus.READY,
        issue_counts=IssueSeverityCounts(),
    )
    source = ImportAnalysisSource(
        source_name=model.source_name,
        source_path=str(model.source_path),
        file_format=model.file_format.value,
    )
    import_report = ImportAnalysisReport(
        status=ImportAnalysisReportStatus.READY,
        source=source,
        import_succeeded=True,
        analysis_completed=True,
        summary="fixture import report",
        issue_counts=IssueSeverityCounts(),
        processing_decision=processing_decision,
    )
    detailed_report = DetailedMoldAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=source,
        summary="fixture detailed report",
        chapter_2_status=import_report.status,
        processing_decision=processing_decision,
    )
    return import_report, detailed_report


def _solid_block(
    x_size: int,
    y_size: int,
    z_size: int,
) -> set[tuple[int, int, int]]:
    return {
        (x, y, z)
        for x in range(x_size)
        for y in range(y_size)
        for z in range(z_size)
    }


def _voxel_model(
    occupied_cells: set[tuple[int, int, int]],
    *,
    reverse_faces: bool = False,
) -> ImportedModel:
    vertex_indices: dict[tuple[int, int, int], int] = {}
    vertices: list[Vertex] = []
    faces: list[Face] = []

    def vertex_index(point: tuple[int, int, int]) -> int:
        if point not in vertex_indices:
            vertex_indices[point] = len(vertices)
            vertices.append(Vertex(x=float(point[0]), y=float(point[1]), z=float(point[2])))
        return vertex_indices[point]

    for cell in sorted(occupied_cells):
        x, y, z = cell
        for direction, quad in _cell_boundary_quads(x, y, z):
            neighbor = (x + direction[0], y + direction[1], z + direction[2])
            if neighbor in occupied_cells:
                continue
            indices = tuple(vertex_index(point) for point in quad)
            triangles = (
                Face(vertex_1=indices[0], vertex_2=indices[1], vertex_3=indices[2]),
                Face(vertex_1=indices[0], vertex_2=indices[2], vertex_3=indices[3]),
            )
            if reverse_faces:
                triangles = tuple(
                    Face(
                        vertex_1=face.vertex_1,
                        vertex_2=face.vertex_3,
                        vertex_3=face.vertex_2,
                    )
                    for face in triangles
                )
            faces.extend(triangles)

    minimum = Vertex(
        x=min(vertex.x for vertex in vertices),
        y=min(vertex.y for vertex in vertices),
        z=min(vertex.z for vertex in vertices),
    )
    maximum = Vertex(
        x=max(vertex.x for vertex in vertices),
        y=max(vertex.y for vertex in vertices),
        z=max(vertex.z for vertex in vertices),
    )
    return ImportedModel(
        source_path=Path("tests/generated/voxel_fixture.stl"),
        source_name="voxel_fixture.stl",
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=faces,
        bounding_box=BoundingBox(minimum=minimum, maximum=maximum),
        dimensions=Dimensions(
            x=maximum.x - minimum.x,
            y=maximum.y - minimum.y,
            z=maximum.z - minimum.z,
        ),
        warnings=[],
        metadata={"fixture": "voxel"},
    )


def _cell_boundary_quads(
    x: int,
    y: int,
    z: int,
) -> tuple[tuple[tuple[int, int, int], tuple[tuple[int, int, int], ...]], ...]:
    return (
        ((1, 0, 0), ((x + 1, y, z), (x + 1, y + 1, z), (x + 1, y + 1, z + 1), (x + 1, y, z + 1))),
        ((-1, 0, 0), ((x, y, z), (x, y, z + 1), (x, y + 1, z + 1), (x, y + 1, z))),
        ((0, 1, 0), ((x, y + 1, z), (x, y + 1, z + 1), (x + 1, y + 1, z + 1), (x + 1, y + 1, z))),
        ((0, -1, 0), ((x, y, z), (x + 1, y, z), (x + 1, y, z + 1), (x, y, z + 1))),
        ((0, 0, 1), ((x, y, z + 1), (x + 1, y, z + 1), (x + 1, y + 1, z + 1), (x, y + 1, z + 1))),
        ((0, 0, -1), ((x, y, z), (x, y + 1, z), (x + 1, y + 1, z), (x + 1, y, z))),
    )
