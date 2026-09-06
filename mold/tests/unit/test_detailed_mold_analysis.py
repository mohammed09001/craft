from __future__ import annotations

from dataclasses import FrozenInstanceError
from pathlib import Path

import pytest

from mold_generator_engine.models.detailed_mold_analysis import (
    CandidatePullDirectionEvaluation,
    DetailedMoldAnalysisContext,
    DetailedMoldAnalysisReport,
    DetailedMoldAnalysisStatus,
    DraftAnalysisResult,
    MoldAnalysisModuleResult,
    MoldabilityEvidenceSummary,
    PreliminaryMoldabilityAssessment,
    PreliminaryPullDirectionSelection,
    PullDirectionCandidates,
    PullDirectionRankingResult,
    UndercutAnalysisResult,
    UndercutRiskAssessmentResult,
    UndercutRegionAnalysis,
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
from mold_generator_engine.models.issues import (
    IssueSeverity,
    IssueSource,
    ModelIssue,
)
from mold_generator_engine.pipeline.detailed_mold_analysis import (
    DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER,
    DEFAULT_DRAFT_ANGLE_ANALYZER,
    DEFAULT_MOLDABILITY_EVIDENCE_SUMMARIZER,
    DEFAULT_PRELIMINARY_MOLDABILITY_DECIDER,
    DEFAULT_PRELIMINARY_PULL_DIRECTION_SELECTOR,
    DEFAULT_PRELIMINARY_UNDERCUT_DETECTOR,
    DEFAULT_PULL_DIRECTION_RANKING_POLICY,
    DEFAULT_UNDERCUT_REGION_ANALYZER,
    DEFAULT_UNDERCUT_RISK_ASSESSOR,
    DetailedMoldAnalysisService,
    PullDirectionEvaluator,
)
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


class RecordingModule:
    def __init__(
        self,
        module_id: str,
        status: DetailedMoldAnalysisStatus,
        events: list[str],
    ) -> None:
        self._module_id = module_id
        self._status = status
        self._events = events

    @property
    def module_id(self) -> str:
        return self._module_id

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
    ) -> MoldAnalysisModuleResult:
        self._events.append(f"module:{self.module_id}")
        assert context.model.source_name == context.import_report.source.source_name
        return MoldAnalysisModuleResult(
            module_id=self.module_id,
            status=self._status,
            summary=f"{self.module_id} returned {self._status.value}.",
        )


class RecordingCandidatePullDirectionProvider:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_CANDIDATE_PULL_DIRECTION_PROVIDER
        self._events = events

    def generate_candidates(
        self,
        face_analysis,
    ) -> PullDirectionCandidates:
        self._events.append("pull_direction_provider")
        assert face_analysis.total_face_count > 0
        return self._delegate.generate_candidates(face_analysis)


class RecordingPullDirectionEvaluator:
    def __init__(self, events: list[str]) -> None:
        self._delegate = PullDirectionEvaluator()
        self._events = events

    def evaluate_candidates(
        self,
        face_analysis,
        candidates: PullDirectionCandidates,
    ) -> tuple[CandidatePullDirectionEvaluation, ...]:
        self._events.append("pull_direction_evaluator")
        assert candidates.candidate_count > 0
        return self._delegate.evaluate_candidates(face_analysis, candidates)


class RecordingPullDirectionRankingPolicy:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_PULL_DIRECTION_RANKING_POLICY
        self._events = events

    @property
    def policy_id(self) -> str:
        return self._delegate.policy_id

    def rank(
        self,
        evaluations: tuple[CandidatePullDirectionEvaluation, ...],
    ) -> PullDirectionRankingResult:
        self._events.append("pull_direction_ranking")
        assert evaluations
        return self._delegate.rank(evaluations)


