"""Configuration values for preliminary undercut detection."""

from __future__ import annotations

from dataclasses import dataclass
from math import isfinite

DEFAULT_UNDERCUT_SURFACE_OFFSET_SCALE = 1e-6
"""Scale factor applied to the model diagonal for sample-point offsets."""

DEFAULT_UNDERCUT_RAY_INTERSECTION_SCALE = 1e-6
"""Scale factor applied to the model diagonal for minimum ray-hit distance."""

DEFAULT_UNDERCUT_NUMERIC_AMBIGUITY_SCALE = 5e-6
"""Scale factor applied to the model diagonal for near-hit ambiguity checks."""

DEFAULT_UNDERCUT_SAMPLE_BARYCENTRIC_COORDINATES = (
    (1.0 / 3.0, 1.0 / 3.0, 1.0 / 3.0),
    (0.6, 0.2, 0.2),
    (0.2, 0.6, 0.2),
    (0.2, 0.2, 0.6),
)
"""Deterministic sample pattern used inside each triangle face."""

DEFAULT_UNDERCUT_POTENTIAL_BLOCKED_RATIO_THRESHOLD = 0.25
"""Minimum blocked-sample ratio treated as preliminary undercut evidence."""

DEFAULT_UNDERCUT_CONFIRMED_BLOCKED_RATIO_THRESHOLD = 0.75
"""Minimum blocked-sample ratio treated as confirmed preliminary evidence."""

DEFAULT_UNDERCUT_MINIMUM_MEANINGFUL_REGION_AREA_SQ_MM = 1e-6
"""Absolute area floor below which a region is treated as tiny."""

DEFAULT_UNDERCUT_MINIMUM_MEANINGFUL_REGION_AREA_RATIO = 0.005
"""Relative area floor below which a region is treated as tiny."""

DEFAULT_UNDERCUT_AMBIGUITY_TOLERANCE = 0.25
"""Maximum ambiguous-sample ratio allowed before confidence is reduced heavily."""

DEFAULT_UNDERCUT_LOW_CONFIDENCE_THRESHOLD = 0.4
"""Lower confidence threshold used when grading region severity."""

DEFAULT_UNDERCUT_HIGH_CONFIDENCE_THRESHOLD = 0.8
"""Higher confidence threshold used when grading region severity."""

DEFAULT_UNDERCUT_MEDIUM_SEVERITY_REGION_AREA_RATIO = 0.03
"""Area-ratio threshold above which confirmed regions escalate beyond low severity."""

DEFAULT_UNDERCUT_HIGH_SEVERITY_REGION_AREA_RATIO = 0.15
"""Area-ratio threshold above which confirmed regions become high severity."""

DEFAULT_UNDERCUT_REGION_ORTHOGONAL_BASIS_MINIMUM_MAGNITUDE = 1e-9
"""Minimum cross-product magnitude accepted while building a stable local basis."""

DEFAULT_UNDERCUT_REGION_MINIMUM_CENTROID_FACE_AREA_SQ_MM = 1e-9
"""Minimum face area allowed to contribute to a region weighted centroid."""

DEFAULT_UNDERCUT_REGION_ID_PREFIX = "undercut-region"
"""Stable prefix used when assigning deterministic connected-region identifiers."""

DEFAULT_UNDERCUT_REGION_ID_ZERO_PADDING = 4
"""Zero-padding applied to deterministic connected-region identifiers."""

DEFAULT_UNDERCUT_RISK_MINIMUM_AREA_FOR_RATIO_ESCALATION_SQ_MM = 25.0
"""Minimum absolute region area before area ratio can escalate risk."""

DEFAULT_UNDERCUT_RISK_MEDIUM_REGION_AREA_SQ_MM = 25.0
"""Absolute region area threshold for medium risk escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_REGION_AREA_SQ_MM = 100.0
"""Absolute region area threshold for high risk escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_REGION_AREA_SQ_MM = 400.0
"""Absolute region area threshold for critical risk escalation."""

