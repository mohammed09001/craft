"""Configuration values for pull-direction ranking and preliminary selection."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

from mold_generator_engine.config.geometry import (
    DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
)

DEFAULT_PULL_DIRECTION_RANKING_SCORE_TOLERANCE = 1e-6
"""Maximum score delta treated as an engineering tie."""

DEFAULT_PULL_DIRECTION_NEAR_TIE_SCORE_TOLERANCE = 2.0
"""Maximum score delta treated as a close preliminary result."""

DEFAULT_PULL_DIRECTION_CLEAR_MARGIN = 10.0
"""Minimum score margin required for a clear preliminary selection."""

DEFAULT_PULL_DIRECTION_CLOSE_MARGIN = 3.0
"""Minimum score margin required for a close but still selected result."""


@dataclass(frozen=True, slots=True)
class PullDirectionRankingSettings:
    """Central thresholds used by pull-direction ranking and selection."""

    score_tolerance: float = DEFAULT_PULL_DIRECTION_RANKING_SCORE_TOLERANCE
    near_tie_score_tolerance: float = DEFAULT_PULL_DIRECTION_NEAR_TIE_SCORE_TOLERANCE
    clear_margin: float = DEFAULT_PULL_DIRECTION_CLEAR_MARGIN
    close_margin: float = DEFAULT_PULL_DIRECTION_CLOSE_MARGIN
    direction_key_tolerance: float = DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE

    def __post_init__(self) -> None:
        _validate_non_negative_finite(
            "score_tolerance",
            self.score_tolerance,
            strictly_positive=False,
        )
        _validate_non_negative_finite(
            "near_tie_score_tolerance",
            self.near_tie_score_tolerance,
            strictly_positive=False,
        )
        _validate_non_negative_finite(
            "clear_margin",
            self.clear_margin,
            strictly_positive=False,
        )
        _validate_non_negative_finite(
            "close_margin",
            self.close_margin,
            strictly_positive=False,
        )
        _validate_non_negative_finite(
            "direction_key_tolerance",
            self.direction_key_tolerance,
            strictly_positive=True,
        )

        if self.near_tie_score_tolerance < self.score_tolerance:
            raise ValueError(
                "Near-tie score tolerance must be greater than or equal to the "
                "engineering tie score tolerance."
            )
        if self.close_margin < self.near_tie_score_tolerance:
            raise ValueError(
                "Close preliminary-selection margin must be greater than or equal to "
                "the near-tie score tolerance."
            )
        if self.clear_margin < self.close_margin:
            raise ValueError(
                "Clear preliminary-selection margin must be greater than or equal to "
                "the close preliminary-selection margin."
            )


def _validate_non_negative_finite(
    name: str,
    value: float,
    *,
    strictly_positive: bool,
) -> None:
    if not isfinite(value):
        raise ValueError(f"{name} must be finite.")

    if strictly_positive and value <= 0.0:
        raise ValueError(f"{name} must be greater than zero.")

    if not strictly_positive and value < 0.0:
        raise ValueError(f"{name} cannot be negative.")