class RecordingPreliminaryPullDirectionSelector:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_PRELIMINARY_PULL_DIRECTION_SELECTOR
        self._events = events

    def select_from_ranking(
        self,
        ranking: PullDirectionRankingResult,
    ) -> PreliminaryPullDirectionSelection:
        self._events.append("preliminary_selection")
        assert ranking.ranked_evaluations
        return self._delegate.select_from_ranking(ranking)


class RecordingUndercutAnalyzer:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_PRELIMINARY_UNDERCUT_DETECTOR
        self._events = events

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
    ) -> UndercutAnalysisResult:
        self._events.append("undercut_analysis")
        assert context.model.source_name == context.source.source_name
        assert preliminary_selection is not None
        return self._delegate.analyze(context, face_analysis, preliminary_selection)


class RecordingDraftAnalyzer:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_DRAFT_ANGLE_ANALYZER
        self._events = events

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
    ) -> DraftAnalysisResult:
        self._events.append("draft_analysis")
        assert context.processing_decision is not None
        assert preliminary_selection is not None
        return self._delegate.analyze(context, face_analysis, preliminary_selection)


class RecordingUndercutRegionAnalyzer:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_UNDERCUT_REGION_ANALYZER
        self._events = events

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        face_analysis,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_analysis: UndercutAnalysisResult | None,
        draft_analysis: DraftAnalysisResult | None,
    ) -> UndercutRegionAnalysis:
        self._events.append("undercut_region_analysis")
        assert preliminary_selection is not None
        assert undercut_analysis is not None
        return self._delegate.analyze(
            context,
            face_analysis,
            preliminary_selection,
            undercut_analysis,
            draft_analysis,
        )


class RecordingUndercutRiskAssessor:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_UNDERCUT_RISK_ASSESSOR
        self._events = events

    def analyze(
        self,
        context: DetailedMoldAnalysisContext,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_region_analysis: UndercutRegionAnalysis | None,
    ) -> UndercutRiskAssessmentResult:
        self._events.append("undercut_risk_assessment")
        assert preliminary_selection is not None
        assert undercut_region_analysis is not None
        return self._delegate.analyze(
            context,
            preliminary_selection,
            undercut_region_analysis,
        )


class RecordingMoldabilityEvidenceSummarizer:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_MOLDABILITY_EVIDENCE_SUMMARIZER
        self._events = events

    def summarize(
        self,
        context: DetailedMoldAnalysisContext,
        preliminary_selection: PreliminaryPullDirectionSelection | None,
        undercut_analysis: UndercutAnalysisResult | None,
        draft_analysis: DraftAnalysisResult | None,
        undercut_region_analysis: UndercutRegionAnalysis | None,
        undercut_risk_assessment: UndercutRiskAssessmentResult | None,
    ) -> MoldabilityEvidenceSummary:
        self._events.append("moldability_evidence_summary")
        assert preliminary_selection is not None
        assert undercut_analysis is not None
        assert undercut_region_analysis is not None
        assert undercut_risk_assessment is not None
        return self._delegate.summarize(
            context,
            preliminary_selection,
            undercut_analysis,
            draft_analysis,
            undercut_region_analysis,
            undercut_risk_assessment,
        )


class RecordingPreliminaryMoldabilityDecider:
    def __init__(self, events: list[str]) -> None:
        self._delegate = DEFAULT_PRELIMINARY_MOLDABILITY_DECIDER
        self._events = events

    def decide(
        self,
        evidence_summary: MoldabilityEvidenceSummary,
    ) -> PreliminaryMoldabilityAssessment:
        self._events.append("preliminary_moldability_decision")
        assert evidence_summary.findings
        return self._delegate.decide(evidence_summary)


def _build_model() -> ImportedModel:
    vertices = [
        Vertex(x=0.0, y=0.0, z=0.0),
        Vertex(x=1.0, y=0.0, z=0.0),
        Vertex(x=0.0, y=1.0, z=0.0),
        Vertex(x=0.0, y=0.0, z=1.0),
    ]
    return ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
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
            maximum=Vertex(x=1.0, y=1.0, z=1.0),
        ),
        dimensions=Dimensions(x=1.0, y=1.0, z=1.0),
        warnings=[],
        metadata={"origin": "test"},
    )