DEFAULT_UNDERCUT_RISK_MEDIUM_REGION_AREA_RATIO = 0.05
"""Relative area threshold for medium risk escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_REGION_AREA_RATIO = 0.15
"""Relative area threshold for high risk escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_REGION_AREA_RATIO = 0.35
"""Relative area threshold for critical risk escalation."""

DEFAULT_UNDERCUT_RISK_MEDIUM_FACE_COUNT = 3
"""Confirmed-face threshold for medium risk or complexity escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_FACE_COUNT = 8
"""Confirmed-face threshold for high risk or complexity escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_FACE_COUNT = 20
"""Confirmed-face threshold for critical risk escalation."""

DEFAULT_UNDERCUT_RISK_MEDIUM_BOUNDARY_EDGE_COUNT = 4
"""Boundary-edge threshold for moderate region complexity escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_BOUNDARY_EDGE_COUNT = 8
"""Boundary-edge threshold for complex region escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_BOUNDARY_EDGE_COUNT = 16
"""Boundary-edge threshold for highly complex region escalation."""

DEFAULT_UNDERCUT_RISK_MEDIUM_AXIAL_EXTENT_MM = 1.0
"""Axial-depth threshold for medium risk escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_AXIAL_EXTENT_MM = 4.0
"""Axial-depth threshold for high risk escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_AXIAL_EXTENT_MM = 10.0
"""Axial-depth threshold for critical risk escalation."""

DEFAULT_UNDERCUT_RISK_MEDIUM_LATERAL_EXTENT_MM = 5.0
"""Lateral-span threshold for medium risk escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_LATERAL_EXTENT_MM = 15.0
"""Lateral-span threshold for high risk escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_LATERAL_EXTENT_MM = 40.0
"""Lateral-span threshold for critical risk escalation."""

DEFAULT_UNDERCUT_RISK_MEDIUM_NEGATIVE_DRAFT_DEGREES = 1.0
"""Reverse-draft threshold for medium risk escalation."""

DEFAULT_UNDERCUT_RISK_HIGH_NEGATIVE_DRAFT_DEGREES = 4.0
"""Reverse-draft threshold for high risk escalation."""

DEFAULT_UNDERCUT_RISK_CRITICAL_NEGATIVE_DRAFT_DEGREES = 8.0
"""Reverse-draft threshold for critical risk escalation."""

DEFAULT_UNDERCUT_RISK_MANUAL_REVIEW_CONFIDENCE_THRESHOLD = 0.5
"""Confidence floor below which automated treatment becomes manual-review only."""

DEFAULT_UNDERCUT_RISK_MEDIUM_SEVERITY_SCORE = 3
"""Score threshold mapped to medium undercut risk severity."""

DEFAULT_UNDERCUT_RISK_HIGH_SEVERITY_SCORE = 6
"""Score threshold mapped to high undercut risk severity."""

DEFAULT_UNDERCUT_RISK_CRITICAL_SEVERITY_SCORE = 9
"""Score threshold mapped to critical undercut risk severity."""

DEFAULT_UNDERCUT_RISK_MODERATE_COMPLEXITY_SCORE = 3
"""Score threshold mapped to moderate geometric complexity."""

DEFAULT_UNDERCUT_RISK_COMPLEX_COMPLEXITY_SCORE = 5
"""Score threshold mapped to complex geometric complexity."""

DEFAULT_UNDERCUT_RISK_HIGHLY_COMPLEX_SCORE = 7
"""Score threshold mapped to highly complex geometric complexity."""


