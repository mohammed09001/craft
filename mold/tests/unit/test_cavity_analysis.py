from __future__ import annotations

from dataclasses import FrozenInstanceError
from enum import Enum
from pathlib import Path

import pytest

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisBlocker,
    CavityAnalysisContext,
    CavityAnalysisReport,
    CavityAssessmentOutcome,
    CavityCandidateDetectionOutcome,
    CavityCandidateDetectionResult,
    CavityConnectivityClassification,
    CavityEvidenceAssessment,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
    InternalCavityCandidate,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    DetailedMoldAnalysisBlocker,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    ManufacturabilityRisk,
    MoldabilityActionIndication,
    MoldabilityEvidenceQuality,
    MoldabilityStatus,
    PreliminaryMoldabilityAssessment,
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
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis import CavityAnalysisService
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


class RecordingCavityEvidenceAssessor:
    def __init__(self, assessment: CavityEvidenceAssessment) -> None:
        self.assessment = assessment
        self.call_count = 0

    def assess(self, context: CavityAnalysisContext) -> CavityEvidenceAssessment:
        self.call_count += 1
        assert context.import_report.processing_decision is not None
        return self.assessment


class RecordingCavityCandidateDetector:
    def __init__(self, result: CavityCandidateDetectionResult) -> None:
        self.result = result
        self.call_count = 0

    def detect(
        self,
        context: CavityAnalysisContext,
    ) -> CavityCandidateDetectionResult:
        self.call_count += 1
        assert context.import_report.processing_decision is not None
        return self.result


def _build_model(*, source_name: str = "sample.stl") -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=10.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=10.0, z=0.0),
        Vertex(x=0.0, y=0.0, z=10.0),
    ]
    return ImportedModel(
        source_path=Path(f"models/{source_name}"),
        source_name=source_name,
        file_format=ModelFormat.STL,
        vertices=vertices,
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=3, vertex_3=1),
            Face(vertex_1=0, vertex_2=2, vertex_3=3),
            Face(vertex_1=1, vertex_2=3, vertex_3=2),
        ],
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0),
            maximum=Vertex(x=10.0, y=10.0, z=10.0),
        ),
        dimensions=Dimensions(x=10.0, y=10.0, z=10.0),
        warnings=[],
        metadata={"fixture": source_name},
    )


def _build_import_report(
    *,
    status: ModelProcessingStatus = ModelProcessingStatus.READY,
    source_name: str = "sample.stl",
    with_processing_decision: bool = True,
) -> ImportAnalysisReport:
    processing_decision = None
    if with_processing_decision:
        processing_decision = ModelProcessingDecision(
            status=status,
            issue_counts=IssueSeverityCounts(),
        )

    return ImportAnalysisReport(
        status=ImportAnalysisReportStatus.READY,
        source=ImportAnalysisSource(
            source_name=source_name,
            source_path=f"models/{source_name}",
            file_format="stl",
        ),
        import_succeeded=True,
        analysis_completed=True,
        summary="Chapter 2 fixture report.",
        issue_counts=IssueSeverityCounts(),
        processing_decision=processing_decision,
    )


def _build_preliminary_assessment(
    *,
    status: MoldabilityStatus = MoldabilityStatus.ADDITIONAL_ACTIONS_LIKELY,
    core_or_insert_indication: MoldabilityActionIndication = (
        MoldabilityActionIndication.NOT_ASSESSED
    ),
    manual_review_required: bool = False,
) -> PreliminaryMoldabilityAssessment:
    return PreliminaryMoldabilityAssessment(
        status=status,
        is_assessable=status is not MoldabilityStatus.NOT_ASSESSABLE,
        overall_risk=ManufacturabilityRisk.LOW,
        simple_mold_possible=status is MoldabilityStatus.SIMPLE_MOLD_POSSIBLE,
        side_action_indication=MoldabilityActionIndication.NOT_INDICATED,
        core_or_insert_indication=core_or_insert_indication,
        manual_review_required=manual_review_required,
        direct_generation_blocked=(
            status is MoldabilityStatus.BLOCKED_FOR_DIRECT_GENERATION
        ),
        ambiguity_detected=manual_review_required,
        evidence_quality=MoldabilityEvidenceQuality.HIGH,
        summary="Preliminary Chapter 3 fixture assessment.",
    )


