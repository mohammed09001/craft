from pathlib import Path

from mold_generator_engine.geometry.model_statistics import calculate_model_statistics
from mold_generator_engine.geometry.model_topology import analyze_model_topology
from mold_generator_engine.geometry.topology_validation import collect_topology_issues
from mold_generator_engine.io.importers.model_validation import (
    validate_imported_model_geometry,
)
from mold_generator_engine.models.imported_model import (
    BoundingBox,
    Dimensions,
    Face,
    GeometryValidationResult,
    ImportedModel,
    ModelFormat,
    TopologyValidationResult,
    Vertex,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityFindingCode,
    InitialMoldabilityStatus,
)
from mold_generator_engine.pipeline.initial_moldability import (
    DEFAULT_INITIAL_MOLDABILITY_ANALYZER,
)
from mold_generator_engine.pipeline.issue_policy import (
    DEFAULT_ISSUE_SEVERITY_POLICY,
    classify_geometry_validation_result,
    classify_topology_issues,
)


def _build_model(vertices: list[Vertex], faces: list[Face]) -> ImportedModel:
    minimum = Vertex(
        x=min((vertex.x for vertex in vertices), default=0.0),
        y=min((vertex.y for vertex in vertices), default=0.0),
        z=min((vertex.z for vertex in vertices), default=0.0),
    )
    maximum = Vertex(
        x=max((vertex.x for vertex in vertices), default=0.0),
        y=max((vertex.y for vertex in vertices), default=0.0),
        z=max((vertex.z for vertex in vertices), default=0.0),
    )
    model = ImportedModel(
        source_path=Path("models/sample.stl"),
        source_name="sample.stl",
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
        metadata={},
    )
    geometry_validation = validate_imported_model_geometry(model)
    warnings, errors = classify_geometry_validation_result(
        geometry_validation.warnings,
        geometry_validation.errors,
        DEFAULT_ISSUE_SEVERITY_POLICY,
    )
    model.geometry_validation = GeometryValidationResult(
        warnings=warnings,
        errors=errors,
        blocking_severities=DEFAULT_ISSUE_SEVERITY_POLICY.blocking_severities,
    )

    if model.geometry_validation.can_analyze_topology:
        topology_analysis = analyze_model_topology(model)
        model.topology_validation = TopologyValidationResult.completed(
            topology_analysis,
            issues=classify_topology_issues(
                collect_topology_issues(topology_analysis),
                DEFAULT_ISSUE_SEVERITY_POLICY,
            ),
            blocking_severities=DEFAULT_ISSUE_SEVERITY_POLICY.blocking_severities,
        )
    else:
        model.topology_validation = TopologyValidationResult.skipped(
            "Basic geometry validation reported fatal errors."
        )

    if model.geometry_validation.is_valid:
        model.statistics = calculate_model_statistics(model, model.topology_validation)

    return model


def test_closed_manifold_model_is_ready_for_detailed_analysis():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=0.0, y=0.0, z=1.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=0, vertex_2=3, vertex_3=1),
            Face(vertex_1=0, vertex_2=2, vertex_3=3),
            Face(vertex_1=1, vertex_2=3, vertex_3=2),
        ],
    )

    assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert assessment.status is InitialMoldabilityStatus.READY_FOR_DETAILED_ANALYSIS
    assert assessment.is_assessable is True
    assert assessment.is_ready_for_detailed_analysis is True
    assert [finding.code for finding in assessment.findings] == [
        InitialMoldabilityFindingCode.READY_FOR_ADVANCED_MOLD_ANALYSIS
    ]


def test_open_mesh_requires_repair():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=1.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert assessment.status is InitialMoldabilityStatus.REQUIRES_REPAIR
    assert assessment.is_assessable is True
    assert assessment.is_ready_for_detailed_analysis is False
    assert [finding.code for finding in assessment.findings] == [
        InitialMoldabilityFindingCode.OPEN_MESH
    ]


def test_non_manifold_mesh_is_not_assessable():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
            Vertex(x=0.0, y=0.0, z=1.0),
            Vertex(x=0.0, y=-1.0, z=0.0),
        ],
        faces=[
            Face(vertex_1=0, vertex_2=1, vertex_3=2),
            Face(vertex_1=1, vertex_2=0, vertex_3=3),
            Face(vertex_1=0, vertex_2=1, vertex_3=4),
        ],
    )

    assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert assessment.status is InitialMoldabilityStatus.NOT_ASSESSABLE
    assert assessment.is_assessable is False
    assert [finding.code for finding in assessment.findings[:2]] == [
        InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED,
        InitialMoldabilityFindingCode.NON_MANIFOLD_TOPOLOGY,
    ]


def test_flat_model_is_preliminarily_unsuitable():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=10.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=5.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=2)],
    )

    assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert assessment.status is InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE
    assert assessment.is_assessable is True
    assert [finding.code for finding in assessment.findings] == [
        InitialMoldabilityFindingCode.ZERO_OR_NEAR_ZERO_EXTENT,
        InitialMoldabilityFindingCode.OPEN_MESH,
    ]
    assert assessment.findings[0].metadata["axes"] == ("z",)


def test_empty_geometry_is_not_assessable():
    model = _build_model(vertices=[], faces=[])

    assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert assessment.status is InitialMoldabilityStatus.NOT_ASSESSABLE
    assert assessment.is_assessable is False
    assert [finding.code for finding in assessment.findings[:3]] == [
        InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED,
        InitialMoldabilityFindingCode.MISSING_GEOMETRY,
        InitialMoldabilityFindingCode.MISSING_REQUIRED_ANALYSIS_DATA,
    ]


def test_rejected_processing_decision_stays_not_assessable():
    model = _build_model(
        vertices=[
            Vertex(x=0.0, y=0.0, z=0.0),
            Vertex(x=1.0, y=0.0, z=0.0),
            Vertex(x=0.0, y=1.0, z=0.0),
        ],
        faces=[Face(vertex_1=0, vertex_2=1, vertex_3=3)],
    )

    assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert assessment.status is InitialMoldabilityStatus.NOT_ASSESSABLE
    assert assessment.is_assessable is False
    assert assessment.findings[0].code is (
        InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED
    )


def test_findings_are_sorted_deterministically():
    model = _build_model(vertices=[], faces=[])

    first_assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)
    second_assessment = DEFAULT_INITIAL_MOLDABILITY_ANALYZER.evaluate_model(model)

    assert first_assessment == second_assessment
    assert [finding.code for finding in first_assessment.findings] == [
        InitialMoldabilityFindingCode.MODEL_PROCESSING_REJECTED,
        InitialMoldabilityFindingCode.MISSING_GEOMETRY,
        InitialMoldabilityFindingCode.MISSING_REQUIRED_ANALYSIS_DATA,
        InitialMoldabilityFindingCode.CRITICAL_GEOMETRY_ISSUES,
    ]
