from __future__ import annotations

import math

import pytest

from mold_generator_engine.exceptions import InvalidVectorError
from mold_generator_engine.geometry import Vector3D


def test_vector3d_supports_basic_vector_operations() -> None:
    left = Vector3D(1.0, 2.0, 3.0)
    right = Vector3D(-4.0, 5.0, 1.0)

    assert left + right == Vector3D(-3.0, 7.0, 4.0)
    assert left - right == Vector3D(5.0, -3.0, 2.0)
    assert left * 2.0 == Vector3D(2.0, 4.0, 6.0)
    assert 2.0 * left == Vector3D(2.0, 4.0, 6.0)
    assert -left == Vector3D(-1.0, -2.0, -3.0)
    assert left.dot(right) == 9.0
    assert left.cross(right) == Vector3D(-13.0, -13.0, 13.0)
    assert left.squared_magnitude() == 14.0
    assert math.isclose(left.magnitude(), math.sqrt(14.0))


def test_vector3d_normalizes_a_valid_direction() -> None:
    vector = Vector3D(0.0, 3.0, 4.0)

    normalized = vector.normalized()

    assert normalized.is_approximately_equal(Vector3D(0.0, 0.6, 0.8))
    assert math.isclose(normalized.magnitude(), 1.0)


def test_vector3d_rejects_zero_or_near_zero_vectors() -> None:
    with pytest.raises(InvalidVectorError):
        Vector3D(0.0, 0.0, 0.0).normalized()

    with pytest.raises(InvalidVectorError):
        Vector3D(1e-9, 0.0, 0.0).normalized()


def test_vector3d_rejects_nan_and_infinity() -> None:
    with pytest.raises(InvalidVectorError):
        Vector3D(math.nan, 0.0, 0.0).normalized()

    with pytest.raises(InvalidVectorError):
        Vector3D(math.inf, 0.0, 0.0).normalized()


def test_vector3d_canonical_keys_are_deterministic() -> None:
    vector = Vector3D(1.0, 0.0, 0.0)

    assert vector.canonical_key() == vector.canonical_key()
    assert vector.is_approximately_equal(Vector3D(1.0, 0.0, 0.0))
