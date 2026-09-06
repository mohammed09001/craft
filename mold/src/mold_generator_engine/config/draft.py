"""Configuration values for stage-6 draft-angle analysis."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

DEFAULT_ZERO_DRAFT_TOLERANCE_DEGREES = 0.25
"""Maximum magnitude still treated as zero or near-zero draft."""

DEFAULT_MINIMUM_REQUIRED_DRAFT_DEGREES = 1.0
"""Minimum local draft magnitude treated as sufficient for drafted walls."""

DEFAULT_PULL_FACING_THRESHOLD_DEGREES = 89.0
"""Minimum magnitude treated as a pull-facing surface instead of a wall."""

DEFAULT_DRAFT_NUMERICAL_TOLERANCE = 1e-6
"""Small deterministic tolerance used around angular classification boundaries."""


@dataclass(frozen=True, slots=True)
class DraftAnalysisSettings:
    """Central thresholds used by stage-6 draft-angle analysis."""

    zero_draft_tolerance_degrees: float = DEFAULT_ZERO_DRAFT_TOLERANCE_DEGREES
    minimum_required_draft_degrees: float = DEFAULT_MINIMUM_REQUIRED_DRAFT_DEGREES
    pull_facing_threshold_degrees: float = DEFAULT_PULL_FACING_THRESHOLD_DEGREES
    numerical_tolerance: float = DEFAULT_DRAFT_NUMERICAL_TOLERANCE

    def __post_init__(self) -> None:
        _validate_angle(
            "zero_draft_tolerance_degrees",
            self.zero_draft_tolerance_degrees,
        )
        _validate_angle(
            "minimum_required_draft_degrees",
            self.minimum_required_draft_degrees,
        )
        _validate_angle(
            "pull_facing_threshold_degrees",
            self.pull_facing_threshold_degrees,
        )
        _validate_non_negative_finite("numerical_tolerance", self.numerical_tolerance)

        if self.minimum_required_draft_degrees < self.zero_draft_tolerance_degrees:
            raise ValueError(
                "Minimum required draft must be greater than or equal to the "
                "zero-draft tolerance."
            )
        if self.pull_facing_threshold_degrees < self.minimum_required_draft_degrees:
            raise ValueError(
                "Pull-facing threshold must be greater than or equal to the "
                "minimum required draft."
            )
        if self.numerical_tolerance > self.zero_draft_tolerance_degrees:
            raise ValueError(
                "Numerical tolerance cannot exceed the zero-draft tolerance."
            )


def _validate_angle(name: str, value: float) -> None:
    if not isfinite(value):
        raise ValueError(f"{name} must be finite.")
    if value < 0.0 or value > 90.0:
        raise ValueError(f"{name} must be between 0.0 and 90.0 degrees.")


def _validate_non_negative_finite(name: str, value: float) -> None:
    if not isfinite(value):
        raise ValueError(f"{name} must be finite.")
    if value < 0.0:
        raise ValueError(f"{name} cannot be negative.")
