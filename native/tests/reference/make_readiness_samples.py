"""Writes real Python generation-readiness reports for the native equivalence tests.

Runs the existing, unmodified Python engine (import -> detailed mold analysis ->
cavity analysis -> generation readiness) on the repository's STL fixtures and on
generated closed boxes, and records each ``GenerationReadinessReport.to_dict()``.
The TypeScript reference adapter then turns the same dictionaries into snapshots
(craftReadinessReference.test.ts), and tst_reports_equivalence replays them
through the native port.

Usage: python make_readiness_samples.py <repo-root> <output.json>
"""

from __future__ import annotations

import json
import struct
import sys
import tempfile
from pathlib import Path


def closed_box(path: Path, k: int, size: float = 20.0) -> Path:
    triangles: list[tuple[tuple[float, float, float], ...]] = []

    def quad(a, b, c, d):
        triangles.append((a, b, c))
        triangles.append((a, c, d))

    for axis in range(3):
        for sign in (1, -1):
            for i in range(k):
                for j in range(k):
                    u0, u1 = -size + 2 * size * i / k, -size + 2 * size * (i + 1) / k
                    v0, v1 = -size + 2 * size * j / k, -size + 2 * size * (j + 1) / k

                    def point(u, v):
                        if axis == 0:
                            return (sign * size, u, v)
                        if axis == 1:
                            return (u, sign * size, v)
                        return (u, v, sign * size)

                    corners = (point(u0, v0), point(u1, v0), point(u1, v1), point(u0, v1))
                    if (sign > 0) == (axis != 1):
                        quad(*corners)
                    else:
                        quad(corners[0], corners[3], corners[2], corners[1])
    with open(path, "wb") as handle:
        handle.write(b"\0" * 80)
        handle.write(struct.pack("<I", len(triangles)))
        for triangle in triangles:
            handle.write(struct.pack("<3f", 0, 0, 0))
            for vertex in triangle:
                handle.write(struct.pack("<3f", *vertex))
            handle.write(b"\0\0")
    return path


def main() -> int:
    repo = Path(sys.argv[1])
    output = Path(sys.argv[2])
    sys.path.insert(0, str(repo / "mold" / "src"))

    from mold_generator_engine import (
        CavityAnalysisService,
        DetailedMoldAnalysisService,
        GenerationReadinessService,
        ImportAnalysisService,
        PullDirectionEvaluator,
    )

    fixtures = repo / "mold" / "tests" / "fixtures" / "models" / "stl"
    with tempfile.TemporaryDirectory() as scratch:
        sources = {
            "closed_tetrahedron": fixtures / "closed_tetrahedron_ascii.stl",
            "bracket": repo / "native" / "tests" / "fixtures" / "models" / "bracket.stl",
            "single_triangle_blocked": fixtures / "single_triangle_ascii.stl",
            "two_triangles_blocked": fixtures / "two_triangles_ascii.stl",
            "degenerate_face": fixtures / "degenerate_face_ascii.stl",
            "closed_box_4": closed_box(Path(scratch) / "box4.stl", 4),
            "closed_box_8": closed_box(Path(scratch) / "box8.stl", 8),
        }
        samples = []
        for name, path in sources.items():
            service = ImportAnalysisService.from_default_readers()
            import_report = service.analyze(path)
            try:
                model = service.importer.import_model(path)
            except Exception:  # noqa: BLE001 - an unimportable model has no readiness report
                continue
            detailed = DetailedMoldAnalysisService(pull_direction_evaluator=PullDirectionEvaluator()).analyze(
                import_report, model)
            cavity = CavityAnalysisService().analyze(import_report, detailed, model)
            readiness = GenerationReadinessService().analyze(import_report, detailed, cavity, model)
            samples.append({"name": name, "report": readiness.to_dict()})
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(samples, indent=1, allow_nan=False), encoding="utf-8")
    print(f"wrote {len(samples)} readiness samples to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
