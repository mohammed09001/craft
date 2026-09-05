"""Configuration values for stage-10/11 moldability synthesis and decision."""

from __future__ import annotations

from dataclasses import dataclass

DEFAULT_BLOCKING_REGION_COUNT_THRESHOLD = 1
"""Blocking-region threshold above which direct generation is blocked."""

DEFAULT_CRITICAL_RISK_REGION_COUNT_THRESHOLD = 1
"""Critical-risk region threshold above which direct generation is blocked."""

DEFAULT_HIGH_RISK_REGION_COUNT_MANUAL_REVIEW_THRESHOLD = 1
"""High-risk region threshold above which manual review becomes mandatory."""

DEFAULT_REQUIRE_DRAFT_ANALYSIS_FOR_SIMPLE_MOLD = True
"""Whether simple-mold decisions require available draft analysis."""

DEFAULT_REQUIRE_CLEAR_PULL_DIRECTION_FOR_SIMPLE_MOLD = True
"""Whether simple-mold decisions require a clear preliminary pull direction."""

DEFAULT_BLOCK_ON_CORE_OR_INSERT_LIKELY = True
"""Whether likely core-or-insert needs block direct automatic generation."""

DEFAULT_BLOCK_ON_CRITICAL_RISK = True
"""Whether critical undercut risk blocks direct automatic generation."""

DEFAULT_MANUAL_REVIEW_ON_AMBIGUITY = True
"""Whether ambiguity forces a manual-review moldability outcome."""

DEFAULT_MANUAL_REVIEW_ON_LOW_EVIDENCE = True
"""Whether low evidence quality forces a manual-review outcome."""


@dataclass(frozen=True, slots=True)
class PreliminaryMoldabilityDecisionSettings:
    """Central thresholds and policies used by stage-10/11 decision synthesis."""

    blocking_region_count_threshold: int = DEFAULT_BLOCKING_REGION_COUNT_THRESHOLD
    critical_risk_region_count_threshold: int = (
        DEFAULT_CRITICAL_RISK_REGION_COUNT_THRESHOLD
    )
    high_risk_region_count_manual_review_threshold: int = (
        DEFAULT_HIGH_RISK_REGION_COUNT_MANUAL_REVIEW_THRESHOLD
    )
    require_draft_analysis_for_simple_mold: bool = (
        DEFAULT_REQUIRE_DRAFT_ANALYSIS_FOR_SIMPLE_MOLD
    )
    require_clear_pull_direction_for_simple_mold: bool = (
        DEFAULT_REQUIRE_CLEAR_PULL_DIRECTION_FOR_SIMPLE_MOLD
    )
    block_on_core_or_insert_likely: bool = DEFAULT_BLOCK_ON_CORE_OR_INSERT_LIKELY
    block_on_critical_risk: bool = DEFAULT_BLOCK_ON_CRITICAL_RISK
    manual_review_on_ambiguity: bool = DEFAULT_MANUAL_REVIEW_ON_AMBIGUITY
    manual_review_on_low_evidence: bool = DEFAULT_MANUAL_REVIEW_ON_LOW_EVIDENCE

    def __post_init__(self) -> None:
        _validate_positive_int(
            "blocking_region_count_threshold",
            self.blocking_region_count_threshold,
        )
        _validate_positive_int(
            "critical_risk_region_count_threshold",
            self.critical_risk_region_count_threshold,
        )
        _validate_positive_int(
            "high_risk_region_count_manual_review_threshold",
            self.high_risk_region_count_manual_review_threshold,
        )


def _validate_positive_int(name: str, value: int) -> None:
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero.")
