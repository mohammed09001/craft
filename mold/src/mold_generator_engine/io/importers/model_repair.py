from dataclasses import dataclass

from mold_generator_engine.exceptions import EmptyGeometryError
from mold_generator_engine.geometry.model_statistics import calculate_model_statistics
from mold_generator_engine.geometry.model_topology import analyze_model_topology
from mold_generator_engine.geometry.topology_validation import collect_topology_issues
from mold_generator_engine.io.importers.model_validation import (
    is_degenerate_face,
    validate_imported_model_geometry,
)
from mold_generator_engine.models.imported_model import (
    Face,
    GeometryValidationResult,
    ImportedModel,
    TopologyValidationResult,
    merge_import_warnings,
)
from mold_generator_engine.pipeline.initial_moldability import (
    DEFAULT_INITIAL_MOLDABILITY_ANALYZER,
    InitialMoldabilityAnalyzer,
)
from mold_generator_engine.pipeline.issue_policy import (
    DEFAULT_ISSUE_SEVERITY_POLICY,
    IssueSeverityPolicy,
    classify_geometry_validation_result,
    classify_topology_issues,
)


@dataclass(frozen=True)
class ModelRepairResult:
    model: ImportedModel
    removed_face_count: int
    removed_face_indices: tuple[int, ...]


def remove_degenerate_faces(
    model: ImportedModel,
    severity_policy: IssueSeverityPolicy = DEFAULT_ISSUE_SEVERITY_POLICY,
    initial_moldability_analyzer: InitialMoldabilityAnalyzer = (
        DEFAULT_INITIAL_MOLDABILITY_ANALYZER
    ),
) -> ModelRepairResult:
    """Return a copy of the model with degenerate faces removed."""
    kept_faces: list[Face] = []
    removed_face_indices: list[int] = []

    for face_index, face in enumerate(model.faces):
        if is_degenerate_face(model.vertices, face):
            removed_face_indices.append(face_index)
            continue

        kept_faces.append(face)

    if removed_face_indices and not kept_faces:
        raise EmptyGeometryError(
            "Imported model contains no usable geometry after removing "
            "degenerate faces."
        )

    repaired_model = ImportedModel(
        source_path=model.source_path,
        source_name=model.source_name,
        file_format=model.file_format,
        vertices=list(model.vertices),
        faces=kept_faces,
        bounding_box=model.bounding_box,
        dimensions=model.dimensions,
        warnings=[
            warning
            for warning in model.warnings
            if warning not in model.geometry_validation.warnings
        ],
        metadata=dict(model.metadata),
        topology_validation=TopologyValidationResult.not_run(),
    )
    repaired_model.warnings = list(
        severity_policy.classify_issues(repaired_model.warnings)
    )
    geometry_validation = validate_imported_model_geometry(repaired_model)
    warnings, errors = classify_geometry_validation_result(
        geometry_validation.warnings,
        geometry_validation.errors,
        severity_policy,
    )
    repaired_model.geometry_validation = GeometryValidationResult(
        warnings=warnings,
        errors=errors,
        blocking_severities=severity_policy.blocking_severities,
    )
    repaired_model.warnings = merge_import_warnings(
        repaired_model.warnings,
        repaired_model.geometry_validation.warnings,
    )

    if repaired_model.geometry_validation.can_analyze_topology:
        topology_analysis = analyze_model_topology(repaired_model)
        repaired_model.topology_validation = TopologyValidationResult.completed(
            topology_analysis,
            issues=classify_topology_issues(
                collect_topology_issues(topology_analysis),
                severity_policy,
            ),
            blocking_severities=severity_policy.blocking_severities,
        )
    else:
        repaired_model.topology_validation = TopologyValidationResult.skipped(
            "Basic geometry validation reported fatal errors after repair."
        )

    if repaired_model.geometry_validation.is_valid:
        repaired_model.statistics = calculate_model_statistics(
            repaired_model,
            repaired_model.topology_validation,
        )

    repaired_model.initial_moldability_assessment = (
        initial_moldability_analyzer.evaluate_model(repaired_model)
    )

    return ModelRepairResult(
        model=repaired_model,
        removed_face_count=len(removed_face_indices),
        removed_face_indices=tuple(removed_face_indices),
    )
