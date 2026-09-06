"""Base contracts for engineering analysis reports.

Chapter 9 Stage 1 is a contract-only stage. This module must not contain
geometry processing, CAD logic, mold logic, or analysis algorithms.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from types import MappingProxyType
from typing import Any, Generic, Mapping, TypeVar


ENGINEERING_REPORT_SCHEMA = "engineering_report"
ENGINEERING_REPORT_SCHEMA_VERSION = "1.0.0"

JsonValue = Any
ReportDataT = TypeVar("ReportDataT", bound=Mapping[str, JsonValue])


class EngineeringReportStatus(str, Enum):
    """Lifecycle status for an engineering report."""

    SUCCESS = "success"
    SUCCESS_WITH_WARNINGS = "success_with_warnings"
    PARTIAL = "partial"
    FAILED = "failed"
    UNSUPPORTED = "unsupported"
    SKIPPED = "skipped"


class EngineeringReportSource(str, Enum):
    """System boundary that produced or transformed the report."""

    PYTHON_ENGINE = "python-engine"
    ENGINE_BRIDGE = "engine-bridge"
    FRONTEND = "frontend"


@dataclass(frozen=True)
class EngineeringReportMetadata:
    """Common metadata shared by all engineering reports."""

    report_id: str
    analysis_name: str
    report_name: str
    created_at: str
    source: EngineeringReportSource = EngineeringReportSource.PYTHON_ENGINE
    engine_version: str | None = None
    contract_version: str = ENGINEERING_REPORT_SCHEMA_VERSION

    @staticmethod
    def created_now(
        *,
        report_id: str,
        analysis_name: str,
        report_name: str,
        source: EngineeringReportSource = EngineeringReportSource.PYTHON_ENGINE,
        engine_version: str | None = None,
        contract_version: str = ENGINEERING_REPORT_SCHEMA_VERSION,
    ) -> "EngineeringReportMetadata":
        return EngineeringReportMetadata(
            report_id=report_id,
            analysis_name=analysis_name,
            report_name=report_name,
            created_at=datetime.now(timezone.utc).isoformat(),
            source=source,
            engine_version=engine_version,
            contract_version=contract_version,
        )


@dataclass(frozen=True)
class EngineeringReportWarning:
    """Non-fatal issue discovered while creating an engineering report."""

    code: str
    message: str
    source: str | None = None
    details: Mapping[str, JsonValue] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "details", MappingProxyType(dict(self.details)))


@dataclass(frozen=True)
class EngineeringReportError:
    """Fatal or report-level issue discovered while creating a report."""

    code: str
    message: str
    source: str | None = None
    recoverable: bool = False
    details: Mapping[str, JsonValue] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "details", MappingProxyType(dict(self.details)))


@dataclass(frozen=True)
class EngineeringReport(Generic[ReportDataT]):
    """Base immutable contract for all engineering analysis reports."""

    metadata: EngineeringReportMetadata
    status: EngineeringReportStatus
    success: bool
    data: ReportDataT
    warnings: tuple[EngineeringReportWarning, ...] = ()
    errors: tuple[EngineeringReportError, ...] = ()
    statistics: Mapping[str, JsonValue] = field(default_factory=dict)
    schema: str = ENGINEERING_REPORT_SCHEMA
    schema_version: str = ENGINEERING_REPORT_SCHEMA_VERSION

    def __post_init__(self) -> None:
        object.__setattr__(self, "warnings", tuple(self.warnings))
        object.__setattr__(self, "errors", tuple(self.errors))
        object.__setattr__(
            self,
            "statistics",
            MappingProxyType(dict(self.statistics)),
        )
        object.__setattr__(self, "data", MappingProxyType(dict(self.data)))

    def to_dict(self) -> dict[str, JsonValue]:
        """Serialize report to the frontend/bridge camelCase contract."""

        return {
            "schema": self.schema,
            "schemaVersion": self.schema_version,
            "metadata": {
                "reportId": self.metadata.report_id,
                "analysisName": self.metadata.analysis_name,
                "reportName": self.metadata.report_name,
                "createdAt": self.metadata.created_at,
                "source": self.metadata.source.value,
                "engineVersion": self.metadata.engine_version,
                "contractVersion": self.metadata.contract_version,
            },
            "status": self.status.value,
            "success": self.success,
            "warnings": [
                {
                    "code": warning.code,
                    "message": warning.message,
                    "source": warning.source,
                    "details": dict(warning.details),
                }
                for warning in self.warnings
            ],
            "errors": [
                {
                    "code": error.code,
                    "message": error.message,
                    "source": error.source,
                    "recoverable": error.recoverable,
                    "details": dict(error.details),
                }
                for error in self.errors
            ],
            "statistics": dict(self.statistics),
            "data": dict(self.data),
        }


def create_engineering_report(
    *,
    report_id: str,
    analysis_name: str,
    report_name: str,
    data: Mapping[str, JsonValue] | None = None,
    status: EngineeringReportStatus = EngineeringReportStatus.SUCCESS,
    success: bool = True,
    warnings: tuple[EngineeringReportWarning, ...] = (),
    errors: tuple[EngineeringReportError, ...] = (),
    statistics: Mapping[str, JsonValue] | None = None,
    source: EngineeringReportSource = EngineeringReportSource.PYTHON_ENGINE,
    engine_version: str | None = None,
) -> EngineeringReport[Mapping[str, JsonValue]]:
    """Create a normalized engineering report without analysis logic."""

    return EngineeringReport(
        metadata=EngineeringReportMetadata.created_now(
            report_id=report_id,
            analysis_name=analysis_name,
            report_name=report_name,
            source=source,
            engine_version=engine_version,
        ),
        status=status,
        success=success,
        warnings=warnings,
        errors=errors,
        statistics=statistics or {},
        data=data or {},
    )


def create_failed_engineering_report(
    *,
    report_id: str,
    analysis_name: str,
    report_name: str,
    error: EngineeringReportError,
    statistics: Mapping[str, JsonValue] | None = None,
    source: EngineeringReportSource = EngineeringReportSource.PYTHON_ENGINE,
    engine_version: str | None = None,
) -> EngineeringReport[Mapping[str, JsonValue]]:
    """Create a normalized failed report without analysis logic."""

    return create_engineering_report(
        report_id=report_id,
        analysis_name=analysis_name,
        report_name=report_name,
        status=EngineeringReportStatus.FAILED,
        success=False,
        errors=(error,),
        statistics=statistics,
        source=source,
        engine_version=engine_version,
    )