def _build_report(status: ModelProcessingStatus) -> ImportAnalysisReport:
    model_issue = ModelIssue(
        code="open_boundary_edges",
        message="Open boundary edges require repair.",
        source=IssueSource.TOPOLOGY_VALIDATION,
        severity=IssueSeverity.ERROR,
    )
    blocking_issues = (
        (model_issue,) if status is not ModelProcessingStatus.READY else ()
    )

    return ImportAnalysisReport(
        status=ImportAnalysisReportStatus.READY,
        source=ImportAnalysisSource(
            source_name="sample.stl",
            source_path="models/sample.stl",
            file_format="stl",
        ),
        import_succeeded=True,
        analysis_completed=True,
        summary="Chapter 2 placeholder report.",
        issue_counts=IssueSeverityCounts(
            error_count=int(status is not ModelProcessingStatus.READY)
        ),
        processing_decision=ModelProcessingDecision(
            status=status,
            issue_counts=IssueSeverityCounts(
                error_count=int(status is not ModelProcessingStatus.READY)
            ),
            contributing_issues=blocking_issues,
            blocking_issues=blocking_issues,
        ),
    )


def test_context_is_created_from_report_and_model_without_copying_geometry():
    model = _build_model()
    report = _build_report(ModelProcessingStatus.READY)

    context = DetailedMoldAnalysisContext.from_report(report, model)

    assert context.import_report is report
    assert context.model is model
    assert context.processing_decision is report.processing_decision


def test_service_returns_blocked_report_without_running_components() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.REQUIRES_REPAIR)
    events: list[str] = []
    service = DetailedMoldAnalysisService(
        modules=(
            RecordingModule(
                "orientation", DetailedMoldAnalysisStatus.COMPLETED, events
            ),
        ),
    )

    analysis_report = service.analyze(report, model)

    assert analysis_report.status is DetailedMoldAnalysisStatus.BLOCKED
    assert events == []
    assert [blocker.code for blocker in analysis_report.blockers] == [
        "open_boundary_edges"
    ]


def test_service_runs_injected_modules_in_order() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.READY)
    events: list[str] = []
    service = DetailedMoldAnalysisService(
        modules=(
            RecordingModule(
                "orientation", DetailedMoldAnalysisStatus.COMPLETED, events
            ),
            RecordingModule("draft", DetailedMoldAnalysisStatus.COMPLETED, events),
        ),
    )

    analysis_report = service.analyze(report, model)

    assert analysis_report.status in {
        DetailedMoldAnalysisStatus.COMPLETED,
        DetailedMoldAnalysisStatus.PARTIAL,
    }
    assert events == ["module:orientation", "module:draft"]
    assert [result.module_id for result in analysis_report.module_results] == [
        "orientation",
        "draft",
    ]


def test_service_does_not_mutate_the_original_imported_model() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.READY)
    before_metadata = dict(model.metadata)
    before_vertices = list(model.vertices)
    before_faces = list(model.faces)
    service = DetailedMoldAnalysisService(
        modules=(
            RecordingModule("orientation", DetailedMoldAnalysisStatus.COMPLETED, []),
        ),
    )

    service.analyze(report, model)

    assert model.metadata == before_metadata
    assert model.vertices == before_vertices
    assert model.faces == before_faces


def test_service_preserves_partial_status_when_components_do_not_all_finish() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.READY)
    service = DetailedMoldAnalysisService(
        modules=(
            RecordingModule("orientation", DetailedMoldAnalysisStatus.COMPLETED, []),
            RecordingModule("draft", DetailedMoldAnalysisStatus.FAILED, []),
        ),
    )

    analysis_report = service.analyze(report, model)

    assert analysis_report.status is DetailedMoldAnalysisStatus.PARTIAL


