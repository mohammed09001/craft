from pathlib import Path

from mold_generator_engine.geometry.model_topology import ModelTopologyAnalysis
from mold_generator_engine.geometry.topology_validation import collect_topology_issues
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    GeometryValidationResult,
    ImportedModel,
    ModelFormat,
    TopologyValidationResult,
    Vertex,
)
from mold_generator_engine.models.issues import (
    GeometryValidationError,
    ImportWarning,
    IssueSeverity,
    IssueSource,
)
from mold_generator_engine.pipeline.issue_policy import (
    DEFAULT_ISSUE_SEVERITY_POLICY,
    classify_geometry_validation_result,
    classify_topology_issues,
)


def _build_empty_model() -> ImportedModel:
    return ImportedModel(
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


def test_issue_severity_enum_has_expected_levels():
    assert tuple(IssueSeverity) == (
        IssueSeverity.INFO,
        IssueSeverity.WARNING,
        IssueSeverity.ERROR,
        IssueSeverity.CRITICAL,
    )


def test_default_policy_classifies_all_current_geometry_issue_codes():
    warnings, errors = classify_geometry_validation_result(
        warnings=(
            ImportWarning(
                code="degenerate_face",
                message="Degenerate face 1 has zero area.",
                source=IssueSource.GEOMETRY_VALIDATION,
            ),
        ),
        errors=(
            GeometryValidationError(
                code="missing_vertices",
                message="Imported model contains no vertices.",
            ),
            GeometryValidationError(
                code="missing_faces",
                message="Imported model contains no faces.",
            ),
            GeometryValidationError(
                code="face_index_out_of_range",
                message="Face 1 references a vertex index outside the imported vertex list.",
            ),
        ),
    )

    assert [issue.severity for issue in warnings] == [IssueSeverity.ERROR]
    assert [issue.severity for issue in errors] == [
        IssueSeverity.CRITICAL,
        IssueSeverity.CRITICAL,
        IssueSeverity.CRITICAL,
    ]


def test_default_policy_classifies_all_current_topology_issue_codes():
    issues = classify_topology_issues(
        collect_topology_issues(
            ModelTopologyAnalysis(
                vertex_count=5,
                face_count=4,
                analyzed_face_count=4,
                excluded_degenerate_face_count=0,
                unique_edge_count=8,
                boundary_edges=((0, 1),),
                non_manifold_edges=((1, 2),),
                isolated_vertices=(4,),
                duplicate_faces=((0, 1, 2),),
                connected_component_count=2,
            )
        )
    )

    assert [(issue.code, issue.severity) for issue in issues] == [
        ("open_boundary_edges", IssueSeverity.ERROR),
        ("non_manifold_edges", IssueSeverity.CRITICAL),
        ("isolated_vertices", IssueSeverity.WARNING),
        ("duplicate_faces", IssueSeverity.WARNING),
        ("multiple_connected_components", IssueSeverity.WARNING),
    ]


def test_unknown_issue_codes_default_to_error_severity():
    issue = ImportWarning(
        code="unknown_code",
        message="Unexpected diagnostic.",
    )

    classified_issue = DEFAULT_ISSUE_SEVERITY_POLICY.classify_issues((issue,))[0]

    assert classified_issue.severity is IssueSeverity.ERROR


def test_geometry_validation_highest_severity_uses_classified_issues():
    warnings, errors = classify_geometry_validation_result(
        warnings=(
            ImportWarning(
                code="degenerate_face",
                message="Degenerate face 1 has zero area.",
                source=IssueSource.GEOMETRY_VALIDATION,
            ),
        ),
        errors=(
            GeometryValidationError(
                code="missing_faces",
                message="Imported model contains no faces.",
            ),
        ),
    )
    result = GeometryValidationResult(warnings=warnings, errors=errors)

    assert result.highest_severity is IssueSeverity.CRITICAL
    assert result.has_errors is True
    assert result.has_critical_issues is True
    assert result.has_blocking_issues is True


def test_warning_only_topology_result_is_not_blocking():
    result = TopologyValidationResult.completed(
        analysis=ModelTopologyAnalysis(
            vertex_count=4,
            face_count=1,
            analyzed_face_count=1,
            excluded_degenerate_face_count=0,
            unique_edge_count=3,
            boundary_edges=(),
            non_manifold_edges=(),
            isolated_vertices=(3,),
            duplicate_faces=(),
            connected_component_count=1,
        ),
        issues=classify_topology_issues(
            (
                collect_topology_issues(
                    ModelTopologyAnalysis(
                        vertex_count=4,
                        face_count=1,
                        analyzed_face_count=1,
                        excluded_degenerate_face_count=0,
                        unique_edge_count=3,
                        boundary_edges=(),
                        non_manifold_edges=(),
                        isolated_vertices=(3,),
                        duplicate_faces=(),
                        connected_component_count=1,
                    )
                )[0],
            )
        ),
    )

    assert result.highest_severity is IssueSeverity.WARNING
    assert result.has_warnings is True
    assert result.has_blocking_issues is False


def test_imported_model_reports_highest_severity_across_issue_sources():
    model = _build_empty_model()
    model.warnings = list(
        DEFAULT_ISSUE_SEVERITY_POLICY.classify_issues(
            (
                ImportWarning(
                    code="reader_warning",
                    message="Reader found non-standard metadata.",
                    severity=IssueSeverity.WARNING,
                ),
            )
        )
    )
    _, geometry_errors = classify_geometry_validation_result(
        warnings=(),
        errors=(
            GeometryValidationError(
                code="missing_vertices",
                message="Imported model contains no vertices.",
            ),
        ),
    )
    model.geometry_validation = GeometryValidationResult(errors=geometry_errors)

    assert model.highest_issue_severity is IssueSeverity.CRITICAL
    assert model.has_blocking_issues is True
