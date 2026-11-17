"""Writes native/tests/fixtures/models/bracket.stl: a closed L-shaped bracket
(extruded concave profile, 12 mm tall), binary STL, millimeters, outward winding.
Deterministic; rerun to regenerate."""

import struct
import sys
from pathlib import Path

profile = [(0, 0), (40, 0), (40, 10), (10, 10), (10, 30), (0, 30)]  # CCW
height = 12.0
cap = [(0, 1, 2), (0, 2, 3), (0, 3, 4), (0, 4, 5)]

tris = []
for a, b, c in cap:
    tris.append([(*profile[a], height), (*profile[b], height), (*profile[c], height)])  # top, +Z
    tris.append([(*profile[a], 0), (*profile[c], 0), (*profile[b], 0)])  # bottom, -Z
n = len(profile)
for i in range(n):
    (x0, y0), (x1, y1) = profile[i], profile[(i + 1) % n]
    tris.append([(x0, y0, 0), (x1, y1, 0), (x1, y1, height)])
    tris.append([(x0, y0, 0), (x1, y1, height), (x0, y0, height)])

out = Path(sys.argv[1])
out.parent.mkdir(parents=True, exist_ok=True)
with out.open("wb") as f:
    f.write(b"Craft bracket fixture; mm; Z-up".ljust(80, b"\0"))
    f.write(struct.pack("<I", len(tris)))
    for t in tris:
        f.write(struct.pack("<3f", 0, 0, 0))
        for v in t:
            f.write(struct.pack("<3f", *v))
        f.write(b"\0\0")
print(f"wrote {out} ({len(tris)} triangles)")