@dataclass(frozen=True, slots=True)
class UndercutAnalysisSettings:
    """Central thresholds used by the preliminary undercut detector."""

    surface_offset_scale: float = DEFAULT_UNDERCUT_SURFACE_OFFSET_SCALE
    ray_intersection_scale: float = DEFAULT_UNDERCUT_RAY_INTERSECTION_SCALE
    numeric_ambiguity_scale: float = DEFAULT_UNDERCUT_NUMERIC_AMBIGUITY_SCALE
    sample_barycentric_coordinates: tuple[
        tuple[float, float, float],
        ...,
    ] = DEFAULT_UNDERCUT_SAMPLE_BARYCENTRIC_COORDINATES
    potential_blocked_ratio_threshold: float = (
        DEFAULT_UNDERCUT_POTENTIAL_BLOCKED_RATIO_THRESHOLD
    )
    confirmed_blocked_ratio_threshold: float = (
        DEFAULT_UNDERCUT_CONFIRMED_BLOCKED_RATIO_THRESHOLD
    )
    minimum_meaningful_region_area_sq_mm: float = (
        DEFAULT_UNDERCUT_MINIMUM_MEANINGFUL_REGION_AREA_SQ_MM
    )
    minimum_meaningful_region_area_ratio: float = (
        DEFAULT_UNDERCUT_MINIMUM_MEANINGFUL_REGION_AREA_RATIO
    )
    ambiguity_tolerance: float = DEFAULT_UNDERCUT_AMBIGUITY_TOLERANCE
    low_confidence_threshold: float = DEFAULT_UNDERCUT_LOW_CONFIDENCE_THRESHOLD
    high_confidence_threshold: float = DEFAULT_UNDERCUT_HIGH_CONFIDENCE_THRESHOLD
    medium_severity_region_area_ratio: float = (
        DEFAULT_UNDERCUT_MEDIUM_SEVERITY_REGION_AREA_RATIO
    )
    high_severity_region_area_ratio: float = (
        DEFAULT_UNDERCUT_HIGH_SEVERITY_REGION_AREA_RATIO
    )

    def __post_init__(self) -> None:
        _validate_positive_finite("surface_offset_scale", self.surface_offset_scale)
        _validate_positive_finite(
            "ray_intersection_scale",
            self.ray_intersection_scale,
        )
        _validate_positive_finite(
            "numeric_ambiguity_scale",
            self.numeric_ambiguity_scale,
        )
        _validate_probability(
            "potential_blocked_ratio_threshold",
            self.potential_blocked_ratio_threshold,
        )
        _validate_probability(
            "confirmed_blocked_ratio_threshold",
            self.confirmed_blocked_ratio_threshold,
        )
        _validate_non_negative_finite(
            "minimum_meaningful_region_area_sq_mm",
            self.minimum_meaningful_region_area_sq_mm,
        )
        _validate_probability(
            "minimum_meaningful_region_area_ratio",
            self.minimum_meaningful_region_area_ratio,
        )
        _validate_probability("ambiguity_tolerance", self.ambiguity_tolerance)
        _validate_probability(
            "low_confidence_threshold",
            self.low_confidence_threshold,
        )
        _validate_probability(
            "high_confidence_threshold",
            self.high_confidence_threshold,
        )
        _validate_probability(
            "medium_severity_region_area_ratio",
            self.medium_severity_region_area_ratio,
        )
        _validate_probability(
            "high_severity_region_area_ratio",
            self.high_severity_region_area_ratio,
        )

        if (
            self.confirmed_blocked_ratio_threshold
            < self.potential_blocked_ratio_threshold
        ):
            raise ValueError(
                "Confirmed blocked-ratio threshold must be greater than or equal to "
                "the potential threshold."
            )
        if self.high_confidence_threshold < self.low_confidence_threshold:
            raise ValueError(
                "High confidence threshold must be greater than or equal to the "
                "low confidence threshold."
            )
        if (
            self.high_severity_region_area_ratio
            < self.medium_severity_region_area_ratio
        ):
            raise ValueError(
                "High severity area-ratio threshold must be greater than or equal to "
                "the medium threshold."
            )
        if not self.sample_barycentric_coordinates:
            raise ValueError("At least one undercut face sample must be configured.")

        for barycentric_coordinates in self.sample_barycentric_coordinates:
            if len(barycentric_coordinates) != 3:
                raise ValueError(
                    "Each undercut sample barycentric coordinate must have three "
                    "components."
                )

            if not all(isfinite(value) for value in barycentric_coordinates):
                raise ValueError(
                    "Undercut sample barycentric coordinates must be finite."
                )

            if not all(0.0 < value < 1.0 for value in barycentric_coordinates):
                raise ValueError(
                    "Undercut sample barycentric coordinates must stay strictly "
                    "inside the triangle."
                )

            if abs(sum(barycentric_coordinates) - 1.0) > 1e-9:
                raise ValueError(
                    "Undercut sample barycentric coordinates must sum to 1.0."
                )


