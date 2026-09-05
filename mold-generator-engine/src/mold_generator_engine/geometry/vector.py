from __future__ import annotations

from dataclasses import dataclass
from math import isfinite, sqrt

from mold_generator_engine.config.geometry import (
    DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
    DEFAULT_LINEAR_TOLERANCE_MM,
)
from mold_generator_engine.exceptions import InvalidVectorError


@dataclass(frozen=True, slots=True)
class Vector3D:
    """Immutable 3D vector used by mold-analysis geometry routines."""

    x: float
    y: float
    z: float

    def __add__(self, other: Vector3D) -> Vector3D:
        return Vector3D(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: Vector3D) -> Vector3D:
        return Vector3D(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, scalar: float) -> Vector3D:
        return Vector3D(self.x * scalar, self.y * scalar, self.z * scalar)

    def __rmul__(self, scalar: float) -> Vector3D:
        return self * scalar

    def __neg__(self) -> Vector3D:
        return Vector3D(-self.x, -self.y, -self.z)

    def dot(self, other: Vector3D) -> float:
        """Return the scalar dot product with another vector."""
        return (self.x * other.x) + (self.y * other.y) + (self.z * other.z)

    def cross(self, other: Vector3D) -> Vector3D:
        """Return the vector cross product with another vector."""
        return Vector3D(
            (self.y * other.z) - (self.z * other.y),
            (self.z * other.x) - (self.x * other.z),
            (self.x * other.y) - (self.y * other.x),
        )

    def squared_magnitude(self) -> float:
        """Return the squared Euclidean magnitude."""
        return self.dot(self)

    def magnitude(self) -> float:
        """Return the Euclidean magnitude."""
        return sqrt(self.squared_magnitude())

    def is_finite(self) -> bool:
        """Return whether all vector components are finite real values."""
        return all(isfinite(component) for component in (self.x, self.y, self.z))

    def normalized(
        self,
        *,
        minimum_magnitude: float = DEFAULT_LINEAR_TOLERANCE_MM,
    ) -> Vector3D:
        """Return a unit vector or raise when normalization is unsafe."""
        if not self.is_finite():
            raise InvalidVectorError(
                "Cannot normalize a vector containing NaN or infinity."
            )

        magnitude = self.magnitude()
        if magnitude <= minimum_magnitude:
            raise InvalidVectorError(
                "Cannot normalize a zero-length or near-zero vector."
            )

        inverse_magnitude = 1.0 / magnitude
        return Vector3D(
            self.x * inverse_magnitude,
            self.y * inverse_magnitude,
            self.z * inverse_magnitude,
        )

    def is_approximately_equal(
        self,
        other: Vector3D,
        *,
        tolerance: float = DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
    ) -> bool:
        """Return whether two vectors match within a deterministic tolerance."""
        return (
            abs(self.x - other.x) <= tolerance
            and abs(self.y - other.y) <= tolerance
            and abs(self.z - other.z) <= tolerance
        )

    def canonical_key(
        self,
        *,
        tolerance: float = DEFAULT_DIRECTION_DEDUPLICATION_TOLERANCE,
    ) -> tuple[int, int, int]:
        """Return a deterministic integer key suitable for direction deduplication."""
        if tolerance <= 0.0:
            raise ValueError("Canonical vector keys require a positive tolerance.")

        if not self.is_finite():
            raise InvalidVectorError(
                "Cannot build a canonical key for a non-finite vector."
            )

        return (
            _quantize_component(self.x, tolerance),
            _quantize_component(self.y, tolerance),
            _quantize_component(self.z, tolerance),
        )


def _quantize_component(value: float, tolerance: float) -> int:
    scaled = value / tolerance
    if scaled >= 0.0:
        return int(scaled + 0.5)

    return int(scaled - 0.5)