def _build_detailed_report(
    *,
    source_name: str = "sample.stl",
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
    preliminary_moldability_assessment: PreliminaryMoldabilityAssessment | None = None,
    blockers: tuple[DetailedMoldAnalysisBlocker, ...] = (),
    processing_decision: ModelProcessingDecision | None = None,
    summary: str = "Detailed mold analysis fixture report.",
) -> DetailedMoldAnalysisReport:
    return DetailedMoldAnalysisReport(
        status=status,
        source=ImportAnalysisSource(
            source_name=source_name,
            source_path=f"models/{source_name}",
            file_format="stl",
        ),
        summary=summary,
        chapter_2_status=ImportAnalysisReportStatus.READY,
        processing_decision=processing_decision,
        blockers=blockers,
        preliminary_moldability_assessment=preliminary_moldability_assessment,
    )


def _build_detection_result(
    *,
    outcome: CavityCandidateDetectionOutcome = (
        CavityCandidateDetectionOutcome.NO_CANDIDATE_DETECTED_BY_CURRENT_METHOD
    ),
    status: DetailedMoldAnalysisStatus = DetailedMoldAnalysisStatus.COMPLETED,
    candidates: tuple[InternalCavityCandidate, ...] = (),
    findings: tuple[CavityFinding, ...] = (),
    summary: str = (
        "No cavity candidate was detected by the current shell/topology method."
    ),
) -> CavityCandidateDetectionResult:
    return CavityCandidateDetectionResult(
        status=status,
        outcome=outcome,
        summary=summary,
        candidates=candidates,
        findings=findings,
    )


def test_context_is_created_from_reports_without_copying_geometry() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        processing_decision=import_report.processing_decision,
    )

    context = CavityAnalysisContext.from_reports(
        import_report,
        detailed_report,
        model,
    )

    assert context.import_report is import_report
    assert context.detailed_mold_analysis_report is detailed_report
    assert context.model is model


def test_context_rejects_mismatched_sources() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        source_name="other.stl",
        processing_decision=import_report.processing_decision,
    )

    with pytest.raises(ValueError, match="matching Chapter 2 and Chapter 3 sources"):
        CavityAnalysisContext.from_reports(import_report, detailed_report, model)


def test_service_short_circuits_when_chapter_2_is_blocked() -> None:
    model = _build_model()
    import_report = _build_import_report(status=ModelProcessingStatus.REQUIRES_REPAIR)
    detailed_report = _build_detailed_report(
        processing_decision=import_report.processing_decision,
    )
    assessor = RecordingCavityEvidenceAssessor(
        CavityEvidenceAssessment(
            outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
            summary="should not be used",
        )
    )
    detector = RecordingCavityCandidateDetector(_build_detection_result())

    report = CavityAnalysisService(
        evidence_assessor=assessor,
        candidate_detector=detector,
    ).analyze(
        import_report,
        detailed_report,
        model,
    )

    assert report.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.assessment_outcome is (
        CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED
    )
    assert assessor.call_count == 0
    assert detector.call_count == 0


