from collections.abc import Callable
from pathlib import Path

from mold_generator_engine.exceptions import UnsupportedFileExtensionError
from mold_generator_engine.geometry.model_statistics import calculate_model_statistics
from mold_generator_engine.geometry.model_topology import (
    ModelTopologyAnalysis,
    analyze_model_topology,
)
from mold_generator_engine.geometry.topology_validation import collect_topology_issues
from mold_generator_engine.io.importers.model_validation import (
    validate_imported_model_geometry,
)
from mold_generator_engine.io.importers.registry import ReaderRegistry
from mold_generator_engine.models.imported_model import (
    GeometryValidationResult,
    ImportedModel,
    ModelFormat,
    TopologyIssue,
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

GeometryValidator = Callable[[ImportedModel], GeometryValidationResult]
TopologyAnalyzer = Callable[[ImportedModel], ModelTopologyAnalysis]
TopologyIssueCollector = Callable[[ModelTopologyAnalysis], tuple[TopologyIssue, ...]]


class ModelImporter:
    """Coordinates model import without depending on a specific file reader."""

    def __init__(
        self,
        registry: ReaderRegistry,
        geometry_validator: GeometryValidator = validate_imported_model_geometry,
        topology_analyzer: TopologyAnalyzer = analyze_model_topology,
        topology_issue_collector: TopologyIssueCollector = collect_topology_issues,
        severity_policy: IssueSeverityPolicy = DEFAULT_ISSUE_SEVERITY_POLICY,
        initial_moldability_analyzer: InitialMoldabilityAnalyzer = (
            DEFAULT_INITIAL_MOLDABILITY_ANALYZER
        ),
    ) -> None:
        self._registry = registry
        self._geometry_validator = geometry_validator
        self._topology_analyzer = topology_analyzer
        self._topology_issue_collector = topology_issue_collector
        self._severity_policy = severity_policy
        self._initial_moldability_analyzer = initial_moldability_analyzer

    def import_model(self, source_path: Path) -> ImportedModel:
        """Select the appropriate reader and import the model."""
        file_format = self._get_file_format(source_path)
        reader = self._registry.get(file_format)
        model = reader.read(source_path)
        model.warnings = list(self._severity_policy.classify_issues(model.warnings))
        geometry_validation = self._classify_geometry_validation(
            self._geometry_validator(model)
        )

        model.geometry_validation = geometry_validation
        model.warnings = merge_import_warnings(
            model.warnings,
            geometry_validation.warnings,
        )

        if geometry_validation.can_analyze_topology:
            topology_analysis = self._topology_analyzer(model)
            model.topology_validation = TopologyValidationResult.completed(
                topology_analysis,
                issues=classify_topology_issues(
                    self._topology_issue_collector(topology_analysis),
                    self._severity_policy,
                ),
                blocking_severities=self._severity_policy.blocking_severities,
            )
        else:
            model.topology_validation = TopologyValidationResult.skipped(
                "Basic geometry validation reported fatal errors."
            )

        if geometry_validation.is_valid:
            model.statistics = calculate_model_statistics(
                model,
                model.topology_validation,
            )

        model.initial_moldability_assessment = (
            self._initial_moldability_analyzer.evaluate_model(model)
        )

        return model

    @staticmethod
    def _get_file_format(source_path: Path) -> ModelFormat:
        extension = source_path.suffix.removeprefix(".").casefold()

        try:
            return ModelFormat(extension)
        except ValueError:
            raise UnsupportedFileExtensionError(
                f"Unsupported model file extension: {source_path.suffix or '<none>'}."
            ) from None

    def _classify_geometry_validation(
        self,
        geometry_validation: GeometryValidationResult,
    ) -> GeometryValidationResult:
        warnings, errors = classify_geometry_validation_result(
            geometry_validation.warnings,
            geometry_validation.errors,
            self._severity_policy,
        )

        return GeometryValidationResult(
            warnings=warnings,
            errors=errors,
            blocking_severities=self._severity_policy.blocking_severities,
        )