def test_result_models_are_immutable() -> None:
    report = DetailedMoldAnalysisReport(
        status=DetailedMoldAnalysisStatus.COMPLETED,
        source=_build_report(ModelProcessingStatus.READY).source,
        summary="Immutable placeholder report.",
        chapter_2_status=ImportAnalysisReportStatus.READY,
    )

    with pytest.raises(FrozenInstanceError):
        report.summary = "changed"


def test_service_can_attach_candidate_pull_direction_evaluations() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.READY)
    service = DetailedMoldAnalysisService(
        pull_direction_evaluator=PullDirectionEvaluator(),
    )

    analysis_report = service.analyze(report, model)

    assert analysis_report.status in {
        DetailedMoldAnalysisStatus.COMPLETED,
        DetailedMoldAnalysisStatus.PARTIAL,
    }
    assert len(analysis_report.pull_direction_evaluations) >= 6
    assert analysis_report.pull_direction_ranking is not None
    assert analysis_report.preliminary_pull_direction_selection is not None
    assert analysis_report.undercut_analysis is not None
    assert analysis_report.draft_analysis is not None
    assert analysis_report.undercut_region_analysis is not None
    assert analysis_report.undercut_risk_assessment is not None
    assert analysis_report.preliminary_moldability_assessment is not None
    assert [result.module_id for result in analysis_report.module_results[-8:]] == [
        "candidate_pull_direction_evaluation",
        "preliminary_pull_direction_selection",
        "preliminary_undercut_detection",
        "draft_angle_analysis",
        "undercut_region_analysis",
        "undercut_risk_assessment",
        "moldability_evidence_summary",
        "preliminary_moldability_assessment",
    ]


def test_service_runs_detailed_pipeline_stages_in_order() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.READY)
    events: list[str] = []
    service = DetailedMoldAnalysisService(
        candidate_pull_direction_provider=RecordingCandidatePullDirectionProvider(
            events
        ),
        pull_direction_evaluator=RecordingPullDirectionEvaluator(events),
        pull_direction_ranking_policy=RecordingPullDirectionRankingPolicy(events),
        preliminary_pull_direction_selector=(
            RecordingPreliminaryPullDirectionSelector(events)
        ),
        undercut_analyzer=RecordingUndercutAnalyzer(events),
        draft_angle_analyzer=RecordingDraftAnalyzer(events),
        undercut_region_analyzer=RecordingUndercutRegionAnalyzer(events),
        undercut_risk_assessor=RecordingUndercutRiskAssessor(events),
        moldability_evidence_summarizer=RecordingMoldabilityEvidenceSummarizer(
            events
        ),
        preliminary_moldability_decider=RecordingPreliminaryMoldabilityDecider(
            events
        ),
    )

    analysis_report = service.analyze(report, model)

    assert analysis_report.preliminary_moldability_assessment is not None
    assert events == [
        "pull_direction_provider",
        "pull_direction_evaluator",
        "pull_direction_ranking",
        "preliminary_selection",
        "undercut_analysis",
        "draft_analysis",
        "undercut_region_analysis",
        "undercut_risk_assessment",
        "moldability_evidence_summary",
        "preliminary_moldability_decision",
    ]


def test_blocked_report_to_dict_preserves_optional_fields_as_none() -> None:
    model = _build_model()
    report = _build_report(ModelProcessingStatus.REQUIRES_REPAIR)

    analysis_report = DetailedMoldAnalysisService().analyze(report, model)
    serialized = analysis_report.to_dict()

    assert isinstance(analysis_report, DetailedMoldAnalysisReport)
    assert serialized["schema_version"] == "1.0"
    assert serialized["status"] == "blocked"
    assert serialized["chapter_2_status"] == "ready"
    assert serialized["processing_decision"]["status"] == "requires_repair"
    assert serialized["module_results"] == []
    assert serialized["pull_direction_ranking"] is None
    assert serialized["preliminary_moldability_assessment"] is None
