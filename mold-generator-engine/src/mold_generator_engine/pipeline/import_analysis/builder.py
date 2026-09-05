from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from mold_generator_engine.exceptions import ModelImportError
from mold_generator_engine.models.import_analysis_report import (
    IMPORT_ANALYSIS_REPORT_SCHEMA_VERSION,
    ImportAnalysisReport,
    ImportAnalysisReportStatus,
    ImportAnalysisSource,
)
from mold_generator_engine.models.imported_model import (
    ImportedModel,
    TopologyValidationStatus,
)
from mold_generator_engine.models.initial_moldability import (
    InitialMoldabilityAssessment,
    InitialMoldabilityStatus,
)
from mold_generator_engine.models.issues import IssueSeverity, IssueSource, ModelIssue
from mold_generator_engine.pipeline.processing_suitability import (
    IssueSeverityCounts,
    ModelProcessingDecision,
    ModelProcessingStatus,
)


@dataclass(frozen=True, slots=True)
class ImportAnalysisReportBuilder:
    """Assemble a unified report from import-pipeline results."""

    schema_version: str = IMPORT_ANALYSIS_REPORT_SCHEMA_VERSION

    def build_from_model(self, model: ImportedModel) -> ImportAnalysisReport:
        """Build a report from a successfully imported model."""
        warnings, errors = _partition_issues(model.issues)
        processing_decision = model.processing_decision
        analysis_completed = _is_analysis_completed(model)
        status = _resolve_report_status(
            import_succeeded=True,
            analysis_completed=analysis_completed,
            warnings=warnings,
            processing_decision=processing_decision,
            initial_moldability_assessment=model.initial_moldability_assessment,
        )

        return ImportAnalysisReport(
            status=status,
            source=ImportAnalysisSource(
                source_name=model.source_name,
                source_path=str(model.source_path),
                file_format=model.file_format.value,
            ),
            import_succeeded=True,
            analysis_completed=analysis_completed,
            summary=_summary_for_model_report(
                status=status,
                model=model,
                processing_decision=processing_decision,
            ),
            issue_counts=IssueSeverityCounts.from_issues((*warnings, *errors)),
            warnings=warnings,
            errors=errors,
            geometry_validation=model.geometry_validation,
            topology_validation=model.topology_validation,
            statistics=model.statistics,
            processing_decision=processing_decision,
            initial_moldability_assessment=model.initial_moldability_assessment,
            model_metadata=dict(model.metadata),
            schema_version=self.schema_version,
        )

    def build_from_error(
        self,
        source_path: Path,
        error: ModelImportError | OSError,
    ) -> ImportAnalysisReport:
        """Build a report that captures an expected import-time failure."""
        error_issue = _issue_for_import_error(source_path, error)

        return ImportAnalysisReport(
            status=ImportAnalysisReportStatus.IMPORT_FAILED,
            source=ImportAnalysisSource(
                source_name=source_path.name,
                source_path=str(source_path),
                file_format=_resolve_file_format(source_path),
            ),
            import_succeeded=False,
            analysis_completed=False,
            summary="Model import failed before unified analysis could complete.",
            issue_counts=IssueSeverityCounts.from_issues((error_issue,)),
            errors=(error_issue,),
            schema_version=self.schema_version,
        )


DEFAULT_IMPORT_ANALYSIS_REPORT_BUILDER = ImportAnalysisReportBuilder()


def build_import_analysis_report(model: ImportedModel) -> ImportAnalysisReport:
    """Build a unified report from the provided imported model."""
    return DEFAULT_IMPORT_ANALYSIS_REPORT_BUILDER.build_from_model(model)


def _partition_issues(
    issues: tuple[ModelIssue, ...],
) -> tuple[tuple[ModelIssue, ...], tuple[ModelIssue, ...]]:
    warnings: list[ModelIssue] = []
    errors: list[ModelIssue] = []

    for issue in issues:
        if issue.severity is IssueSeverity.WARNING:
            warnings.append(issue)
            continue

        if issue.severity in (IssueSeverity.ERROR, IssueSeverity.CRITICAL):
            errors.append(issue)

    return tuple(warnings), tuple(errors)


