from __future__ import annotations

from dataclasses import dataclass

from mold_generator_engine.models.cavity_analysis import (
    CavityAnalysisContext,
    CavityAssessmentOutcome,
    CavityEvidenceAssessment,
    CavityFinding,
    CavityFindingCode,
    CavityFindingSource,
)
from mold_generator_engine.models.detailed_mold_analysis import (
    MoldabilityActionIndication,
    MoldabilityStatus,
)
from mold_generator_engine.models.issues import IssueSeverity
from mold_generator_engine.pipeline.cavity_analysis.contracts import (
    CavityEvidenceAssessor,
)


@dataclass(frozen=True, slots=True)
class StructuredCavityEvidenceAssessor:
    """Interpret Chapter 3 structured evidence without claiming geometry proof."""

    def assess(
        self,
        context: CavityAnalysisContext,
    ) -> CavityEvidenceAssessment:
        """Translate upstream structured evidence into a Chapter 4 assessment."""
        preliminary_assessment = (
            context.detailed_mold_analysis_report.preliminary_moldability_assessment
        )
        findings: list[CavityFinding] = []

        if preliminary_assessment is None:
            findings.append(
                _finding(
                    code=CavityFindingCode.CHAPTER_3_PRELIMINARY_ASSESSMENT_UNAVAILABLE,
                    source=CavityFindingSource.DETAILED_MOLD_ANALYSIS,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Chapter 3 did not provide a preliminary moldability "
                        "assessment for cavity-evidence consumption."
                    ),
                )
            )
            return CavityEvidenceAssessment(
                outcome=CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED,
                summary=(
                    "Cavity analysis could only confirm that geometric cavity "
                    "assessment has not started yet because Chapter 3 did not "
                    "provide a consumable preliminary moldability assessment."
                ),
                findings=_order_findings(findings),
            )

        upstream_status = preliminary_assessment.status
        core_indication = preliminary_assessment.core_or_insert_indication

        if upstream_status is MoldabilityStatus.NOT_ASSESSABLE:
            findings.append(
                _finding(
                    code=CavityFindingCode.CHAPTER_3_NOT_ASSESSABLE,
                    source=CavityFindingSource.PRELIMINARY_MOLDABILITY_ASSESSMENT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Chapter 3 marked the upstream evidence as not assessable, "
                        "so Chapter 4 cannot infer an internal-cavity conclusion."
                    ),
                )
            )
            return CavityEvidenceAssessment(
                outcome=CavityAssessmentOutcome.NOT_YET_GEOMETRICALLY_ASSESSED,
                summary=(
                    "Chapter 4 did not perform geometric cavity assessment because "
                    "the upstream Chapter 3 evidence was not assessable."
                ),
                findings=_order_findings(findings),
                upstream_preliminary_moldability_status=upstream_status,
                upstream_core_or_insert_indication=core_indication,
            )

        if core_indication is MoldabilityActionIndication.LIKELY:
            findings.append(
                _finding(
                    code=CavityFindingCode.UPSTREAM_CORE_OR_INSERT_INDICATED,
                    source=CavityFindingSource.PRELIMINARY_MOLDABILITY_ASSESSMENT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Chapter 3 produced a structured core-or-insert indication. "
                        "This remains an indication only and is not proof of core "
                        "feasibility."
                    ),
                )
            )
            return CavityEvidenceAssessment(
                outcome=CavityAssessmentOutcome.CORE_OR_INSERT_REVIEW_INDICATED,
                summary=(
                    "Structured upstream evidence indicates that internal core or "
                    "insert review is required, but no geometric cavity detector "
                    "has run yet."
                ),
                findings=_order_findings(findings),
                upstream_preliminary_moldability_status=upstream_status,
                upstream_core_or_insert_indication=core_indication,
            )

        if preliminary_assessment.manual_review_required:
            findings.append(
                _finding(
                    code=CavityFindingCode.UPSTREAM_MANUAL_REVIEW_REQUIRED,
                    source=CavityFindingSource.PRELIMINARY_MOLDABILITY_ASSESSMENT,
                    severity=IssueSeverity.WARNING,
                    message=(
                        "Chapter 3 requires manual review before trusting an "
                        "automatic internal-cavity conclusion."
                    ),
                )
            )
            return CavityEvidenceAssessment(
                outcome=CavityAssessmentOutcome.MANUAL_REVIEW_REQUIRED,
                summary=(
                    "The current upstream evidence requires manual cavity review; "
                    "this stage still has not executed geometric cavity analysis."
                ),
                findings=_order_findings(findings),
                upstream_preliminary_moldability_status=upstream_status,
                upstream_core_or_insert_indication=core_indication,
            )

        findings.append(
            _finding(
                code=CavityFindingCode.NO_STRUCTURED_CAVITY_EVIDENCE,
                source=CavityFindingSource.CAVITY_EVIDENCE_ASSESSOR,
                severity=IssueSeverity.INFO,
                message=(
                    "No structured internal-cavity evidence was available from the "
                    "current Chapter 3 report."
                ),
            )
        )
        return CavityEvidenceAssessment(
            outcome=CavityAssessmentOutcome.NO_STRUCTURED_CAVITY_EVIDENCE,
            summary=(
                "No structured cavity evidence was available from upstream "
                "reports. This does not prove that the part has no internal cavity."
            ),
            findings=_order_findings(findings),
            upstream_preliminary_moldability_status=upstream_status,
            upstream_core_or_insert_indication=core_indication,
        )


DEFAULT_CAVITY_EVIDENCE_ASSESSOR: CavityEvidenceAssessor = (
    StructuredCavityEvidenceAssessor()
)


def _finding(
    *,
    code: CavityFindingCode,
    source: CavityFindingSource,
    severity: IssueSeverity,
    message: str,
    is_blocking: bool = False,
    metadata: dict[str, object] | None = None,
) -> CavityFinding:
    return CavityFinding(
        code=code,
        source=source,
        severity=severity,
        message=message,
        is_blocking=is_blocking,
        metadata={} if metadata is None else metadata,
    )


def _order_findings(
    findings: list[CavityFinding],
) -> tuple[CavityFinding, ...]:
    return tuple(sorted(findings, key=_finding_sort_key))


def _finding_sort_key(finding: CavityFinding) -> tuple[object, ...]:
    metadata_key = tuple(
        sorted((key, repr(value)) for key, value in finding.metadata.items())
    )
    return (
        not finding.is_blocking,
        _SEVERITY_ORDER[finding.severity],
        finding.source.value,
        finding.code.value,
        finding.message,
        metadata_key,
    )


_SEVERITY_ORDER = {
    IssueSeverity.INFO: 0,
    IssueSeverity.WARNING: 1,
    IssueSeverity.ERROR: 2,
    IssueSeverity.CRITICAL: 3,
}