@dataclass(frozen=True, slots=True)
class UndercutRegionAnalysisSettings:
    """Central thresholds and policies used by stage-7 region analysis."""

    orthogonal_basis_minimum_magnitude: float = (
        DEFAULT_UNDERCUT_REGION_ORTHOGONAL_BASIS_MINIMUM_MAGNITUDE
    )
    minimum_centroid_face_area_sq_mm: float = (
        DEFAULT_UNDERCUT_REGION_MINIMUM_CENTROID_FACE_AREA_SQ_MM
    )
    region_id_prefix: str = DEFAULT_UNDERCUT_REGION_ID_PREFIX
    region_id_zero_padding: int = DEFAULT_UNDERCUT_REGION_ID_ZERO_PADDING

    def __post_init__(self) -> None:
        _validate_positive_finite(
            "orthogonal_basis_minimum_magnitude",
            self.orthogonal_basis_minimum_magnitude,
        )
        _validate_non_negative_finite(
            "minimum_centroid_face_area_sq_mm",
            self.minimum_centroid_face_area_sq_mm,
        )
        if not self.region_id_prefix:
            raise ValueError("region_id_prefix must not be empty.")
        if self.region_id_zero_padding <= 0:
            raise ValueError("region_id_zero_padding must be greater than zero.")


