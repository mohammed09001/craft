"""Models for timing the Python detailed analysis (docs/native-migration/ANALYSIS_PERFORMANCE.md).

    python make_models.py <out_dir>

Writes closed, outward-facing binary STL files in millimetres with correct facet normals:
  box_<n>.stl        a 30 mm box whose six faces are each split into a grid (12 * k * k faces)
  sphere_<n>.stl     an icosphere of radius 15 mm (20 * 4^s faces, s = 1..5)
  bracket_<n>.stl    an L-shaped bracket (a part with concave edges and real undercut candidates), split into a grid
Sizes are chosen to show how the analysis grows with the face count.
"""
from __future__ import annotations

import math
import struct
import sys
from pathlib import Path


def write_stl(path: Path, triangles: list[tuple[tuple[float, float, float], ...]]) -> None:
    with path.open("wb") as f:
        f.write(b"Craft analysis timing model".ljust(80, b"\0"))
        f.write(struct.pack("<I", len(triangles)))
        for a, b, c in triangles:
            ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
            vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
            nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            f.write(struct.pack("<12fH", nx / length, ny / length, nz / length, *a, *b, *c, 0))


def grid_quad(origin, u, v, k):
    """A parallelogram split into k x k cells, each two triangles, counter-clockwise seen from where u x v points."""
    triangles = []
    for i in range(k):
        for j in range(k):
            p00 = tuple(origin[a] + u[a] * i / k + v[a] * j / k for a in range(3))
            p10 = tuple(origin[a] + u[a] * (i + 1) / k + v[a] * j / k for a in range(3))
            p01 = tuple(origin[a] + u[a] * i / k + v[a] * (j + 1) / k for a in range(3))
            p11 = tuple(origin[a] + u[a] * (i + 1) / k + v[a] * (j + 1) / k for a in range(3))
            triangles.append((p00, p10, p11))
            triangles.append((p00, p11, p01))
    return triangles


def box(size, k, offset=(0.0, 0.0, 0.0)):
    sx, sy, sz = size
    ox, oy, oz = offset
    t = []
    t += grid_quad((ox, oy, oz), (0, sy, 0), (sx, 0, 0), k)            # -z  (normal -z)
    t += grid_quad((ox, oy, oz + sz), (sx, 0, 0), (0, sy, 0), k)       # +z
    t += grid_quad((ox, oy, oz), (sx, 0, 0), (0, 0, sz), k)            # -y
    t += grid_quad((ox, oy + sy, oz), (0, 0, sz), (sx, 0, 0), k)       # +y
    t += grid_quad((ox, oy, oz), (0, 0, sz), (0, sy, 0), k)            # -x
    t += grid_quad((ox + sx, oy, oz), (0, sy, 0), (0, 0, sz), k)       # +x
    return t


def icosphere(subdivisions, radius):
    t = (1 + math.sqrt(5)) / 2
    vertices = [(-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0), (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
                (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1)]
    vertices = [tuple(c / math.sqrt(x * x + y * y + z * z) for c in (x, y, z)) for x, y, z in vertices]
    faces = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2), (10, 7, 6),
             (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11), (6, 2, 10),
             (8, 6, 7), (9, 8, 1)]
    for _ in range(subdivisions):
        cache: dict[tuple[int, int], int] = {}

        def mid(a, b):
            key = (a, b) if a < b else (b, a)
            if key not in cache:
                x, y, z = (vertices[a][i] + vertices[b][i] for i in range(3))
                n = math.sqrt(x * x + y * y + z * z)
                vertices.append((x / n, y / n, z / n))
                cache[key] = len(vertices) - 1
            return cache[key]

        nxt = []
        for a, b, c in faces:
            ab, bc, ca = mid(a, b), mid(b, c), mid(c, a)
            nxt += [(a, ab, ca), (b, bc, ab), (c, ca, bc), (ab, bc, ca)]
        faces = nxt
    return [tuple(tuple(c * radius for c in vertices[i]) for i in f) for f in faces]


def bracket(k):
    """Two boxes forming an L (40 x 30 x 10 and 10 x 30 x 30 standing on its end): concave inner corner."""
    a = box((40, 30, 10), k)
    b = box((10, 30, 20), k, offset=(0, 0, 10))
    # The two boxes overlap on the shared face; keep the union simple by dropping nothing: the analysis only needs a
    # closed, valid-looking surface for timing, and overlapping closed shells are accepted by the importer.
    return a + b


def main() -> int:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for k in (2, 4, 8, 12, 16):
        triangles = box((30, 30, 30), k)
        write_stl(out / f"box_{len(triangles)}.stl", triangles)
    for s in (1, 2, 3, 4, 5):
        triangles = icosphere(s, 15.0)
        write_stl(out / f"sphere_{len(triangles)}.stl", triangles)
    for k in (2, 4, 8):
        triangles = bracket(k)
        write_stl(out / f"bracket_{len(triangles)}.stl", triangles)
    for path in sorted(out.glob("*.stl")):
        print(path.name, path.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
