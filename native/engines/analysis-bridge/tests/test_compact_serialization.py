"""The worker's one-pass compact serialization must equal the engine's to_dict followed by the compaction.

    python -m pytest native/engines/analysis-bridge/tests -q       (from the repository root, with the engine's venv)

``serialize_compact`` exists so the per-face lists (millions of dicts for a smooth mesh) are never built just to be dropped.
Every test here builds real engine reports and checks the result against the two-step version: the same dict, the same key order
(compared as JSON text), the same ``omitted`` counts in the same order.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(REPO / "mold" / "src"))
sys.path.insert(0, str(REPO / "native" / "engines" / "analysis-bridge" / "worker"))

import craft_analysis_worker as worker  # noqa: E402


def _write_stl(path: Path, triangles) -> None:
    with path.open("wb") as f:
        f.write(b"test".ljust(80, b"\0"))
        f.write(struct.pack("<I", len(triangles)))
        for a, b, c in triangles:
            u = [b[i] - a[i] for i in range(3)]
            v = [c[i] - a[i] for i in range(3)]
            n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            length = math.sqrt(sum(x * x for x in n)) or 1.0
            f.write(struct.pack("<12fH", *(x / length for x in n), *a, *b, *c, 0))


def _grid_quad(origin, u, v, k):
    out = []
    for i in range(k):
        for j in range(k):
            p = lambda s, t: tuple(origin[a] + u[a] * s / k + v[a] * t / k for a in range(3))  # noqa: E731
            out += [(p(i, j), p(i + 1, j), p(i + 1, j + 1)), (p(i, j), p(i + 1, j + 1), p(i, j + 1))]
    return out


def _box(size, k):
    sx, sy, sz = size
    return (
        _grid_quad((0, 0, 0), (0, sy, 0), (sx, 0, 0), k) + _grid_quad((0, 0, sz), (sx, 0, 0), (0, sy, 0), k)
        + _grid_quad((0, 0, 0), (sx, 0, 0), (0, 0, sz), k) + _grid_quad((0, sy, 0), (0, 0, sz), (sx, 0, 0), k)
        + _grid_quad((0, 0, 0), (0, 0, sz), (0, sy, 0), k) + _grid_quad((sx, 0, 0), (0, sy, 0), (0, 0, sz), k)
    )


def _icosphere(subdivisions, radius):
    t = (1 + math.sqrt(5)) / 2
    pts = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t), (t, 0, -1),
           (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    pts = [tuple(c / math.sqrt(x * x + y * y + z * z) for c in (x, y, z)) for x, y, z in pts]
    tris = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
            (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10), (8, 6, 7),
            (9, 8, 1)]
    for _ in range(subdivisions):
        cache = {}

        def mid(a, b):
            key = (a, b) if a < b else (b, a)
            if key not in cache:
                x, y, z = (pts[a][i] + pts[b][i] for i in range(3))
                n = math.sqrt(x * x + y * y + z * z)
                pts.append((x / n, y / n, z / n))
                cache[key] = len(pts) - 1
            return cache[key]

        nxt = []
        for a, b, c in tris:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nxt += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        tris = nxt
    return [tuple(tuple(c * radius for c in pts[i]) for i in tri) for tri in tris]


def _reports(model_path: Path):
    """The detailed and cavity reports exactly as the worker's moldability job obtains them."""
    from mold_generator_engine import (
        CavityAnalysisService,
        DetailedMoldAnalysisService,
        ImportAnalysisService,
        PullDirectionEvaluator,
    )

    import_service = ImportAnalysisService.from_default_readers()
    import_report = import_service.analyze(model_path)
    model = import_service.importer.import_model(model_path)
    detailed = DetailedMoldAnalysisService(pull_direction_evaluator=PullDirectionEvaluator()).analyze(import_report, model)
    cavity = CavityAnalysisService().analyze(import_report, detailed, model)
    return detailed, cavity


@pytest.mark.parametrize(
    "name, triangles",
    [
        ("box_48", lambda: _box((30, 30, 30), 2)),
        ("box_192", lambda: _box((30, 20, 10), 4)),
        ("sphere_80", lambda: _icosphere(1, 15.0)),
        ("sphere_320", lambda: _icosphere(2, 15.0)),
    ],
)
def test_one_pass_serialization_equals_to_dict_then_compaction(tmp_path: Path, name: str, triangles) -> None:
    path = tmp_path / f"{name}.stl"
    _write_stl(path, triangles())
    detailed, cavity = _reports(path)

    for report in (detailed, cavity):
        two_step_omitted: dict[str, int] = {}
        one_pass_omitted: dict[str, int] = {}
        two_step = worker.compact_detailed_report(report.to_dict(), two_step_omitted)
        one_pass = worker.serialize_compact(report, one_pass_omitted)
        assert json.dumps(one_pass, sort_keys=False, allow_nan=True) == json.dumps(two_step, sort_keys=False, allow_nan=True)
        assert one_pass == two_step
        assert list(one_pass_omitted.items()) == list(two_step_omitted.items())   # same counts, same first-seen order