def _is_analysis_completed(model: ImportedModel) -> bool:
    if model.topology_validation.status is TopologyValidationStatus.NOT_RUN:
        return False

    if model.initial_moldability_assessment is None:
        return False

    if not model.geometry_validation.can_analyze_topology:
        return False

    if not model.topology_validation.was_run:
        return False

    return model.statistics is not None


def _resolve_report_status(
    *,
    import_succeeded: bool,
    analysis_completed: bool,
    warnings: tuple[ModelIssue, ...],
    processing_decision: ModelProcessingDecision,
    initial_moldability_assessment: InitialMoldabilityAssessment | None,
) -> ImportAnalysisReportStatus:
    if not import_succeeded:
        return ImportAnalysisReportStatus.IMPORT_FAILED

    if not analysis_completed:
        return ImportAnalysisReportStatus.ANALYSIS_INCOMPLETE

    if initial_moldability_assessment is not None and (
        initial_moldability_assessment.status
        in {
            InitialMoldabilityStatus.PRELIMINARILY_UNSUITABLE,
            InitialMoldabilityStatus.NOT_ASSESSABLE,
        }
    ):
        return ImportAnalysisReportStatus.UNSUITABLE

    if processing_decision.status is ModelProcessingStatus.REJECTED:
        return ImportAnalysisReportStatus.UNSUITABLE

    if (
        initial_moldability_assessment is not None
        and initial_moldability_assessment.status
        is InitialMoldabilityStatus.REQUIRES_REPAIR
    ) or processing_decision.status is ModelProcessingStatus.REQUIRES_REPAIR:
        return ImportAnalysisReportStatus.REQUIRES_REPAIR

    if warnings:
        return ImportAnalysisReportStatus.READY_WITH_WARNINGS

    return ImportAnalysisReportStatus.READY


def _summary_for_model_report(
    *,
    status: ImportAnalysisReportStatus,
    model: ImportedModel,
    processing_decision: ModelProcessingDecision,
) -> str:
    if status is ImportAnalysisReportStatus.READY:
        return "Model import and analysis completed successfully."

    if status is ImportAnalysisReportStatus.READY_WITH_WARNINGS:
        return processing_decision.summary

    if status is ImportAnalysisReportStatus.REQUIRES_REPAIR:
        assessment = model.initial_moldability_assessment
        if assessment is not None:
            return assessment.summary

        return processing_decision.summary

    if status is ImportAnalysisReportStatus.UNSUITABLE:
        assessment = model.initial_moldability_assessment
        if assessment is not None:
            return assessment.summary

        return processing_decision.summary

    if model.topology_validation.status is TopologyValidationStatus.SKIPPED:
        return model.topology_validation.skip_reason or (
            "Analysis stopped before all downstream results became available."
        )

    if model.statistics is None:
        return "Analysis completed only partially because model statistics are missing."

    return "Analysis completed only partially."


def _issue_for_import_error(
    source_path: Path,
    error: ModelImportError | OSError,
) -> ModelIssue:
    return ModelIssue(
        code=_error_code(error),
        message=str(error),
        source=IssueSource.IMPORT,
        severity=IssueSeverity.CRITICAL,
        metadata={
            "exception_type": type(error).__name__,
            "source_name": source_path.name,
        },
    )


def _error_code(error: ModelImportError | OSError) -> str:
    if isinstance(error, FileNotFoundError):
        return "file_not_found"

    if isinstance(error, PermissionError):
        return "file_access_error"

    exception_name = type(error).__name__
    normalized_name = exception_name.removesuffix("Error")
    parts = re.findall(r"[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z0-9]+", normalized_name)

    return "_".join(part.casefold() for part in parts)


def _resolve_file_format(source_path: Path) -> str | None:
    extension = source_path.suffix.removeprefix(".").casefold()
    return extension or None
