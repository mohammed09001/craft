"""Engineering report framework contracts.

This package contains shared report contracts used by Chapter 9 engineering
analysis features. It intentionally contains no geometry processing or
engineering algorithms.
"""

from .contracts import (
    ENGINEERING_REPORT_SCHEMA,
    ENGINEERING_REPORT_SCHEMA_VERSION,
    EngineeringReport,
    EngineeringReportError,
    EngineeringReportMetadata,
    EngineeringReportSource,
    EngineeringReportStatus,
    EngineeringReportWarning,
    create_engineering_report,
    create_failed_engineering_report,
)

__all__ = [
    "ENGINEERING_REPORT_SCHEMA",
    "ENGINEERING_REPORT_SCHEMA_VERSION",
    "EngineeringReport",
    "EngineeringReportError",
    "EngineeringReportMetadata",
    "EngineeringReportSource",
    "EngineeringReportStatus",
    "EngineeringReportWarning",
    "create_engineering_report",
    "create_failed_engineering_report",
]