@dataclass(frozen=True, slots=True)
class UndercutRiskAssessmentSettings:
    """Central thresholds and policies used by stage-8/9 undercut assessment."""

    minimum_area_for_ratio_escalation_sq_mm: float = (
        DEFAULT_UNDERCUT_RISK_MINIMUM_AREA_FOR_RATIO_ESCALATION_SQ_MM
    )
    medium_region_area_sq_mm: float = DEFAULT_UNDERCUT_RISK_MEDIUM_REGION_AREA_SQ_MM
    high_region_area_sq_mm: float = DEFAULT_UNDERCUT_RISK_HIGH_REGION_AREA_SQ_MM
    critical_region_area_sq_mm: float = DEFAULT_UNDERCUT_RISK_CRITICAL_REGION_AREA_SQ_MM
    medium_region_area_ratio: float = DEFAULT_UNDERCUT_RISK_MEDIUM_REGION_AREA_RATIO
    high_region_area_ratio: float = DEFAULT_UNDERCUT_RISK_HIGH_REGION_AREA_RATIO
    critical_region_area_ratio: float = DEFAULT_UNDERCUT_RISK_CRITICAL_REGION_AREA_RATIO
    medium_face_count: int = DEFAULT_UNDERCUT_RISK_MEDIUM_FACE_COUNT
    high_face_count: int = DEFAULT_UNDERCUT_RISK_HIGH_FACE_COUNT
    critical_face_count: int = DEFAULT_UNDERCUT_RISK_CRITICAL_FACE_COUNT
    medium_boundary_edge_count: int = DEFAULT_UNDERCUT_RISK_MEDIUM_BOUNDARY_EDGE_COUNT
    high_boundary_edge_count: int = DEFAULT_UNDERCUT_RISK_HIGH_BOUNDARY_EDGE_COUNT
    critical_boundary_edge_count: int = (
        DEFAULT_UNDERCUT_RISK_CRITICAL_BOUNDARY_EDGE_COUNT
    )
    medium_axial_extent_mm: float = DEFAULT_UNDERCUT_RISK_MEDIUM_AXIAL_EXTENT_MM
    high_axial_extent_mm: float = DEFAULT_UNDERCUT_RISK_HIGH_AXIAL_EXTENT_MM
    critical_axial_extent_mm: float = DEFAULT_UNDERCUT_RISK_CRITICAL_AXIAL_EXTENT_MM
    medium_lateral_extent_mm: float = DEFAULT_UNDERCUT_RISK_MEDIUM_LATERAL_EXTENT_MM
    high_lateral_extent_mm: float = DEFAULT_UNDERCUT_RISK_HIGH_LATERAL_EXTENT_MM
    critical_lateral_extent_mm: float = DEFAULT_UNDERCUT_RISK_CRITICAL_LATERAL_EXTENT_MM
    medium_negative_draft_degrees: float = (
        DEFAULT_UNDERCUT_RISK_MEDIUM_NEGATIVE_DRAFT_DEGREES
    )
    high_negative_draft_degrees: float = (
        DEFAULT_UNDERCUT_RISK_HIGH_NEGATIVE_DRAFT_DEGREES
    )
    critical_negative_draft_degrees: float = (
        DEFAULT_UNDERCUT_RISK_CRITICAL_NEGATIVE_DRAFT_DEGREES
    )
    manual_review_confidence_threshold: float = (
        DEFAULT_UNDERCUT_RISK_MANUAL_REVIEW_CONFIDENCE_THRESHOLD
    )
    medium_severity_score: int = DEFAULT_UNDERCUT_RISK_MEDIUM_SEVERITY_SCORE
    high_severity_score: int = DEFAULT_UNDERCUT_RISK_HIGH_SEVERITY_SCORE
    critical_severity_score: int = DEFAULT_UNDERCUT_RISK_CRITICAL_SEVERITY_SCORE
    moderate_complexity_score: int = DEFAULT_UNDERCUT_RISK_MODERATE_COMPLEXITY_SCORE
    complex_complexity_score: int = DEFAULT_UNDERCUT_RISK_COMPLEX_COMPLEXITY_SCORE
    highly_complex_score: int = DEFAULT_UNDERCUT_RISK_HIGHLY_COMPLEX_SCORE

    def __post_init__(self) -> None:
        _validate_non_negative_finite(
            "minimum_area_for_ratio_escalation_sq_mm",
            self.minimum_area_for_ratio_escalation_sq_mm,
        )
        _validate_non_negative_finite(
            "medium_region_area_sq_mm",
            self.medium_region_area_sq_mm,
        )
        _validate_non_negative_finite(
            "high_region_area_sq_mm",
            self.high_region_area_sq_mm,
        )
        _validate_non_negative_finite(
            "critical_region_area_sq_mm",
            self.critical_region_area_sq_mm,
        )
        _validate_probability(
            "medium_region_area_ratio",
            self.medium_region_area_ratio,
        )
        _validate_probability(
            "high_region_area_ratio",
            self.high_region_area_ratio,
        )
        _validate_probability(
            "critical_region_area_ratio",
            self.critical_region_area_ratio,
        )
        _validate_positive_int("medium_face_count", self.medium_face_count)
        _validate_positive_int("high_face_count", self.high_face_count)
        _validate_positive_int("critical_face_count", self.critical_face_count)
        _validate_positive_int(
            "medium_boundary_edge_count",
            self.medium_boundary_edge_count,
        )
        _validate_positive_int(
            "high_boundary_edge_count",
            self.high_boundary_edge_count,
        )
        _validate_positive_int(
            "critical_boundary_edge_count",
            self.critical_boundary_edge_count,
        )
        _validate_non_negative_finite(
            "medium_axial_extent_mm",
            self.medium_axial_extent_mm,
        )
        _validate_non_negative_finite(
            "high_axial_extent_mm",
            self.high_axial_extent_mm,
        )
        _validate_non_negative_finite(
            "critical_axial_extent_mm",
            self.critical_axial_extent_mm,
        )
        _validate_non_negative_finite(
            "medium_lateral_extent_mm",
            self.medium_lateral_extent_mm,
        )
        _validate_non_negative_finite(
            "high_lateral_extent_mm",
            self.high_lateral_extent_mm,
        )
        _validate_non_negative_finite(
            "critical_lateral_extent_mm",
            self.critical_lateral_extent_mm,
        )
        _validate_non_negative_finite(
            "medium_negative_draft_degrees",
            self.medium_negative_draft_degrees,
        )
        _validate_non_negative_finite(
            "high_negative_draft_degrees",
            self.high_negative_draft_degrees,
        )
        _validate_non_negative_finite(
            "critical_negative_draft_degrees",
            self.critical_negative_draft_degrees,
        )
        _validate_probability(
            "manual_review_confidence_threshold",
            self.manual_review_confidence_threshold,
        )
        _validate_non_negative_int(
            "medium_severity_score",
            self.medium_severity_score,
        )
        _validate_non_negative_int("high_severity_score", self.high_severity_score)
        _validate_non_negative_int(
            "critical_severity_score",
            self.critical_severity_score,
        )
        _validate_non_negative_int(
            "moderate_complexity_score",
            self.moderate_complexity_score,
        )
        _validate_non_negative_int(
            "complex_complexity_score",
            self.complex_complexity_score,
        )
        _validate_non_negative_int("highly_complex_score", self.highly_complex_score)

        _validate_ascending_thresholds(
            "region area thresholds",
            (
                self.medium_region_area_sq_mm,
                self.high_region_area_sq_mm,
                self.critical_region_area_sq_mm,
            ),
        )
        _validate_ascending_thresholds(
            "region area-ratio thresholds",
            (
                self.medium_region_area_ratio,
                self.high_region_area_ratio,
                self.critical_region_area_ratio,
            ),
        )
        _validate_ascending_thresholds(
            "face-count thresholds",
            (
                float(self.medium_face_count),
                float(self.high_face_count),
                float(self.critical_face_count),
            ),
        )
        _validate_ascending_thresholds(
            "boundary-edge thresholds",
            (
                float(self.medium_boundary_edge_count),
                float(self.high_boundary_edge_count),
                float(self.critical_boundary_edge_count),
            ),
        )
        _validate_ascending_thresholds(
            "axial-extent thresholds",
            (
                self.medium_axial_extent_mm,
                self.high_axial_extent_mm,
                self.critical_axial_extent_mm,
            ),
        )
        _validate_ascending_thresholds(
            "lateral-extent thresholds",
            (
                self.medium_lateral_extent_mm,
                self.high_lateral_extent_mm,
                self.critical_lateral_extent_mm,
            ),
        )
        _validate_ascending_thresholds(
            "negative-draft thresholds",
            (
                self.medium_negative_draft_degrees,
                self.high_negative_draft_degrees,
                self.critical_negative_draft_degrees,
            ),
        )
        _validate_ascending_thresholds(
            "severity score thresholds",
            (
                float(self.medium_severity_score),
                float(self.high_severity_score),
                float(self.critical_severity_score),
            ),
        )
        _validate_ascending_thresholds(
            "complexity score thresholds",
            (
                float(self.moderate_complexity_score),
                float(self.complex_complexity_score),
                float(self.highly_complex_score),
            ),
        )


def _validate_positive_finite(name: str, value: float) -> None:
    if not isfinite(value):
        raise ValueError(f"{name} must be finite.")
    if value <= 0.0:
        raise ValueError(f"{name} must be greater than zero.")


def _validate_non_negative_finite(name: str, value: float) -> None:
    if not isfinite(value):
        raise ValueError(f"{name} must be finite.")
    if value < 0.0:
        raise ValueError(f"{name} cannot be negative.")


def _validate_probability(name: str, value: float) -> None:
    if not isfinite(value):
        raise ValueError(f"{name} must be finite.")
    if value < 0.0 or value > 1.0:
        raise ValueError(f"{name} must be between 0.0 and 1.0.")


def _validate_positive_int(name: str, value: int) -> None:
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero.")


def _validate_non_negative_int(name: str, value: int) -> None:
    if value < 0:
        raise ValueError(f"{name} cannot be negative.")


def _validate_ascending_thresholds(name: str, values: tuple[float, ...]) -> None:
    for index in range(1, len(values)):
        if values[index] < values[index - 1]:
            raise ValueError(f"{name} must be monotonically non-decreasing.")