def test_service_short_circuits_when_chapter_3_is_blocked() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        status=DetailedMoldAnalysisStatus.BLOCKED,
        blockers=(
            DetailedMoldAnalysisBlocker(
                code="missing_selection",
                message="Chapter 3 could not continue.",
            ),
        ),
        processing_decision=import_report.processing_decision,
    )
    assessor = RecordingCavityEvidenceAssessor(
        CavityEvidenceAssessment(
            outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
            summary="should not be used",
        )
    )
    detector = RecordingCavityCandidateDetector(_build_detection_result())

    report = CavityAnalysisService(
        evidence_assessor=assessor,
        candidate_detector=detector,
    ).analyze(
        import_report,
        detailed_report,
        model,
    )

    assert report.status is DetailedMoldAnalysisStatus.BLOCKED
    assert report.blockers[0].code == "missing_selection"
    assert assessor.call_count == 0
    assert detector.call_count == 0


def test_service_passes_valid_reports_to_injected_assessor_once() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        processing_decision=import_report.processing_decision,
    )
    assessor = RecordingCavityEvidenceAssessor(
        CavityEvidenceAssessment(
            outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
            summary="No structured cavity evidence was found.",
            findings=(
                CavityFinding(
                    code=CavityFindingCode.NO_STRUCTURED_CAVITY_EVIDENCE,
                    source=CavityFindingSource.CAVITY_EVIDENCE_ASSESSOR,
                    severity=IssueSeverity.INFO,
                    message="No structured internal-cavity evidence was available.",
                ),
            ),
        )
    )
    detector = RecordingCavityCandidateDetector(
        _build_detection_result(
            findings=(
                CavityFinding(
                    code=(
                        CavityFindingCode.NO_CANDIDATE_DETECTED_BY_CURRENT_SHELL_TOPOLOGY_METHOD
                    ),
                    source=CavityFindingSource.CAVITY_CANDIDATE_DETECTOR,
                    severity=IssueSeverity.INFO,
                    message=(
                        "No cavity candidate was detected by the current shell/topology "
                        "method."
                    ),
                ),
            ),
        )
    )

    report = CavityAnalysisService(
        evidence_assessor=assessor,
        candidate_detector=detector,
    ).analyze(
        import_report,
        detailed_report,
        model,
    )

    assert report.status is DetailedMoldAnalysisStatus.COMPLETED
    assert report.assessment_outcome is (
        CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE
    )
    assert assessor.call_count == 1
    assert detector.call_count == 1
    assert report.candidate_detection is detector.result


def test_chapter_3_not_assessable_becomes_not_yet_geometrically_assessed() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        preliminary_moldability_assessment=_build_preliminary_assessment(
            status=MoldabilityStatus.NOT_ASSESSABLE,
        ),
        processing_decision=import_report.processing_decision,
    )

    report = CavityAnalysisService().analyze(import_report, detailed_report, model)

    assert report.status is DetailedMoldAnalysisStatus.COMPLETED
    assert report.assessment_outcome is (
        CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED
    )
    assert CavityFindingCode.CHAPTER_3_NOT_ASSESSABLE in {
        finding.code for finding in report.findings
    }


def test_structured_core_indication_becomes_review_outcome() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        preliminary_moldability_assessment=_build_preliminary_assessment(
            core_or_insert_indication=MoldabilityActionIndication.LIKELY,
        ),
        processing_decision=import_report.processing_decision,
    )

    report = CavityAnalysisService().analyze(import_report, detailed_report, model)

    assert report.assessment_outcome is (
        CavityAssessmentOutcome.CORE_OR_INSERT_REVIEW_INDICATED
    )
    assert report.upstream_core_or_insert_indication is (
        MoldabilityActionIndication.LIKELY
    )
    assert CavityFindingCode.UPSTREAM_CORE_OR_INSERT_INDICATED in {
        finding.code for finding in report.findings
    }


def test_manual_review_remains_separate_from_core_feasibility() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        preliminary_moldability_assessment=_build_preliminary_assessment(
            status=MoldabilityStatus.MANUAL_REVIEW_REQUIRED,
            manual_review_required=True,
        ),
        processing_decision=import_report.processing_decision,
    )

    report = CavityAnalysisService().analyze(import_report, detailed_report, model)

    assert report.assessment_outcome is CavityAssessmentOutcome.MANUAL_REVIEW_REQUIRED
    assert report.upstream_core_or_insert_indication is (
        MoldabilityActionIndication.NOT_ASSESSED
    )


