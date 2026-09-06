from pathlib import Path

from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    ImportedModel,
    ModelFormat,
    Vertex,
)
from mold_generator_engine.models.issues import (
    GeometryValidationError,
    ImportWarning,
    IssueSeverity,
    IssueSource,
    TopologyIssue,
)
from mold_generator_engine.pipeline.processing_suitability import (
    DEFAULT_MODEL_PROCESSING_EVALUATOR,
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


def _build_model_with_issues(
    *issues: ImportWarning | GeometryValidationError | TopologyIssue,
) -> ImportedModel:
    model = ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
        file_format=ModelFormat.STL,
        vertices=[],
        faces=[],
        bounding_box=BoundingBox(
            minimum=Vertex(x=0.0, y=0.0, z=0.0),
            maximum=Vertex(x=0.0, y=0.0, z=0.0),
        ),
        dimensions=Dimensions(x=0.0, y=0.0, z=0.0),
        warnings=[],
        metadata={},
    )
    model.warnings = [issue for issue in issues if isinstance(issue, ImportWarning)]
    model.geometry_validation = model.geometry_validation.__class__(
        warnings=tuple(),
        errors=tuple(
            issue for issue in issues if isinstance(issue, GeometryValidationError)
        ),
        blocking_severities=model.geometry_validation.blocking_severities,
    )
    model.topology_validation = model.topology_validation.__class__(
        status=model.topology_validation.status,
        issues=tuple(issue for issue in issues if isinstance(issue, TopologyIssue)),
        blocking_severities=model.topology_validation.blocking_severities,
    )
    return model


def _evaluate(
    *issues: ImportWarning | GeometryValidationError | TopologyIssue,
) -> ModelProcessingDecision:
    return DEFAULT_MODEL_PROCESSING_EVALUATOR.evaluate_issues(issues)


def test_processing_decision_is_ready_without_diagnostics():
    decision = _evaluate()

    assert decision.status is ModelProcessingStatus.READY
    assert decision.is_processable is True
    assert decision.requires_repair is False
    assert decision.is_rejected is False
    assert decision.issue_counts == IssueSeverityCounts()


def test_processing_decision_keeps_info_only_models_ready():
    decision = _evaluate(
        ImportWarning(
            code="import_note",
            message="Reader note.",
            severity=IssueSeverity.INFO,
        )
    )

    assert decision.status is ModelProcessingStatus.READY
    assert (
        decision.summary
        == "Model is ready for processing with informational issues only."
    )


def test_processing_decision_with_single_warning_is_ready_with_warnings():
    decision = _evaluate(
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        )
    )

    assert decision.status is ModelProcessingStatus.READY_WITH_WARNINGS
    assert decision.is_processable is True
    assert decision.blocking_issues == ()


def test_processing_decision_with_multiple_warnings_is_ready_with_warnings():
    decision = _evaluate(
        TopologyIssue(
            code="isolated_vertices",
            message="Model contains isolated vertices that are not used by faces.",
            severity=IssueSeverity.WARNING,
        ),
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        ),
    )

    assert decision.status is ModelProcessingStatus.READY_WITH_WARNINGS
    assert decision.issue_counts.warning_count == 2


def test_processing_decision_with_repairable_error_requires_repair():
    decision = _evaluate(
        ImportWarning(
            code="degenerate_face",
            message="Degenerate face 1 has zero area.",
            source=IssueSource.GEOMETRY_VALIDATION,
            severity=IssueSeverity.ERROR,
        )
    )

    assert decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    assert decision.is_processable is False
    assert decision.requires_repair is True
    assert decision.is_rejected is False


def test_processing_decision_with_unrecoverable_error_is_rejected():
    decision = _evaluate(
        GeometryValidationError(
            code="missing_faces",
            message="Imported model contains no faces.",
            severity=IssueSeverity.CRITICAL,
        )
    )

    assert decision.status is ModelProcessingStatus.REJECTED
    assert decision.is_processable is False
    assert decision.requires_repair is False
    assert decision.is_rejected is True


def test_warning_and_repairable_error_require_repair():
    decision = _evaluate(
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        ),
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
        ),
    )

    assert decision.status is ModelProcessingStatus.REQUIRES_REPAIR


def test_unrecoverable_error_overrides_warnings_and_repairable_errors():
    decision = _evaluate(
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        ),
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
        ),
        TopologyIssue(
            code="non_manifold_edges",
            message="Model contains non-manifold edges.",
            severity=IssueSeverity.CRITICAL,
        ),
    )

    assert decision.status is ModelProcessingStatus.REJECTED


def test_unknown_error_defaults_to_requires_repair():
    decision = _evaluate(
        ImportWarning(
            code="unknown_error",
            message="Unexpected issue.",
            severity=IssueSeverity.ERROR,
        )
    )

    assert decision.status is ModelProcessingStatus.REQUIRES_REPAIR


def test_unknown_warning_defaults_to_ready_with_warnings():
    decision = _evaluate(
        ImportWarning(
            code="unknown_warning",
            message="Unexpected warning.",
            severity=IssueSeverity.WARNING,
        )
    )

    assert decision.status is ModelProcessingStatus.READY_WITH_WARNINGS


def test_changing_issue_order_does_not_change_decision():
    first_order = _evaluate(
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
        ),
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        ),
    )
    second_order = _evaluate(
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        ),
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
        ),
    )

    assert first_order == second_order


def test_processing_decision_counts_issue_severities_correctly():
    decision = _evaluate(
        ImportWarning(
            code="import_note",
            message="Reader note.",
            severity=IssueSeverity.INFO,
        ),
        TopologyIssue(
            code="duplicate_faces",
            message="Model contains duplicate triangle faces.",
            severity=IssueSeverity.WARNING,
        ),
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
        ),
        TopologyIssue(
            code="non_manifold_edges",
            message="Model contains non-manifold edges.",
            severity=IssueSeverity.CRITICAL,
        ),
    )

    assert decision.issue_counts == IssueSeverityCounts(
        info_count=1,
        warning_count=1,
        error_count=1,
        critical_count=1,
    )


def test_imported_model_processing_decision_uses_current_diagnostics():
    model = _build_model_with_issues(
        TopologyIssue(
            code="open_boundary_edges",
            message="Model contains open boundary edges and is not watertight.",
            severity=IssueSeverity.ERROR,
        )
    )

    first_decision = model.processing_decision
    model.topology_validation = model.topology_validation.__class__(
        status=model.topology_validation.status,
        issues=(),
        blocking_severities=model.topology_validation.blocking_severities,
    )
    second_decision = model.processing_decision

    assert first_decision.status is ModelProcessingStatus.REQUIRES_REPAIR
    assert second_decision.status is ModelProcessingStatus.READY