def test_not_keeping_the_face_evaluations_gives_the_same_compact_report(tmp_path: Path) -> None:
    """The worker tells the evaluator not to keep per-face evaluations; the report must come out exactly as if it had."""
    from mold_generator_engine import (
        CavityAnalysisService,
        DetailedMoldAnalysisService,
        ImportAnalysisService,
        PullDirectionEvaluator,
    )

    for name, triangles in (("box", _box((30, 20, 10), 4)), ("sphere", _icosphere(2, 15.0))):
        path = tmp_path / f"{name}.stl"
        _write_stl(path, triangles)
        import_service = ImportAnalysisService.from_default_readers()
        import_report = import_service.analyze(path)
        model = import_service.importer.import_model(path)
        kept = DetailedMoldAnalysisService(pull_direction_evaluator=PullDirectionEvaluator()).analyze(import_report, model)
        dropped = DetailedMoldAnalysisService(
            pull_direction_evaluator=PullDirectionEvaluator(retain_face_evaluations=False)).analyze(import_report, model)
        kept_omitted: dict[str, int] = {}
        dropped_omitted: dict[str, int] = {}
        a = worker.serialize_compact(kept, kept_omitted)
        b = worker.serialize_compact(dropped, dropped_omitted)
        assert json.dumps(a) == json.dumps(b), name
        assert list(kept_omitted.items()) == list(dropped_omitted.items())
        assert kept_omitted["face_evaluations"] > 0
        # the ranked candidates the native side reads are the same, scores included
        assert worker.ranked_pull_direction_candidates(kept) == worker.ranked_pull_direction_candidates(dropped)
        # and the stages built on the detailed report do not notice
        cavity_kept = CavityAnalysisService().analyze(import_report, kept, model)
        cavity_dropped = CavityAnalysisService().analyze(import_report, dropped, model)
        assert json.dumps(worker.serialize_compact(cavity_kept, {})) == json.dumps(worker.serialize_compact(cavity_dropped, {}))


def test_the_per_face_lists_really_are_omitted_and_counted(tmp_path: Path) -> None:
    path = tmp_path / "sphere.stl"
    _write_stl(path, _icosphere(1, 15.0))
    detailed, _ = _reports(path)
    omitted: dict[str, int] = {}
    compact = worker.serialize_compact(detailed, omitted)
    assert omitted.get("face_evaluations", 0) > 80          # one evaluation per face for every candidate
    text = json.dumps(compact)
    assert '"face_evaluations"' not in text and '"face_evaluationsCount"' in text


def test_the_rules_match_the_engines_serializer_on_awkward_values() -> None:
    from dataclasses import dataclass
    from enum import Enum

    class Colour(Enum):
        RED = "red"

    @dataclass
    class Inner:
        face_results: tuple[int, ...]
        label: str

    @dataclass
    class Outer:
        colour: Colour
        path: Path
        inner: tuple[Inner, ...]
        mapping: dict[object, object]
        face_assessments: object
        source_references: tuple[()]
        scalar: float

    value = Outer(
        colour=Colour.RED,
        path=Path("a/b.stl"),
        inner=(Inner(face_results=(1, 2, 3), label="x"), Inner(face_results=(), label="y")),
        mapping={Colour.RED: [1, 2], 7: {"face_evaluations": [1, 2, 3, 4], "kept": [5]}, "face_results": "not a list"},
        face_assessments="a string is not a list",
        source_references=(),
        scalar=float("nan"),
    )
    from mold_generator_engine.models.detailed_mold_analysis import _serialize_value

    two_step_omitted: dict[str, int] = {}
    one_pass_omitted: dict[str, int] = {}
    two_step = worker.compact_detailed_report(_serialize_value(value), two_step_omitted)
    one_pass = worker.serialize_compact(value, one_pass_omitted)
    assert json.dumps(one_pass, allow_nan=True) == json.dumps(two_step, allow_nan=True)
    assert list(one_pass_omitted.items()) == list(two_step_omitted.items())
    assert one_pass_omitted == {"face_results": 3, "face_evaluations": 4, "source_references": 0}
    assert one_pass["face_assessments"] == "a string is not a list"      # not a list: kept, as the compaction keeps it
    assert one_pass["mapping"]["face_results"] == "not a list"