def test_warning_text_is_not_used_as_cavity_evidence() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        preliminary_moldability_assessment=_build_preliminary_assessment(),
        processing_decision=import_report.processing_decision,
        summary="Potential core cavity words appear here, but only as text.",
    )

    report = CavityAnalysisService().analyze(import_report, detailed_report, model)

    assert report.assessment_outcome is (
        CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE
    )
    assert report.upstream_core_or_insert_indication is (
        MoldabilityActionIndication.NOT_ASSESSED
    )


def test_report_to_dict_is_deterministic_and_serialization_safe() -> None:
    model = _build_model()
    import_report = _build_import_report()
    detailed_report = _build_detailed_report(
        preliminary_moldability_assessment=_build_preliminary_assessment(
            core_or_insert_indication=MoldabilityActionIndication.LIKELY,
        ),
        processing_decision=import_report.processing_decision,
    )

    detector = RecordingCavityCandidateDetector(
        _build_detection_result(
            outcome=CavityCandidateDetectionOutcome.CANDIDATES_DETECTED,
            candidates=(
                InternalCavityCandidate(
                    candidate_id="cavity_candidate_001",
                    component_index=1,
                    connectivity_classification=(
                        CavityConnectivityClassification.ENCLOSED
                    ),
                    parent_component_index=0,
                    nesting_depth=1,
                    is_potential_void_boundary=True,
                    minimum_face_index=12,
                    findings=(
                        CavityFinding(
                            code=(
                                CavityFindingCode.NESTED_CLOSED_SHELL_CANDIDATE_DETECTED
                            ),
                            source=CavityFindingSource.CAVITY_CANDIDATE_DETECTOR,
                            severity=IssueSeverity.INFO,
                            message="Nested cavity candidate detected.",
                        ),
                    ),
                ),
            ),
            findings=(
                CavityFinding(
                    code=CavityFindingCode.NESTED_CLOSED_SHELL_CANDIDATE_DETECTED,
                    source=CavityFindingSource.CAVITY_CANDIDATE_DETECTOR,
                    severity=IssueSeverity.INFO,
                    message="Nested cavity candidate detected.",
                ),
            ),
            summary="Shell/topology cavity detection found 1 candidate.",
        )
    )

    report = CavityAnalysisService(candidate_detector=detector).analyze(
        import_report,
        detailed_report,
        model,
    )

    first = report.to_dict()
    second = report.to_dict()

    assert first == second
    assert first["schema_version"] == "1.0"
    assert first["status"] == "completed"
    assert first["assessment_outcome"] == "core_or_insert_review_indicated"
    assert first["candidate_detection"]["outcome"] == "candidates_detected"
    assert first["candidate_detection"]["candidates"][0]["candidate_id"] == (
        "cavity_candidate_001"
    )
    assert not any(isinstance(value, Enum) for value in first.values())


def test_report_defaults_are_not_shared_and_models_are_frozen() -> None:
    first_blocker = CavityAnalysisBlocker(code="a", message="first")
    second_blocker = CavityAnalysisBlocker(code="b", message="second")

    first = CavityAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=_build_import_report().source,
        summary="first",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        chapter_3_status=DetailedMoldAnalysisStatus.COMPLETED,
        assessment_outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
    )
    second = CavityAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=_build_import_report().source,
        summary="second",
        chapter_2_status=ImportAnalysisReportStatus.READY,
        chapter_3_status=DetailedMoldAnalysisStatus.COMPLETED,
        assessment_outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
    )

    assert first_blocker.metadata is not second_blocker.metadata
    assert first.blockers == ()
    assert second.findings == ()

    with pytest.raises(FrozenInstanceError):
        first.summary = "changed"
